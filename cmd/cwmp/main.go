package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/nexaacs/nexaacs/internal/infrastructure/persistence/postgres"
	"github.com/nexaacs/nexaacs/internal/platform/config"
	"github.com/nexaacs/nexaacs/internal/platform/database"
	"github.com/nexaacs/nexaacs/internal/platform/logger"
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
	log := logger.New("nexaacs-cwmp", cfg.App.LogLevel)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Connect(ctx, cfg.Database.DSN, cfg.Database.MaxConns, cfg.Database.MinConns)
	if err != nil {
		log.Error("database connection failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer pool.Close()

	var cipher *security.SecretCipher
	if cfg.API.SecretMasterKeyHex != "" {
		cipher, err = security.NewSecretCipherFromHex(cfg.API.SecretMasterKeyHex)
		if err != nil {
			log.Error("invalid NEXAACS_SECRET_MASTER_KEY", slog.String("error", err.Error()))
			os.Exit(1)
		}
	}
	store := postgres.NewStore(pool).WithCipher(cipher)
	cwmpHandler := cwmpserver.New(&cfg.CWMP, log, store)

	cwmpPath := "/" + strings.Trim(cfg.CWMP.Path, "/")
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	// Accept both root "/" (common on SkyACS/GenieACS CPE configs) and configured "/cwmp".
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != cwmpPath && r.URL.Path != cwmpPath+"/" {
			http.NotFound(w, r)
			return
		}
		cwmpHandler.ServeHTTP(w, r)
	})

	srv := &http.Server{
		Addr:        cfg.CWMP.ListenAddr,
		Handler:     mux,
		ReadTimeout: 30 * time.Second,
	}

	go func() {
		log.Info("nexaacs-cwmp listening", slog.String("addr", cfg.CWMP.ListenAddr), slog.String("path", cfg.CWMP.Path))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("cwmp server error", slog.String("error", err.Error()))
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Info("nexaacs-cwmp stopped")
}
