package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/nexaacs/nexaacs/internal/infrastructure/persistence/postgres"
	"github.com/nexaacs/nexaacs/internal/platform/config"
	"github.com/nexaacs/nexaacs/internal/platform/database"
	"github.com/nexaacs/nexaacs/internal/platform/logger"
	redisplatform "github.com/nexaacs/nexaacs/internal/platform/redis"
	"github.com/nexaacs/nexaacs/internal/platform/security"
	cwmpserver "github.com/nexaacs/nexaacs/internal/protocol/cwmp/server"
)

func main() {
	cfgPath := flag.String("config", "configs/config.yaml", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		panic(err)
	}
	log := logger.New("nexaacs-worker", cfg.App.LogLevel)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Connect(ctx, cfg.Database.DSN, cfg.Database.MaxConns, cfg.Database.MinConns)
	if err != nil {
		log.Error("database connection failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer pool.Close()

	rdb, err := redisplatform.Connect(ctx, cfg.Redis.Addr, cfg.Redis.Password, cfg.Redis.DB)
	if err != nil {
		log.Warn("redis unavailable at startup; falling back to PostgreSQL task polling", slog.String("error", err.Error()))
	} else {
		defer func() { _ = rdb.Close() }()
	}

	store := postgres.NewStore(pool)
	cwmpCli := cwmpserver.New(&cfg.CWMP, log, store)
	cipher, _ := security.NewSecretCipherFromHex(cfg.API.SecretMasterKeyHex)

	pollInterval := time.Duration(cfg.Worker.PollIntervalSeconds) * time.Second
	if pollInterval <= 0 {
		pollInterval = 2 * time.Second
	}
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	crConcurrency := cfg.Worker.Concurrency
	if crConcurrency <= 0 {
		crConcurrency = 16
	}
	var attemptMu sync.Mutex
	lastAttemptByDevice := make(map[uuid.UUID]time.Time)
	crCooldownUntil := make(map[uuid.UUID]time.Time)
	lastFailedTaskByDevice := make(map[uuid.UUID]uuid.UUID)
	var lastPruneAt time.Time
	var lastSummonPruneAt time.Time
	var lastReapAt time.Time
	log.Info("nexaacs-worker running", slog.Int("concurrency", cfg.Worker.Concurrency))

	for {
		select {
		case <-ctx.Done():
			log.Info("nexaacs-worker stopped")
			return
		case <-ticker.C:
			rt := store.LoadRuntimeSettings(ctx, postgres.DefaultTenantID, cfg)
			crTimeout := time.Duration(rt.ConnectionRequestTimeoutSeconds) * time.Second
			if crTimeout <= 0 {
				crTimeout = 10 * time.Second
			}
			if time.Since(lastPruneAt) >= time.Hour {
				store.PruneExpiredTelemetry(ctx, postgres.DefaultTenantID, rt.RetentionDays)
				if prunedFaults := store.PruneOldFaults(ctx, postgres.DefaultTenantID, 24*time.Hour); prunedFaults > 0 {
					log.Info("pruned old faults", slog.Int64("deleted", prunedFaults), slog.String("keep", "24h"))
				}
				lastPruneAt = time.Now()
			}
			if time.Since(lastSummonPruneAt) >= 10*time.Minute {
				if deleted := store.PruneFinishedSummonTasks(ctx, postgres.DefaultTenantID, time.Hour); deleted > 0 {
					log.Info("pruned old summon task history", slog.Int64("deleted", deleted), slog.String("keep", "1h"))
				}
				lastSummonPruneAt = time.Now()
			}
			if time.Since(lastReapAt) >= time.Minute {
				if reaped := store.ReapStaleSummonTasks(ctx, postgres.DefaultTenantID, 10*time.Minute); reaped > 0 {
					log.Warn("marked stale summon tasks as timeout", slog.Int64("count", reaped))
				}
				lastReapAt = time.Now()
			}

			// 1. Trigger HTTP Connection Request on queued tasks concurrently via bounded worker pool
			candidates, err := store.ListPendingConnectionRequestTasks(ctx, cipher)
			if err == nil && len(candidates) > 0 {
				var wg sync.WaitGroup
				sem := make(chan struct{}, crConcurrency)
				for _, candidate := range candidates {
					item := candidate
					now := time.Now().UTC()
					attemptMu.Lock()
					if last, ok := lastAttemptByDevice[item.DeviceID]; ok && now.Sub(last) < 6*time.Second {
						attemptMu.Unlock()
						continue
					}
					if until, ok := crCooldownUntil[item.DeviceID]; ok && now.Before(until) && lastFailedTaskByDevice[item.DeviceID] == item.TaskID {
						attemptMu.Unlock()
						continue
					}
					lastAttemptByDevice[item.DeviceID] = now
					attemptMu.Unlock()

					creds := buildCRCredentialCandidates(item, cfg.CWMP.SharedUsername, cfg.CWMP.SharedPassword)

					wg.Add(1)
					sem <- struct{}{}
					go func() {
						defer wg.Done()
						defer func() { <-sem }()

						crCtx, cancel := context.WithTimeout(ctx, crTimeout)
						matchedCred, crErr := cwmpCli.TriggerConnectionRequestWithFallbacks(crCtx, item.ConnectionRequestURL, creds...)
						cancel()
						if crErr != nil {
							// Keep task as 'queued' so the CPE picks it up automatically on its next Periodic Inform
							// instead of failing immediately and spamming duplicate auto-summon tasks/faults.
							attemptMu.Lock()
							crCooldownUntil[item.DeviceID] = time.Now().UTC().Add(3 * time.Minute)
							lastFailedTaskByDevice[item.DeviceID] = item.TaskID
							attemptMu.Unlock()
							log.Warn("connection request deferred; waiting for next CPE inform",
								slog.String("serial", item.SerialNumber),
								slog.String("url", item.ConnectionRequestURL),
								slog.String("error", crErr.Error()),
							)
							return
						}

						attemptMu.Lock()
						delete(crCooldownUntil, item.DeviceID)
						delete(lastFailedTaskByDevice, item.DeviceID)
						attemptMu.Unlock()

						_, _ = pool.Exec(ctx, `UPDATE tasks SET status = 'waiting_for_device' WHERE id = $1 AND status = 'queued'`, item.TaskID)
						if matchedCred.Username != "" && (matchedCred.Username != item.Username || matchedCred.Password != item.Password) {
							_ = store.UpsertDeviceCredential(ctx, postgres.DefaultTenantID, item.DeviceID, "connection_request", matchedCred.Username, matchedCred.Password, cipher)
						}
						log.Info("connection request delivered", slog.String("serial", item.SerialNumber))
					}()
				}
				wg.Wait()
			}

			// 2. Mark expired waiting_for_device / executing leases as timeout
			_, _ = pool.Exec(ctx, `
				UPDATE tasks
				SET status = 'timeout', completed_at = NOW()
				WHERE status = 'waiting_for_device' AND scheduled_at < NOW() - INTERVAL '10 minutes'
			`)
		}
	}
}

func buildCRCredentialCandidates(item postgres.PendingCRTask, sharedUser, sharedPass string) []cwmpserver.CRCredential {
	var out []cwmpserver.CRCredential
	if item.Username != "" {
		out = append(out, cwmpserver.CRCredential{Username: item.Username, Password: item.Password})
	}
	if item.ReportedUsername != "" {
		if item.ReportedPassword != "" {
			out = append(out, cwmpserver.CRCredential{Username: item.ReportedUsername, Password: item.ReportedPassword})
		}
		if sharedPass != "" {
			out = append(out, cwmpserver.CRCredential{Username: item.ReportedUsername, Password: sharedPass})
		}
		out = append(out,
			cwmpserver.CRCredential{Username: item.ReportedUsername, Password: "admin"},
			cwmpserver.CRCredential{Username: item.ReportedUsername, Password: item.ReportedUsername},
			cwmpserver.CRCredential{Username: item.ReportedUsername, Password: "support"},
		)
	}
	if sharedUser != "" {
		out = append(out, cwmpserver.CRCredential{Username: sharedUser, Password: sharedPass})
	}
	out = append(out,
		cwmpserver.CRCredential{Username: "admin", Password: "admin"},
		cwmpserver.CRCredential{Username: "admin", Password: ""},
		cwmpserver.CRCredential{Username: "support", Password: "support"},
		cwmpserver.CRCredential{Username: "telecomadmin", Password: "admintelecom"},
		cwmpserver.CRCredential{Username: "telecomadmin", Password: "nE7jA%5m"},
		cwmpserver.CRCredential{Username: "CMCCAdmin", Password: "aDm8H%MdA"},
		cwmpserver.CRCredential{Username: "user", Password: "user"},
		cwmpserver.CRCredential{Username: "admin", Password: "password"},
		cwmpserver.CRCredential{Username: "admin", Password: "1234"},
	)
	return out
}
