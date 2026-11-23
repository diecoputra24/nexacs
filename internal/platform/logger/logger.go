package logger

import (
	"log/slog"
	"os"
	"strings"
)

var sensitiveKeys = []string{
	"password",
	"passphrase",
	"secret",
	"token",
	"authorization",
	"keypassphrase",
	"presharedkey",
	"api_key",
}

// New creates a structured JSON slog logger with automatic secret key redaction.
func New(service string, level string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{
		Level: lvl,
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			lowerKey := strings.ToLower(a.Key)
			for _, s := range sensitiveKeys {
				if strings.Contains(lowerKey, s) {
					return slog.String(a.Key, "[REDACTED]")
				}
			}
			return a
		},
	}

	handler := slog.NewJSONHandler(os.Stdout, opts).WithAttrs([]slog.Attr{
		slog.String("service", service),
	})
	return slog.New(handler)
}

// SanitizeMessage strips common credential markers from fault or task logs before persistence.
func SanitizeMessage(msg string) string {
	replacer := strings.NewReplacer(
		"KeyPassphrase=", "KeyPassphrase=[REDACTED] ",
		"Password=", "Password=[REDACTED] ",
		"Authorization:", "Authorization: [REDACTED]",
	)
	return replacer.Replace(msg)
}
