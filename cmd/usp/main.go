package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/nexaacs/nexaacs/internal/platform/config"
	"github.com/nexaacs/nexaacs/internal/platform/logger"
	"github.com/nexaacs/nexaacs/internal/protocol/usp/controller"
)

func main() {
	cfgPath := flag.String("config", "configs/config.yaml", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		panic(err)
	}
	log := logger.New("nexaacs-usp", cfg.App.LogLevel)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ctrl := controller.New(cfg.USP.ControllerEndpointID, log)
	_ = ctrl

	log.Info("nexaacs-usp controller started",
		slog.String("endpoint_id", cfg.USP.ControllerEndpointID),
		slog.String("default_mtp", cfg.USP.DefaultMTP),
	)

	<-ctx.Done()
	log.Info("nexaacs-usp stopped")
}
