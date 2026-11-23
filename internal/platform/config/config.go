package config

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/nexaacs/nexaacs/internal/platform/security"
	"gopkg.in/yaml.v3"
)

type Config struct {
	App        AppConfig        `yaml:"app"`
	API        APIConfig        `yaml:"api"`
	CWMP       CWMPConfig       `yaml:"cwmp"`
	USP        USPConfig        `yaml:"usp"`
	Worker     WorkerConfig     `yaml:"worker"`
	Database   DatabaseConfig   `yaml:"database"`
	Redis      RedisConfig      `yaml:"redis"`
	Storage    StorageConfig    `yaml:"storage"`
	Thresholds ThresholdsConfig `yaml:"thresholds"`
}

type AppConfig struct {
	Name        string `yaml:"name"`
	Environment string `yaml:"environment"`
	LogLevel    string `yaml:"log_level"`
	Timezone    string `yaml:"timezone"`
}

type APIConfig struct {
	ListenAddr          string   `yaml:"listen_addr"`
	CORSAllowedOrigins  []string `yaml:"cors_allowed_origins"`
	ReadTimeoutSeconds  int      `yaml:"read_timeout_seconds"`
	WriteTimeoutSeconds int      `yaml:"write_timeout_seconds"`
	JWTSigningKey       string   `yaml:"-"`
	SecretMasterKeyHex  string   `yaml:"-"`
}

type CWMPConfig struct {
	ListenAddr                      string `yaml:"listen_addr"`
	Path                            string `yaml:"path"`
	SessionTimeoutSeconds           int    `yaml:"session_timeout_seconds"`
	MaxBodyBytes                    int64  `yaml:"max_body_bytes"`
	AllowAutoEnroll                 bool   `yaml:"allow_auto_enroll"`
	ConnectionRequestTimeoutSeconds int    `yaml:"connection_request_timeout_seconds"`
	BlockPrivateSSRFTargets         bool   `yaml:"block_private_ssrf_targets"`
	SharedUsername                  string `yaml:"-"`
	SharedPassword                  string `yaml:"-"`
}

type USPConfig struct {
	ListenAddr           string `yaml:"listen_addr"`
	ControllerEndpointID string `yaml:"controller_endpoint_id"`
	DefaultMTP           string `yaml:"default_mtp"`
	MQTTBrokerURL        string `yaml:"mqtt_broker_url"`
	WebSocketPath        string `yaml:"websocket_path"`
	MessageExpirySeconds int    `yaml:"message_expiry_seconds"`
}

type WorkerConfig struct {
	Concurrency             int `yaml:"concurrency"`
	HeartbeatIntervalSecond int `yaml:"heartbeat_interval_seconds"`
	LeaseDurationSeconds    int `yaml:"lease_duration_seconds"`
	PollIntervalSeconds     int `yaml:"poll_interval_seconds"`
	MaxTaskRetries          int `yaml:"max_task_retries"`
}

type DatabaseConfig struct {
	DSN      string `yaml:"dsn"`
	MaxConns int32  `yaml:"max_conns"`
	MinConns int32  `yaml:"min_conns"`
}

type RedisConfig struct {
	Addr     string `yaml:"addr"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

type StorageConfig struct {
	FirmwareDir          string `yaml:"firmware_dir"`
	UploadsDir           string `yaml:"uploads_dir"`
	BackupsDir           string `yaml:"backups_dir"`
	FileServerListenAddr string `yaml:"file_server_listen_addr"`
	PublicFileURL        string `yaml:"public_file_url"`
}

type ThresholdsConfig struct {
	OnlineThresholdSeconds int     `yaml:"online_threshold_seconds"`
	TempWarningC           float64 `yaml:"temp_warning_c"`
	TempCriticalC          float64 `yaml:"temp_critical_c"`
	RXStrongMinDBM         float64 `yaml:"rx_strong_min_dbm"`
	RXGoodMinDBM           float64 `yaml:"rx_good_min_dbm"`
	RXAttentionMinDBM      float64 `yaml:"rx_attention_min_dbm"`
	RXWeakMinDBM           float64 `yaml:"rx_weak_min_dbm"`
}

func Default() *Config {
	return &Config{
		App: AppConfig{
			Name:        "NexaACS",
			Environment: "development",
			LogLevel:    "info",
			Timezone:    "Asia/Jakarta",
		},
		API: APIConfig{
			ListenAddr:          "127.0.0.1:7557",
			CORSAllowedOrigins:  []string{"http://localhost:8000", "http://localhost:5173"},
			ReadTimeoutSeconds:  15,
			WriteTimeoutSeconds: 30,
		},
		CWMP: CWMPConfig{
			ListenAddr:                      "0.0.0.0:7547",
			Path:                            "/cwmp",
			SessionTimeoutSeconds:           60,
			MaxBodyBytes:                    2 * 1024 * 1024,
			AllowAutoEnroll:                 true,
			ConnectionRequestTimeoutSeconds: 10,
			BlockPrivateSSRFTargets:         false,
		},
		USP: USPConfig{
			ListenAddr:           "127.0.0.1:8085",
			ControllerEndpointID: "proto::nexaacs-controller",
			DefaultMTP:           "mqtt",
			MQTTBrokerURL:        "tcp://127.0.0.1:1883",
			WebSocketPath:        "/usp",
			MessageExpirySeconds: 120,
		},
		Worker: WorkerConfig{
			Concurrency:             8,
			HeartbeatIntervalSecond: 10,
			LeaseDurationSeconds:    60,
			PollIntervalSeconds:     2,
			MaxTaskRetries:          3,
		},
		Database: DatabaseConfig{
			DSN:      "postgres://nexaacs@127.0.0.1:5432/nexaacs?sslmode=disable",
			MaxConns: 25,
			MinConns: 5,
		},
		Storage: StorageConfig{
			FirmwareDir:          "./data/firmware",
			UploadsDir:           "./data/uploads",
			BackupsDir:           "./data/backups",
			FileServerListenAddr: "0.0.0.0:7567",
		},
		Thresholds: ThresholdsConfig{
			OnlineThresholdSeconds: 1800,
			TempWarningC:           45.0,
			TempCriticalC:          55.0,
			RXStrongMinDBM:         -12.0,
			RXGoodMinDBM:           -20.0,
			RXAttentionMinDBM:      -24.0,
			RXWeakMinDBM:           -27.0,
		},
	}
}

func Load(path string) (*Config, error) {
	cfg := Default()

	if path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read config file %s: %w", path, err)
		}
		expanded := os.ExpandEnv(string(raw))
		if err := yaml.Unmarshal([]byte(expanded), cfg); err != nil {
			return nil, fmt.Errorf("parse config yaml: %w", err)
		}
	}

	if dsn := strings.TrimSpace(os.Getenv("NEXAACS_DB_DSN")); dsn != "" {
		cfg.Database.DSN = dsn
	}
	if addr := strings.TrimSpace(os.Getenv("NEXAACS_REDIS_ADDR")); addr != "" {
		cfg.Redis.Addr = addr
	}
	if pass := os.Getenv("NEXAACS_REDIS_PASSWORD"); pass != "" {
		cfg.Redis.Password = pass
	}
	if rawOrigins := strings.TrimSpace(os.Getenv("NEXAACS_CORS_ALLOWED_ORIGINS")); rawOrigins != "" {
		var parsed []string
		for _, item := range strings.Split(rawOrigins, ",") {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				parsed = append(parsed, trimmed)
			}
		}
		if len(parsed) > 0 {
			cfg.API.CORSAllowedOrigins = parsed
		}
	}
	if pubURL := strings.TrimSpace(os.Getenv("NEXAACS_FILE_PUBLIC_URL")); pubURL != "" {
		cfg.Storage.PublicFileURL = strings.TrimRight(pubURL, "/")
	}
	cfg.API.JWTSigningKey = strings.TrimSpace(os.Getenv("NEXAACS_JWT_SIGNING_KEY"))
	cfg.API.SecretMasterKeyHex = strings.TrimSpace(os.Getenv("NEXAACS_SECRET_MASTER_KEY"))
	cfg.CWMP.SharedUsername = strings.TrimSpace(os.Getenv("NEXAACS_CWMP_SHARED_USERNAME"))
	cfg.CWMP.SharedPassword = os.Getenv("NEXAACS_CWMP_SHARED_PASSWORD")

	return cfg, nil
}

// ValidateAPISecurity ensures cryptographic keys are configured safely before starting API services.
func (c *Config) ValidateAPISecurity() error {
	if len(c.API.JWTSigningKey) < 16 || strings.Contains(c.API.JWTSigningKey, "replace_with_") {
		return errors.New("NEXAACS_JWT_SIGNING_KEY must be set to a random secret (minimum 16 characters; recommended: openssl rand -hex 32)")
	}
	if c.API.SecretMasterKeyHex != "" {
		if _, err := security.NewSecretCipherFromHex(c.API.SecretMasterKeyHex); err != nil {
			return fmt.Errorf("NEXAACS_SECRET_MASTER_KEY invalid: %w", err)
		}
	} else if strings.EqualFold(c.App.Environment, "production") {
		return errors.New("NEXAACS_SECRET_MASTER_KEY (64 hex chars via openssl rand -hex 32) is required in production")
	}
	return nil
}
