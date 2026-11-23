package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	httpdelivery "github.com/nexaacs/nexaacs/internal/delivery/http"
	"github.com/nexaacs/nexaacs/internal/delivery/websocket"
	"github.com/nexaacs/nexaacs/internal/platform/config"
	"github.com/nexaacs/nexaacs/internal/platform/database"
	"github.com/nexaacs/nexaacs/internal/platform/logger"
)

func main() {
	cfgPath := flag.String("config", "configs/config.yaml", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		panic(err)
	}
	log := logger.New("nexaacs-api", cfg.App.LogLevel)
	if err := cfg.ValidateAPISecurity(); err != nil {
		log.Error("security configuration validation failed", slog.String("error", err.Error()))
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Connect(ctx, cfg.Database.DSN, cfg.Database.MaxConns, cfg.Database.MinConns)
	if err != nil {
		log.Error("database connection failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer pool.Close()

	if err := database.RunMigrations(ctx, pool); err != nil {
		log.Error("database migrations failed", slog.String("error", err.Error()))
		os.Exit(1)
	}

	fwDir := cfg.Storage.FirmwareDir
	if fwDir == "" {
		fwDir = "./data/firmware"
	}
	if err := os.MkdirAll(fwDir, 0o755); err != nil {
		fwDir = "./data/firmware"
		_ = os.MkdirAll(fwDir, 0o755)
	}
	cfg.Storage.FirmwareDir = fwDir

	hub := websocket.NewHub(log, cfg.API.CORSAllowedOrigins)
	handler := httpdelivery.NewRouter(cfg, log, pool, hub)

	srv := &http.Server{
		Addr:         cfg.API.ListenAddr,
		Handler:      handler,
		ReadTimeout:  time.Duration(cfg.API.ReadTimeoutSeconds) * time.Second,
		WriteTimeout: time.Duration(cfg.API.WriteTimeoutSeconds) * time.Second,
	}

	fsMux := http.NewServeMux()
	fsMux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	absFwDir, _ := filepath.Abs(fwDir)
	fsMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		cleanPath := strings.TrimPrefix(filepath.Clean("/"+r.URL.Path), "/")
		if cleanPath == "" || cleanPath == "." || strings.Contains(cleanPath, "/") || strings.Contains(cleanPath, "\\") {
			http.NotFound(w, r)
			return
		}
		fullPath := filepath.Join(absFwDir, cleanPath)
		if !strings.HasPrefix(fullPath, absFwDir+string(filepath.Separator)) {
			http.NotFound(w, r)
			return
		}
		info, err := os.Stat(fullPath)
		if err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, fullPath)
	})
	fsSrv := &http.Server{
		Addr:        cfg.Storage.FileServerListenAddr,
		Handler:     fsMux,
		ReadTimeout: 30 * time.Second,
	}

	go func() {
		log.Info("nexaacs-api listening", slog.String("addr", cfg.API.ListenAddr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("api server error", slog.String("error", err.Error()))
		}
	}()

	if cfg.Storage.FileServerListenAddr != "" {
		go func() {
			log.Info("nexaacs-fs listening", slog.String("addr", cfg.Storage.FileServerListenAddr), slog.String("dir", fwDir))
			if err := fsSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				log.Error("file server error", slog.String("error", err.Error()))
			}
		}()
	}

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	_ = fsSrv.Shutdown(shutdownCtx)
	log.Info("nexaacs-api stopped")
}
