package httpdelivery

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nexaacs/nexaacs/internal/delivery/websocket"
	"github.com/nexaacs/nexaacs/internal/domain/device"
	"github.com/nexaacs/nexaacs/internal/infrastructure/persistence/postgres"
	"github.com/nexaacs/nexaacs/internal/platform/config"
	"github.com/nexaacs/nexaacs/internal/platform/security"
	"github.com/nexaacs/nexaacs/internal/protocol/common/mapping"
)

type ipRateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

func newIPRateLimiter() *ipRateLimiter {
	return &ipRateLimiter{attempts: make(map[string][]time.Time)}
}

func (l *ipRateLimiter) isBlocked(ip string, maxAttempts int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-window)
	valid := make([]time.Time, 0)
	for _, ts := range l.attempts[ip] {
		if ts.After(cutoff) {
			valid = append(valid, ts)
		}
	}
	if len(valid) == 0 {
		delete(l.attempts, ip)
		return false
	}
	l.attempts[ip] = valid
	return len(valid) >= maxAttempts
}

func (l *ipRateLimiter) recordFailure(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.attempts[ip] = append(l.attempts[ip], time.Now())
}

func (l *ipRateLimiter) reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, ip)
}

type Server struct {
	cfg          *config.Config
	log          *slog.Logger
	pool         *pgxpool.Pool
	store        *postgres.Store
	wsHub        *websocket.Hub
	cipher       *security.SecretCipher
	loginLimiter *ipRateLimiter
}

func NewRouter(cfg *config.Config, log *slog.Logger, pool *pgxpool.Pool, wsHub *websocket.Hub) http.Handler {
	cipher, _ := security.NewSecretCipherFromHex(cfg.API.SecretMasterKeyHex)
	s := &Server{
		cfg:          cfg,
		log:          log,
		pool:         pool,
		store:        postgres.NewStore(pool).WithCipher(cipher),
		wsHub:        wsHub,
		cipher:       cipher,
		loginLimiter: newIPRateLimiter(),
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))
	r.Use(s.securityHeadersMiddleware)
	r.Use(s.corsMiddleware)

	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"service": "nexaacs-api",
			"status":  "ok",
			"time":    time.Now().UTC(),
		})
	}
	r.Get("/healthz", healthHandler)
	r.With(s.requireAuth).Get("/ws/v1/events", s.wsHub.HandleWS)

	r.Route("/api/v1", func(api chi.Router) {
		api.Get("/healthz", healthHandler)

		// Public Auth
		api.Post("/auth/login", s.handleLogin)
		api.Post("/auth/logout", s.handleLogout)

		api.Group(func(protected chi.Router) {
			protected.Use(s.requireAuth)

			protected.Post("/auth/refresh", s.handleRefresh)
			protected.Get("/auth/me", s.handleMe)

			// Dashboard (Database-aggregated, never triggers mass Summon)
			protected.Route("/dashboard", func(d chi.Router) {
				d.Get("/overview", s.handleDashboardOverview)
				d.Get("/summary", s.handleDashboardSummary)
				d.Get("/status-distribution", s.handleDashboardDistribution("status"))
				d.Get("/uptime-distribution", s.handleDashboardDistribution("uptime"))
				d.Get("/temperature-distribution", s.handleDashboardDistribution("temperature"))
				d.Get("/rx-power-distribution", s.handleDashboardDistribution("rx_power"))
				d.Get("/technology-distribution", s.handleDashboardDistribution("technology"))
				d.Get("/manufacturer-distribution", s.handleDashboardDistribution("manufacturer"))
				d.Get("/product-class-distribution", s.handleDashboardDistribution("product_class"))
				d.Get("/model-distribution", s.handleDashboardDistribution("model"))
			})

			// Devices & Operations
			protected.Route("/devices", func(dev chi.Router) {
				dev.With(s.requirePermission("devices.view")).Get("/", s.handleListDevices)
				dev.With(s.requirePermission("devices.summon")).Post("/summon-batch", s.handleSummonBatch)
				dev.With(s.requirePermission("devices.view")).Get("/{id}", s.handleGetDevice)
				dev.With(s.requirePermission("devices.summon")).Post("/{id}/summon", s.handleSummonDevice)
				dev.With(s.requirePermission("devices.summon")).Post("/{id}/refresh", s.handleSummonDevice)
				dev.With(s.requirePermission("devices.reboot")).Post("/{id}/reboot", s.handleQueueDeviceTask("reboot"))
				dev.With(s.requirePermission("devices.factory_reset")).Post("/{id}/factory-reset", s.handleQueueDeviceTask("factory_reset"))
				dev.With(s.requirePermission("devices.delete")).Delete("/{id}", s.handleSoftDeleteDevice)
				dev.With(s.requirePermission("devices.view")).Post("/{id}/parameters/get", s.handleQueueDeviceTask("get_parameter_values"))
				dev.With(s.requirePermission("devices.parameters.write")).Post("/{id}/parameters/set", s.handleQueueDeviceTask("set_parameter_values"))
				dev.With(s.requirePermission("devices.parameters.write")).Post("/{id}/wan", s.handleCreateWanConnection)
				dev.With(s.requirePermission("devices.parameters.write")).Delete("/{id}/wan/{instanceIndex}", s.handleDeleteWanConnection)
				dev.With(s.requirePermission("devices.credentials.edit")).Put("/{id}/credentials", s.handleUpdateCredentials)
				dev.With(s.requirePermission("devices.secrets.view")).Post("/{id}/credentials/reveal", s.handleRevealCredentials)
				dev.With(s.requirePermission("devices.parameters.write")).Post("/{id}/provision", s.handleProvisionByDeviceID)
				dev.With(s.requirePermission("devices.summon")).Post("/{id}/diagnostics/ping", s.handleRunPingDiagnostics)
			})

			// ISP / Billing Auto-Provisioning API
			protected.Route("/provisioning", func(p chi.Router) {
				p.With(s.requirePermission("devices.view")).Get("/", s.handleListProvisioning)
				p.With(s.requirePermission("devices.parameters.write")).Post("/", s.handleProvision)
				p.With(s.requirePermission("devices.view")).Get("/{serial}", s.handleGetProvisioning)
				p.With(s.requirePermission("devices.parameters.write")).Delete("/{serial}", s.handleDeleteProvisioning)
			})

			// Tasks & Faults
			protected.With(s.requirePermission("devices.view")).Get("/tasks", s.handleListTasks)
			protected.With(s.requirePermission("faults.view")).Get("/faults", s.handleListFaults)
			protected.With(s.requirePermission("faults.manage")).Post("/faults/{id}/acknowledge", s.handleUpdateFaultStatus("acknowledged"))
			protected.With(s.requirePermission("faults.manage")).Post("/faults/{id}/resolve", s.handleUpdateFaultStatus("resolved"))
			protected.With(s.requirePermission("faults.manage")).Delete("/faults/{id}", s.handleDeleteFault)

			// Firmware Catalog & Rollout
			protected.With(s.requirePermission("firmware.view")).Get("/firmware", s.handleListFirmware)
			protected.With(s.requirePermission("firmware.deploy")).Post("/firmware", s.handleUploadFirmware)
			protected.With(s.requirePermission("firmware.deploy")).Delete("/firmware/{id}", s.handleDeleteFirmware)
			protected.With(s.requirePermission("firmware.deploy")).Post("/firmware/{id}/deploy", s.handleDeployFirmware)

			// Manufacturer Aliases & Virtual Parameters
			protected.With(s.requirePermission("settings.view")).Get("/aliases", s.handleListAliases)
			protected.With(s.requirePermission("settings.manage")).Post("/aliases", s.handleCreateAlias)
			protected.With(s.requirePermission("settings.manage")).Put("/aliases/{id}", s.handleUpdateAlias)
			protected.With(s.requirePermission("settings.manage")).Delete("/aliases/{id}", s.handleDeleteAlias)

			// Security, Users, Roles, API Keys, Audit Logs & System Settings
			protected.With(s.requirePermission("security.users.manage")).Get("/users", s.handleListUsers)
			protected.With(s.requirePermission("security.users.manage")).Post("/users", s.handleCreateUser)
			protected.With(s.requirePermission("security.users.manage")).Put("/users/{id}", s.handleUpdateUser)
			protected.With(s.requirePermission("security.users.manage")).Delete("/users/{id}", s.handleDeleteUser)
			protected.With(s.requirePermission("security.users.manage")).Get("/roles", s.handleListRoles)
			protected.With(s.requirePermission("security.users.manage")).Put("/roles/{id}/permissions", s.handleUpdateRolePermissions)
			protected.With(s.requirePermission("security.users.manage")).Get("/permissions", s.handleListPermissions)
			protected.With(s.requirePermission("security.users.manage")).Get("/api-keys", s.handleListAPIKeys)
			protected.With(s.requirePermission("security.users.manage")).Post("/api-keys", s.handleCreateAPIKey)
			protected.With(s.requirePermission("security.users.manage")).Delete("/api-keys/{id}", s.handleRevokeAPIKey)
			protected.With(s.requirePermission("security.audit.view")).Get("/audit-logs", s.handleListAuditLogs)
			protected.With(s.requirePermission("settings.view")).Get("/settings/{category}", s.handleGetSetting)
			protected.With(s.requirePermission("settings.manage")).Put("/settings/{category}", s.handlePutSetting)
		})
	})

	return r
}

func (s *Server) currentRuntimeSettings(ctx context.Context) postgres.RuntimeSettings {
	return s.store.LoadRuntimeSettings(ctx, postgres.DefaultTenantID, s.cfg)
}

func (s *Server) currentPolicy(ctx context.Context) device.ThresholdPolicy {
	return s.currentRuntimeSettings(ctx).Thresholds
}

type callerCtxKey struct{}

type callerIdentity struct {
	Username string
	Role     string
	APIKey   bool
	Scopes   []string
}

func apiKeyHasPermission(scopes []string, code string) bool {
	for _, raw := range scopes {
		s := strings.TrimSpace(raw)
		if s == "" {
			continue
		}
		if s == "*" || s == "admin" || s == code {
			return true
		}
		switch s {
		case "devices:read":
			if code == "overview.view" || code == "devices.view" {
				return true
			}
		case "devices:summon":
			if code == "devices.view" || code == "devices.summon" {
				return true
			}
		case "devices:write":
			if code == "devices.view" || code == "devices.summon" || code == "devices.parameters.write" || code == "devices.reboot" {
				return true
			}
		case "provisioning:write":
			if code == "devices.view" || code == "devices.parameters.write" {
				return true
			}
		case "devices:danger":
			if code == "devices.factory_reset" || code == "devices.delete" || code == "devices.credentials.edit" {
				return true
			}
		case "secrets:read":
			if code == "devices.secrets.view" {
				return true
			}
		case "faults:read":
			if code == "faults.view" {
				return true
			}
		case "faults:write":
			if code == "faults.view" || code == "faults.manage" {
				return true
			}
		case "firmware:read":
			if code == "firmware.view" {
				return true
			}
		case "firmware:write":
			if code == "firmware.view" || code == "firmware.deploy" {
				return true
			}
		case "settings:read":
			if code == "settings.view" {
				return true
			}
		case "settings:write":
			if code == "settings.view" || code == "settings.manage" {
				return true
			}
		case "security:manage":
			if code == "security.users.manage" || code == "security.trust.manage" || code == "security.audit.view" {
				return true
			}
		}
	}
	return false
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawTok := ""
		auth := strings.TrimSpace(r.Header.Get("Authorization"))
		if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			rawTok = strings.TrimSpace(auth[len("bearer "):])
		} else if r.URL.Path == "/ws/v1/events" {
			if qTok := strings.TrimSpace(r.URL.Query().Get("token")); qTok != "" {
				rawTok = qTok
			}
		}
		if rawTok != "" {
			claims, err := security.VerifyStatelessToken(rawTok, s.cfg.API.JWTSigningKey)
			if err == nil {
				ctx := context.WithValue(r.Context(), callerCtxKey{}, callerIdentity{Username: claims.Subject, Role: claims.Role})
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}
		if apiKey := strings.TrimSpace(r.Header.Get("X-API-Key")); apiKey != "" {
			if _, label, scopes, err := s.store.ValidateAPIKey(r.Context(), apiKey); err == nil {
				ctx := context.WithValue(r.Context(), callerCtxKey{}, callerIdentity{
					Username: label,
					Role:     "API Key",
					APIKey:   true,
					Scopes:   scopes,
				})
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}
		writeError(w, http.StatusUnauthorized, "unauthorized: valid Bearer token or X-API-Key required")
	})
}

func (s *Server) requirePermission(code string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, ok := r.Context().Value(callerCtxKey{}).(callerIdentity)
			if !ok || id.Username == "" {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			if id.APIKey {
				if apiKeyHasPermission(id.Scopes, code) {
					next.ServeHTTP(w, r)
					return
				}
				writeError(w, http.StatusForbidden, "forbidden: api key scope for "+code+" required")
				return
			}
			_, perms, err := s.store.LookupUserPermissions(r.Context(), postgres.DefaultTenantID, id.Username)
			if err != nil {
				writeError(w, http.StatusForbidden, "forbidden: unable to verify permissions")
				return
			}
			for _, p := range perms {
				if p == code {
					next.ServeHTTP(w, r)
					return
				}
			}
			writeError(w, http.StatusForbidden, "forbidden: permission "+code+" required")
		})
	}
}

func (s *Server) callerFromRequest(r *http.Request) (string, string) {
	if id, ok := r.Context().Value(callerCtxKey{}).(callerIdentity); ok && id.Username != "" {
		return id.Username, id.Role
	}
	return "", ""
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	clientIP := r.RemoteAddr
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		clientIP = host
	}
	if s.loginLimiter.isBlocked(clientIP, 10, 5*time.Minute) {
		s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, clientIP, "auth.rate_limited", "auth", clientIP, map[string]interface{}{"window": "5m"})
		writeError(w, http.StatusTooManyRequests, "too many failed login attempts; wait 5 minutes before retrying")
		return
	}

	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	username := strings.ToLower(strings.TrimSpace(body.Username))
	if username == "" {
		username = strings.ToLower(strings.TrimSpace(body.Email))
	}
	if username == "" || body.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}
	if len(username) < 2 || len(username) > 120 || strings.ContainsAny(username, " \t\r\n") {
		writeError(w, http.StatusBadRequest, "username must be 2–120 characters without whitespace")
		return
	}
	if len(body.Password) > 128 {
		writeError(w, http.StatusBadRequest, "password must be <= 128 characters")
		return
	}
	roleName, perms, err := s.store.AuthenticateUser(r.Context(), postgres.DefaultTenantID, username, body.Password)
	if err != nil {
		s.loginLimiter.recordFailure(clientIP)
		s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, username, "auth.login_failed", "user", username, map[string]interface{}{"reason": err.Error(), "ip": clientIP})
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	s.loginLimiter.reset(clientIP)
	token := security.SignStatelessToken(username, postgres.DefaultTenantID.String(), roleName, 1*time.Hour, s.cfg.API.JWTSigningKey)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, username, "auth.login", "user", username, map[string]interface{}{"role": roleName, "ip": clientIP})
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"access_token": token,
			"token_type":   "Bearer",
			"expires_in":   3600,
			"user": map[string]interface{}{
				"username":    username,
				"tenant_id":   postgres.DefaultTenantID,
				"role":        roleName,
				"permissions": perms,
			},
		},
	})
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	username, role := s.callerFromRequest(r)
	if username == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	roleName, _, err := s.store.LookupUserPermissions(r.Context(), postgres.DefaultTenantID, username)
	if err == nil && roleName != "" {
		role = roleName
	}
	token := security.SignStatelessToken(username, postgres.DefaultTenantID.String(), role, 1*time.Hour, s.cfg.API.JWTSigningKey)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "access_token": token, "expires_in": 3600})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	username, _ := s.callerFromRequest(r)
	roleName, perms, _ := s.store.LookupUserPermissions(r.Context(), postgres.DefaultTenantID, username)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"tenant_id":   postgres.DefaultTenantID,
			"username":    username,
			"role":        roleName,
			"permissions": perms,
		},
	})
}

func (s *Server) handleListDevices(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 {
		limit = 25
	}
	offset, _ := strconv.Atoi(q.Get("offset"))
	if page, _ := strconv.Atoi(q.Get("page")); page > 0 && q.Get("offset") == "" {
		offset = (page - 1) * limit
	}

	rt := s.currentRuntimeSettings(r.Context())
	devices, total, err := s.store.ListDevicesFiltered(r.Context(), postgres.DefaultTenantID, postgres.DeviceListQuery{
		Limit:                limit,
		Offset:               offset,
		Search:               q.Get("search"),
		Manufacturer:         q.Get("manufacturer"),
		Model:                q.Get("model"),
		ProductClass:         q.Get("productClass"),
		Technology:           q.Get("technology"),
		Protocol:             q.Get("protocol"),
		DeviceGroup:          q.Get("deviceGroup"),
		Status:               q.Get("status"),
		StatusBucket:         q.Get("statusBucket"),
		UptimeBucket:         q.Get("uptimeBucket"),
		TempBucket:           q.Get("tempBucket"),
		RXBucket:             q.Get("rxBucket"),
		SortBy:               q.Get("sortBy"),
		SortDir:              q.Get("sortDir"),
		OnlineThresholdSec:   rt.OnlineThresholdSeconds,
		NeverConnectedPolicy: rt.NeverConnectedPolicy,
		Thresholds:           rt.Thresholds,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := time.Now().UTC()
	type deviceResp struct {
		device.Device
		Status device.Status `json:"status"`
	}
	items := make([]deviceResp, 0, len(devices))
	for _, d := range devices {
		if rt.OnlineThresholdSeconds > 0 {
			d.OnlineThresholdSeconds = rt.OnlineThresholdSeconds
		}
		st := d.ComputeStatus(now, rt.OnlineThresholdSeconds)
		if st == device.StatusNeverConnected && rt.NeverConnectedPolicy == "treat_unknown" {
			st = device.StatusUnknown
		}
		items = append(items, deviceResp{Device: d, Status: st})
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"items": items,
			"total": total,
			"limit": limit,
			"page":  (offset / limit) + 1,
		},
	})
}

func (s *Server) handleGetDevice(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	rt := s.currentRuntimeSettings(r.Context())
	detail, err := s.store.GetDeviceDetail(r.Context(), postgres.DefaultTenantID, id, rt.OnlineThresholdSeconds)
	if err != nil {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	if detail.Status == device.StatusNeverConnected && rt.NeverConnectedPolicy == "treat_unknown" {
		detail.Status = device.StatusUnknown
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    detail,
	})
}

func (s *Server) handleDashboardOverview(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	rt := s.currentRuntimeSettings(r.Context())
	stats, err := s.store.GetOverviewStats(
		r.Context(),
		postgres.DefaultTenantID,
		rt.OnlineThresholdSeconds,
		rt.Thresholds,
		postgres.OverviewFilter{
			Manufacturer: q.Get("manufacturer"),
			Model:        q.Get("model"),
			ProductClass: q.Get("productClass"),
			Technology:   q.Get("technology"),
			Protocol:     q.Get("protocol"),
			DeviceGroup:  q.Get("deviceGroup"),
		},
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}

func (s *Server) handleDashboardSummary(w http.ResponseWriter, r *http.Request) {
	rt := s.currentRuntimeSettings(r.Context())
	stats, err := s.store.GetOverviewStats(r.Context(), postgres.DefaultTenantID, rt.OnlineThresholdSeconds, rt.Thresholds, postgres.OverviewFilter{})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := time.Now().UTC()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"total_devices":    stats.Total,
			"online_devices":   stats.Online,
			"offline_devices":  stats.Offline,
			"never_connected":  stats.NeverConnected,
			"availability_pct": stats.AvailabilityPct,
			"last_updated_at":  now,
		},
	})
}

func (s *Server) handleDashboardDistribution(metric string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		counts, err := s.store.GetDashboardDistributions(r.Context(), postgres.DefaultTenantID, metric, s.currentPolicy(r.Context()))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"metric":  metric,
			"data":    counts,
		})
	}
}

func (s *Server) checkReachableForLiveAction(ctx context.Context, deviceID uuid.UUID) (bool, string) {
	rt := s.currentRuntimeSettings(ctx)
	reach, err := s.store.CheckDeviceReachability(ctx, postgres.DefaultTenantID, deviceID, rt.OnlineThresholdSeconds)
	if err != nil {
		return false, "perangkat tidak ditemukan"
	}
	if reach.AdminDisabled {
		return false, "perangkat sedang dinonaktifkan (admin_disabled)"
	}
	if reach.Status == device.StatusOnline {
		return true, ""
	}
	if strings.TrimSpace(reach.ConnectionRequestURL) == "" {
		return false, "ONT sedang offline dan tidak memiliki ConnectionRequestURL"
	}
	u, perr := url.Parse(reach.ConnectionRequestURL)
	if perr != nil || u.Host == "" {
		return false, "ONT sedang offline / ConnectionRequestURL tidak valid"
	}
	hostPort := u.Host
	if !strings.Contains(hostPort, ":") {
		if u.Scheme == "https" {
			hostPort += ":443"
		} else {
			hostPort += ":80"
		}
	}
	conn, derr := net.DialTimeout("tcp", hostPort, 2*time.Second)
	if derr != nil {
		return false, fmt.Sprintf("ONT %s sedang offline / tidak dapat dijangkau di %s", reach.SerialNumber, hostPort)
	}
	_ = conn.Close()
	return true, ""
}

func (s *Server) handleSummonDevice(w http.ResponseWriter, r *http.Request) {
	deviceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	if ok, reason := s.checkReachableForLiveAction(r.Context(), deviceID); !ok {
		writeError(w, http.StatusConflict, reason)
		return
	}
	var req struct {
		Groups []string `json:"groups"`
		Paths  []string `json:"paths"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	detail, err := s.store.GetDeviceDetail(r.Context(), postgres.DefaultTenantID, deviceID, s.cfg.Thresholds.OnlineThresholdSeconds)
	if err != nil {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}

	paths := req.Paths
	if len(paths) == 0 {
		groups := req.Groups
		if len(groups) == 0 {
			groups = mapping.AllSummonGroups
		}
		var vp *mapping.VirtualParameterMapping
		if detail.MatchedAlias != nil {
			vp = &detail.MatchedAlias.VirtualParameters
		}
		paths = mapping.ResolveSummonPaths(detail.Device.DataModelRoot, vp, groups)
	}
	payloadRaw, _ := json.Marshal(map[string]interface{}{"groups": req.Groups, "paths": paths})

	var taskID uuid.UUID
	err = s.pool.QueryRow(r.Context(), `
		INSERT INTO tasks (tenant_id, device_id, protocol, task_type, status, payload)
		VALUES ($1, $2, $3, 'summon', 'queued', $4)
		RETURNING id
	`, postgres.DefaultTenantID, deviceID, string(detail.Device.Protocol), payloadRaw).Scan(&taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "device.summon", "device", detail.Device.SerialNumber, map[string]interface{}{"task_id": taskID, "groups": req.Groups})
	s.wsHub.Broadcast(websocket.Event{
		Type:     "summon.started",
		TenantID: postgres.DefaultTenantID.String(),
		DeviceID: deviceID.String(),
		Data:     map[string]interface{}{"task_id": taskID, "status": "queued"},
	})
	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"success": true,
		"data":    map[string]interface{}{"task_id": taskID, "status": "queued", "paths": paths},
	})
}

func (s *Server) handleSummonBatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeviceIDs []string `json:"device_ids"`
		Groups    []string `json:"groups"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	if len(req.DeviceIDs) == 0 {
		writeError(w, http.StatusBadRequest, "device_ids is required")
		return
	}
	if len(req.DeviceIDs) > 200 {
		req.DeviceIDs = req.DeviceIDs[:200]
	}
	parsedIDs := make([]uuid.UUID, 0, len(req.DeviceIDs))
	for _, raw := range req.DeviceIDs {
		if id, err := uuid.Parse(strings.TrimSpace(raw)); err == nil {
			parsedIDs = append(parsedIDs, id)
		}
	}
	if len(parsedIDs) == 0 {
		writeError(w, http.StatusBadRequest, "no valid device_ids provided")
		return
	}
	taskIDs, err := s.store.QueueBatchSummon(r.Context(), postgres.DefaultTenantID, parsedIDs, req.Groups)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "device.summon_batch", "device", "batch", map[string]interface{}{
		"requested": len(parsedIDs),
		"queued":    len(taskIDs),
		"groups":    req.Groups,
	})
	s.wsHub.Broadcast(websocket.Event{
		Type:     "summon.started",
		TenantID: postgres.DefaultTenantID.String(),
		Data:     map[string]interface{}{"queued": len(taskIDs)},
	})
	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"queued_count": len(taskIDs),
			"task_ids":     taskIDs,
		},
	})
}

func (s *Server) handleQueueDeviceTask(taskType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		deviceID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid device id")
			return
		}
		if ok, reason := s.checkReachableForLiveAction(r.Context(), deviceID); !ok {
			writeError(w, http.StatusConflict, reason)
			return
		}
		var body json.RawMessage
		_ = json.NewDecoder(r.Body).Decode(&body)
		if len(body) == 0 {
			body = []byte(`{}`)
		}
		if err := validateDeviceTaskPayload(taskType, body); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		var taskID uuid.UUID
		err = s.pool.QueryRow(r.Context(), `
			INSERT INTO tasks (tenant_id, device_id, protocol, task_type, status, payload)
			VALUES ($1, $2, 'TR-069', $3, 'queued', $4)
			RETURNING id
		`, postgres.DefaultTenantID, deviceID, taskType, body).Scan(&taskID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		email, _ := s.callerFromRequest(r)
		s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "device."+taskType, "device", deviceID.String(), map[string]interface{}{"task_id": taskID})
		s.wsHub.Broadcast(websocket.Event{
			Type:     "task.started",
			TenantID: postgres.DefaultTenantID.String(),
			DeviceID: deviceID.String(),
			Data:     map[string]interface{}{"task_id": taskID, "task_type": taskType, "status": "queued"},
		})

		writeJSON(w, http.StatusAccepted, map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"task_id": taskID,
				"status":  "queued",
				"message": "Task queued for asynchronous execution",
			},
		})
	}
}

func (s *Server) handleCreateWanConnection(w http.ResponseWriter, r *http.Request) {
	deviceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	if ok, reason := s.checkReachableForLiveAction(r.Context(), deviceID); !ok {
		writeError(w, http.StatusConflict, reason)
		return
	}
	var req struct {
		ConnectionType string `json:"connectionType"`
		AddressingMode string `json:"addressingMode"`
		PPPoEUsername  string `json:"pppoeUsername"`
		PPPoEPassword  string `json:"pppoePassword"`
		VLANEnabled    *bool  `json:"vlanEnabled"`
		VLANType       string `json:"vlanType"`
		VLANID         *int   `json:"vlanId"`
		WANIP          string `json:"wanIp"`
		SubnetMask     string `json:"subnetMask"`
		Gateway        string `json:"gateway"`
		DNS            string `json:"dns"`
		ServiceList    string `json:"serviceList"`
		NATEnabled     *bool  `json:"natEnabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	vlanType := strings.ToLower(strings.TrimSpace(req.VLANType))
	if vlanType != "untag" && vlanType != "transparent" && vlanType != "tag" {
		if req.VLANEnabled != nil && !*req.VLANEnabled {
			vlanType = "untag"
		} else if req.VLANID != nil && *req.VLANID == 0 {
			vlanType = "untag"
		} else {
			vlanType = "tag"
		}
	}
	if vlanType == "tag" && req.VLANID != nil && (*req.VLANID < 1 || *req.VLANID > 4094) {
		writeError(w, http.StatusBadRequest, "vlanId must be between 1 and 4094 when vlanType is tag")
		return
	}
	if req.VLANID != nil && (*req.VLANID < 0 || *req.VLANID > 4094) {
		writeError(w, http.StatusBadRequest, "vlanId must be between 0 and 4094")
		return
	}
	rt := s.currentRuntimeSettings(r.Context())
	detail, err := s.store.GetDeviceDetail(r.Context(), postgres.DefaultTenantID, deviceID, rt.OnlineThresholdSeconds)
	if err != nil {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	var vp *mapping.VirtualParameterMapping
	if detail.MatchedAlias != nil {
		vp = &detail.MatchedAlias.VirtualParameters
	}
	proto := string(detail.Device.Protocol)
	if proto == "" {
		proto = "TR-069"
	}
	connType := strings.TrimSpace(req.ConnectionType)
	if connType == "" {
		connType = "PPPoE"
	}
	natVal := true
	if req.NATEnabled != nil {
		natVal = *req.NATEnabled
	}

	var headTaskID, leafTaskID uuid.UUID
	if detail.Device.DataModelRoot == "Device." {
		objName := "Device.IP.Interface."
		if connType == "PPPoE" {
			objName = "Device.PPP.Interface."
		}
		headTaskID = uuid.New()
		leafTaskID = uuid.New()
		addPayload, _ := json.Marshal(map[string]interface{}{
			"object_name":   objName,
			"replace_token": "{wan_dev_idx}",
		})
		var setParams []map[string]interface{}
		if connType == "PPPoE" {
			setParams = append(setParams,
				map[string]interface{}{"name": "Device.PPP.Interface.{wan_dev_idx}.Enable", "type": "xsd:boolean", "value": "true"},
				map[string]interface{}{"name": "Device.PPP.Interface.{wan_dev_idx}.Username", "type": "xsd:string", "value": req.PPPoEUsername},
			)
			if req.PPPoEPassword != "" {
				setParams = append(setParams, map[string]interface{}{"name": "Device.PPP.Interface.{wan_dev_idx}.Password", "type": "xsd:string", "value": req.PPPoEPassword})
			}
		} else {
			setParams = append(setParams,
				map[string]interface{}{"name": "Device.IP.Interface.{wan_dev_idx}.Enable", "type": "xsd:boolean", "value": "true"},
			)
			if strings.EqualFold(req.AddressingMode, "Static") && req.WANIP != "" {
				setParams = append(setParams, map[string]interface{}{"name": "Device.IP.Interface.{wan_dev_idx}.IPv4Address.1.IPAddress", "type": "xsd:string", "value": req.WANIP})
			}
		}
		setPayload, _ := json.Marshal(map[string]interface{}{
			"parameters": setParams,
			"blocked_by": headTaskID.String(),
		})
		if _, err := s.pool.Exec(r.Context(), `
			INSERT INTO tasks (id, tenant_id, device_id, protocol, task_type, status, payload)
			VALUES ($1, $2, $3, $4, 'add_object', 'queued', $5),
			       ($6, $2, $3, $4, 'set_parameter_values', 'queued', $7)
		`, headTaskID, postgres.DefaultTenantID, deviceID, proto, addPayload, leafTaskID, setPayload); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		connObj := "WANIPConnection"
		if connType == "PPPoE" {
			connObj = "WANPPPConnection"
		}
		headTaskID = uuid.New()
		midTaskID := uuid.New()
		leafTaskID = uuid.New()
		addDevPayload, _ := json.Marshal(map[string]interface{}{
			"object_name":   "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.",
			"replace_token": "{wan_dev_idx}",
		})
		addConnPayload, _ := json.Marshal(map[string]interface{}{
			"object_name":   "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{wan_dev_idx}." + connObj + ".",
			"replace_token": "{wan_conn_idx}",
			"blocked_by":    headTaskID.String(),
		})
		basePrefix := "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{wan_dev_idx}." + connObj + ".{wan_conn_idx}."
		setParams := []map[string]interface{}{
			{"name": basePrefix + "Enable", "type": "xsd:boolean", "value": "true"},
		}
		if connType == "Bridge" {
			setParams = append(setParams, map[string]interface{}{"name": basePrefix + "ConnectionType", "type": "xsd:string", "value": "PPPoE_Bridged"})
		} else {
			setParams = append(setParams,
				map[string]interface{}{"name": basePrefix + "ConnectionType", "type": "xsd:string", "value": "IP_Routed"},
				map[string]interface{}{"name": basePrefix + "NATEnabled", "type": "xsd:boolean", "value": strconv.FormatBool(natVal)},
			)
		}
		if connType == "PPPoE" {
			if req.PPPoEUsername != "" {
				setParams = append(setParams, map[string]interface{}{"name": basePrefix + "Username", "type": "xsd:string", "value": req.PPPoEUsername})
			}
			if req.PPPoEPassword != "" {
				setParams = append(setParams, map[string]interface{}{"name": basePrefix + "Password", "type": "xsd:string", "value": req.PPPoEPassword})
			}
		} else if connType == "IPoE" {
			addrMode := "DHCP"
			if strings.EqualFold(req.AddressingMode, "Static") {
				addrMode = "Static"
			}
			setParams = append(setParams, map[string]interface{}{"name": basePrefix + "AddressingType", "type": "xsd:string", "value": addrMode})
			if addrMode == "Static" {
				if req.WANIP != "" {
					setParams = append(setParams, map[string]interface{}{"name": basePrefix + "ExternalIPAddress", "type": "xsd:string", "value": req.WANIP})
				}
				if req.SubnetMask != "" {
					setParams = append(setParams, map[string]interface{}{"name": basePrefix + "SubnetMask", "type": "xsd:string", "value": req.SubnetMask})
				}
				if req.Gateway != "" {
					setParams = append(setParams, map[string]interface{}{"name": basePrefix + "DefaultGateway", "type": "xsd:string", "value": req.Gateway})
				}
				if req.DNS != "" {
					setParams = append(setParams, map[string]interface{}{"name": basePrefix + "DNSServers", "type": "xsd:string", "value": req.DNS})
				}
			}
		}
		adaptWanTemplate := func(tmpl string) string {
			cand := strings.ReplaceAll(strings.TrimSpace(tmpl), "{i}", "{wan_dev_idx}")
			cand = strings.ReplaceAll(cand, "WANPPPConnection.1.", connObj+".{wan_conn_idx}.")
			cand = strings.ReplaceAll(cand, "WANIPConnection.1.", connObj+".{wan_conn_idx}.")
			return cand
		}
		hasParamSuffix := func(suffix string) bool {
			for _, dp := range detail.Parameters {
				if strings.HasSuffix(dp.Path, suffix) {
					return true
				}
			}
			return false
		}
		linkPrefix := ""
		for _, cand := range []string{
			"X_CT-COM_WANEponLinkConfig",
			"X_CT-COM_WANGponLinkConfig",
			"X_CMCC_WANEponLinkConfig",
			"X_CMCC_WANGponLinkConfig",
		} {
			if hasParamSuffix("."+cand+".VLANIDMark") || hasParamSuffix("."+cand+".Mode") {
				linkPrefix = "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{wan_dev_idx}." + cand + "."
				break
			}
		}
		modeNumeric := "0"
		switch vlanType {
		case "tag":
			modeNumeric = "2"
		case "transparent":
			modeNumeric = "1"
		}
		vlanValStr := "0"
		if vlanType == "tag" && req.VLANID != nil {
			vlanValStr = strconv.Itoa(*req.VLANID)
		}
		switch {
		case hasParamSuffix(".X_CU_VLANEnabled") || hasParamSuffix(".X_CU_VLAN"):
			setParams = append(setParams,
				map[string]interface{}{"name": basePrefix + "X_CU_VLANEnabled", "type": "xsd:boolean", "value": strconv.FormatBool(vlanType == "tag")},
				map[string]interface{}{"name": basePrefix + "X_CU_VLAN", "type": "xsd:unsignedInt", "value": vlanValStr},
			)
		case linkPrefix != "":
			if hasParamSuffix(".Mode") {
				setParams = append(setParams, map[string]interface{}{"name": linkPrefix + "Mode", "type": "xsd:unsignedInt", "value": modeNumeric})
			}
			setParams = append(setParams, map[string]interface{}{"name": linkPrefix + "VLANIDMark", "type": "xsd:unsignedInt", "value": vlanValStr})
		case hasParamSuffix(".X_CMCC_VLANMode") || hasParamSuffix(".X_CMCC_VLANIDMark"):
			setParams = append(setParams,
				map[string]interface{}{"name": basePrefix + "X_CMCC_VLANMode", "type": "xsd:unsignedInt", "value": modeNumeric},
				map[string]interface{}{"name": basePrefix + "X_CMCC_VLANIDMark", "type": "xsd:unsignedInt", "value": vlanValStr},
			)
		case hasParamSuffix(".X_HW_VLAN"):
			setParams = append(setParams, map[string]interface{}{"name": basePrefix + "X_HW_VLAN", "type": "xsd:unsignedInt", "value": vlanValStr})
		case hasParamSuffix(".X_ZTE-COM_VLANID"):
			setParams = append(setParams, map[string]interface{}{"name": basePrefix + "X_ZTE-COM_VLANID", "type": "xsd:unsignedInt", "value": vlanValStr})
		case hasParamSuffix(".X_FH_VLANID"):
			setParams = append(setParams, map[string]interface{}{"name": basePrefix + "X_FH_VLANID", "type": "xsd:unsignedInt", "value": vlanValStr})
		default:
			if vp != nil && strings.TrimSpace(vp.WANVlanID) != "" {
				vlanPath := adaptWanTemplate(vp.WANVlanID)
				setParams = append(setParams, map[string]interface{}{"name": vlanPath, "type": "xsd:unsignedInt", "value": vlanValStr})
			} else if req.VLANID != nil {
				setParams = append(setParams, map[string]interface{}{"name": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{wan_dev_idx}.X_CT-COM_WANGponLinkConfig.VLANIDMark", "type": "xsd:unsignedInt", "value": vlanValStr})
			}
		}
		if svc := strings.TrimSpace(req.ServiceList); svc != "" {
			svcPath := ""
			for _, suffix := range []string{".X_HW_SERVICELIST", ".X_CT-COM_ServiceList", ".X_CMCC_ServiceList", ".ServiceList"} {
				if hasParamSuffix(suffix) {
					svcPath = basePrefix + strings.TrimPrefix(suffix, ".")
					break
				}
			}
			if svcPath == "" && vp != nil && strings.TrimSpace(vp.WANServiceList) != "" {
				svcPath = adaptWanTemplate(vp.WANServiceList)
			}
			if svcPath != "" {
				setParams = append(setParams, map[string]interface{}{"name": svcPath, "type": "xsd:string", "value": svc})
			}
		}
		setPayload, _ := json.Marshal(map[string]interface{}{
			"parameters": setParams,
			"blocked_by": midTaskID.String(),
		})
		if _, err := s.pool.Exec(r.Context(), `
			INSERT INTO tasks (id, tenant_id, device_id, protocol, task_type, status, payload)
			VALUES ($1, $2, $3, $4, 'add_object', 'queued', $5),
			       ($6, $2, $3, $4, 'add_object', 'queued', $7),
			       ($8, $2, $3, $4, 'set_parameter_values', 'queued', $9)
		`, headTaskID, postgres.DefaultTenantID, deviceID, proto, addDevPayload, midTaskID, addConnPayload, leafTaskID, setPayload); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "device.wan.added", "device", detail.Device.SerialNumber, map[string]interface{}{
		"connection_type": connType,
		"add_task_id":     headTaskID,
		"task_id":         leafTaskID,
	})
	s.wsHub.Broadcast(websocket.Event{
		Type:     "task.started",
		TenantID: postgres.DefaultTenantID.String(),
		DeviceID: deviceID.String(),
		Data:     map[string]interface{}{"task_id": leafTaskID, "task_type": "set_parameter_values", "status": "queued"},
	})
	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"task_id":     leafTaskID,
			"add_task_id": headTaskID,
			"status":      "queued",
			"message":     "WAN creation queued (AddObject + SetParameterValues)",
		},
	})
}

func (s *Server) handleDeleteWanConnection(w http.ResponseWriter, r *http.Request) {
	deviceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	instanceIdx, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "instanceIndex")))
	if err != nil || instanceIdx < 1 || instanceIdx > 64 {
		writeError(w, http.StatusBadRequest, "instanceIndex must be between 1 and 64")
		return
	}
	if ok, reason := s.checkReachableForLiveAction(r.Context(), deviceID); !ok {
		writeError(w, http.StatusConflict, reason)
		return
	}

	var req struct {
		ObjectPath     string `json:"objectPath"`
		ConnectionType string `json:"connectionType"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if strings.TrimSpace(req.ObjectPath) == "" {
		req.ObjectPath = strings.TrimSpace(r.URL.Query().Get("objectPath"))
	}
	if strings.TrimSpace(req.ConnectionType) == "" {
		req.ConnectionType = strings.TrimSpace(r.URL.Query().Get("connectionType"))
	}
	if req.ObjectPath != "" && !strings.HasPrefix(req.ObjectPath, "InternetGatewayDevice.") && !strings.HasPrefix(req.ObjectPath, "Device.") {
		writeError(w, http.StatusBadRequest, "objectPath must start with InternetGatewayDevice. or Device.")
		return
	}

	rt := s.currentRuntimeSettings(r.Context())
	detail, err := s.store.GetDeviceDetail(r.Context(), postgres.DefaultTenantID, deviceID, rt.OnlineThresholdSeconds)
	if err != nil {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	var vp *mapping.VirtualParameterMapping
	if detail.MatchedAlias != nil {
		vp = &detail.MatchedAlias.VirtualParameters
	}
	paramPaths := make([]string, 0, len(detail.Parameters))
	for _, p := range detail.Parameters {
		paramPaths = append(paramPaths, p.Path)
	}
	objName := mapping.ResolveWanDeleteObjectPath(
		detail.Device.DataModelRoot,
		vp,
		paramPaths,
		req.ObjectPath,
		instanceIdx,
		req.ConnectionType,
	)
	if objName == "" {
		writeError(w, http.StatusBadRequest, "unable to resolve WAN DeleteObject path for this device")
		return
	}

	proto := string(detail.Device.Protocol)
	if proto == "" {
		proto = "TR-069"
	}

	deleteTaskID := uuid.New()
	deletePayload, _ := json.Marshal(map[string]interface{}{
		"object_name":     objName,
		"instance_index":  instanceIdx,
		"connection_type": req.ConnectionType,
	})

	summonTaskID := uuid.New()
	summonPaths := mapping.ResolveSummonPaths(detail.Device.DataModelRoot, vp, []string{"vparams"})
	summonPayload, _ := json.Marshal(map[string]interface{}{
		"source":     "wan_delete",
		"groups":     []string{"vparams"},
		"paths":      summonPaths,
		"blocked_by": deleteTaskID.String(),
	})

	if _, err := s.pool.Exec(r.Context(), `
		INSERT INTO tasks (id, tenant_id, device_id, protocol, task_type, status, payload)
		VALUES ($1, $2, $3, $4, 'delete_object', 'queued', $5),
		       ($6, $2, $3, $4, 'summon', 'queued', $7)
	`, deleteTaskID, postgres.DefaultTenantID, deviceID, proto, deletePayload, summonTaskID, summonPayload); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "device.wan.deleted", "device", detail.Device.SerialNumber, map[string]interface{}{
		"instance_index":  instanceIdx,
		"connection_type": req.ConnectionType,
		"object_name":     objName,
		"task_id":         deleteTaskID,
		"summon_task_id":  summonTaskID,
	})
	s.wsHub.Broadcast(websocket.Event{
		Type:     "task.started",
		TenantID: postgres.DefaultTenantID.String(),
		DeviceID: deviceID.String(),
		Data: map[string]interface{}{
			"task_id":   deleteTaskID,
			"task_type": "delete_object",
			"status":    "queued",
		},
	})
	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"task_id":        deleteTaskID,
			"summon_task_id": summonTaskID,
			"object_name":    objName,
			"status":         "queued",
			"message":        "WAN deletion queued (DeleteObject + VParams Summon)",
		},
	})
}

func (s *Server) handleRunPingDiagnostics(w http.ResponseWriter, r *http.Request) {
	deviceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	if ok, reason := s.checkReachableForLiveAction(r.Context(), deviceID); !ok {
		writeError(w, http.StatusConflict, reason)
		return
	}
	var req struct {
		Host  string `json:"host"`
		Count int    `json:"count"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	host := strings.TrimSpace(req.Host)
	if host == "" {
		host = "8.8.8.8"
	}
	if len(host) > 128 || strings.ContainsAny(host, " \t\r\n;") {
		writeError(w, http.StatusBadRequest, "invalid diagnostic target host")
		return
	}
	count := req.Count
	if count <= 0 || count > 20 {
		count = 4
	}

	rt := s.currentRuntimeSettings(r.Context())
	detail, err := s.store.GetDeviceDetail(r.Context(), postgres.DefaultTenantID, deviceID, rt.OnlineThresholdSeconds)
	if err != nil {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	root := "InternetGatewayDevice.IPPingDiagnostics."
	if detail.Device.DataModelRoot == "Device." {
		root = "Device.IP.Diagnostics.IPPing."
	}
	setPayload, _ := json.Marshal(map[string]interface{}{
		"parameters": []map[string]interface{}{
			{"name": root + "Host", "value": host, "type": "xsd:string"},
			{"name": root + "NumberOfRepetitions", "value": strconv.Itoa(count), "type": "xsd:unsignedInt"},
			{"name": root + "DiagnosticsState", "value": "Requested", "type": "xsd:string"},
		},
	})
	getPayload, _ := json.Marshal(map[string]interface{}{
		"paths":  []string{root},
		"reason": "diagnostics_ping",
	})

	var setTaskID, getTaskID uuid.UUID
	if err := s.pool.QueryRow(r.Context(), `
		INSERT INTO tasks (tenant_id, device_id, protocol, task_type, status, payload)
		VALUES ($1, $2, $3, 'set_parameter_values', 'queued', $4)
		RETURNING id
	`, postgres.DefaultTenantID, deviceID, string(detail.Device.Protocol), setPayload).Scan(&setTaskID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = s.pool.QueryRow(r.Context(), `
		INSERT INTO tasks (tenant_id, device_id, protocol, task_type, status, payload, scheduled_at)
		VALUES ($1, $2, $3, 'get_parameter_values', 'queued', $4, NOW() + INTERVAL '8 seconds')
		RETURNING id
	`, postgres.DefaultTenantID, deviceID, string(detail.Device.Protocol), getPayload).Scan(&getTaskID)

	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "device.diagnostics.ping", "device", detail.Device.SerialNumber, map[string]interface{}{"host": host, "count": count, "set_task_id": setTaskID, "get_task_id": getTaskID})
	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"set_task_id": setTaskID,
			"get_task_id": getTaskID,
			"host":        host,
			"count":       count,
			"root":        root,
		},
	})
}

func (s *Server) handleUpdateCredentials(w http.ResponseWriter, r *http.Request) {
	deviceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	var body struct {
		Scope    string `json:"scope"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Scope == "" {
		writeError(w, http.StatusBadRequest, "scope required")
		return
	}
	switch body.Scope {
	case "ont_admin", "ont_user", "connection_request", "pppoe":
	default:
		writeError(w, http.StatusBadRequest, "scope must be ont_admin, ont_user, connection_request, or pppoe")
		return
	}
	if strings.TrimSpace(body.Username) == "" && strings.TrimSpace(body.Password) == "" {
		writeError(w, http.StatusBadRequest, "username or password is required")
		return
	}
	if len(body.Username) > 128 || len(body.Password) > 128 {
		writeError(w, http.StatusBadRequest, "credential username/password must be <= 128 characters")
		return
	}
	if err := s.store.UpsertDeviceCredential(r.Context(), postgres.DefaultTenantID, deviceID, body.Scope, body.Username, body.Password, s.cipher); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "device.credentials.rotated", "device", deviceID.String(), map[string]interface{}{"scope": body.Scope})
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

type provisionAPIInput struct {
	SerialNumber           string `json:"serialNumber"`
	SerialSnake            string `json:"serial_number"`
	OUI                    string `json:"oui"`
	Manufacturer           string `json:"manufacturer"`
	WANIndex               int    `json:"wanIndex"`
	WANIndexSnake          int    `json:"wan_index"`
	VLANID                 *int   `json:"vlanId"`
	VLANIDSnake            *int   `json:"vlan_id"`
	VLANShort              *int   `json:"vlan"`
	PPPoEUsername          string `json:"pppoeUsername"`
	PPPoEUsernameSnake     string `json:"pppoe_username"`
	PPPoEPassword          string `json:"pppoePassword"`
	PPPoEPasswordSnake     string `json:"pppoe_password"`
	WiFiIndex              int    `json:"wifiIndex"`
	WiFiIndexSnake         int    `json:"wifi_index"`
	SSID                   string `json:"ssid"`
	SSIDKey                string `json:"ssidKey"`
	SSIDKeySnake           string `json:"ssid_key"`
	WiFiPasswordSnake      string `json:"wifi_password"`
	Passphrase             string `json:"passphrase"`
	WiFiEnabled            *bool  `json:"wifiEnabled"`
	WiFiEnabledSnake       *bool  `json:"wifi_enabled"`
	PeriodicInformInterval *int   `json:"periodicInformInterval"`
	PeriodicInformSnake    *int   `json:"periodic_inform_interval"`
	AutoApplyOnBoot        *bool  `json:"autoApplyOnBoot"`
	AutoApplyOnBootSnake   *bool  `json:"auto_apply_on_boot"`
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func firstNonNilInt(vals ...*int) *int {
	for _, v := range vals {
		if v != nil {
			return v
		}
	}
	return nil
}

func (s *Server) processProvisionPayload(w http.ResponseWriter, r *http.Request, serialOverride string) {
	var raw provisionAPIInput
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid provisioning JSON payload")
		return
	}
	serial := firstNonEmpty(serialOverride, raw.SerialNumber, raw.SerialSnake)
	if strings.TrimSpace(serial) == "" {
		writeError(w, http.StatusBadRequest, "serialNumber is required")
		return
	}
	vlan := firstNonNilInt(raw.VLANID, raw.VLANIDSnake, raw.VLANShort)
	if vlan != nil && (*vlan < 1 || *vlan > 4094) {
		writeError(w, http.StatusBadRequest, "vlanId must be between 1 and 4094")
		return
	}
	ssid := strings.TrimSpace(raw.SSID)
	if ssid != "" && len(ssid) > 32 {
		writeError(w, http.StatusBadRequest, "ssid must be <= 32 characters")
		return
	}
	ssidKey := firstNonEmpty(raw.SSIDKey, raw.SSIDKeySnake, raw.WiFiPasswordSnake, raw.Passphrase)
	if ssidKey != "" && (len(ssidKey) < 8 || len(ssidKey) > 63) {
		writeError(w, http.StatusBadRequest, "ssidKey must be 8–63 characters")
		return
	}
	wanIdx := raw.WANIndex
	if wanIdx <= 0 {
		wanIdx = raw.WANIndexSnake
	}
	wifiIdx := raw.WiFiIndex
	if wifiIdx <= 0 {
		wifiIdx = raw.WiFiIndexSnake
	}
	wifiEnabled := raw.WiFiEnabled
	if wifiEnabled == nil {
		wifiEnabled = raw.WiFiEnabledSnake
	}
	autoOnBoot := raw.AutoApplyOnBoot
	if autoOnBoot == nil {
		autoOnBoot = raw.AutoApplyOnBootSnake
	}

	periodic := firstNonNilInt(raw.PeriodicInformInterval, raw.PeriodicInformSnake)
	pppoeUser := firstNonEmpty(raw.PPPoEUsername, raw.PPPoEUsernameSnake)
	pppoePass := firstNonEmpty(raw.PPPoEPassword, raw.PPPoEPasswordSnake)
	if err := validateProvisioningFields(
		strings.ToUpper(strings.TrimSpace(serial)),
		raw.OUI,
		raw.Manufacturer,
		wanIdx,
		wifiIdx,
		vlan,
		pppoeUser,
		pppoePass,
		ssid,
		ssidKey,
		periodic,
	); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req := postgres.ProvisionRequest{
		SerialNumber:           serial,
		OUI:                    strings.ToUpper(strings.TrimSpace(raw.OUI)),
		Manufacturer:           strings.TrimSpace(raw.Manufacturer),
		WANIndex:               wanIdx,
		VLANID:                 vlan,
		PPPoEUsername:          pppoeUser,
		PPPoEPassword:          pppoePass,
		WiFiIndex:              wifiIdx,
		SSID:                   ssid,
		SSIDKey:                ssidKey,
		WiFiEnabled:            wifiEnabled,
		PeriodicInformInterval: periodic,
		AutoApplyOnBoot:        autoOnBoot,
	}

	res, err := s.store.UpsertAndQueueProvisioning(r.Context(), postgres.DefaultTenantID, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "device.auto_provisioning.configured", "device", strings.ToUpper(strings.TrimSpace(serial)), map[string]interface{}{
		"execution_mode": res.ExecutionMode,
		"vlan_id":        vlan,
		"pppoe_username": req.PPPoEUsername,
		"ssid":           req.SSID,
	})
	s.wsHub.Broadcast(websocket.Event{
		Type:     "provisioning." + res.ExecutionMode,
		TenantID: postgres.DefaultTenantID.String(),
		DeviceID: res.DeviceID.String(),
		Data: map[string]interface{}{
			"serial_number":  strings.ToUpper(strings.TrimSpace(serial)),
			"execution_mode": res.ExecutionMode,
			"task_id":        res.TaskID,
		},
	})
	writeJSON(w, http.StatusAccepted, map[string]interface{}{"success": true, "data": res})
}

func (s *Server) handleProvision(w http.ResponseWriter, r *http.Request) {
	s.processProvisionPayload(w, r, "")
}

func (s *Server) handleProvisionByDeviceID(w http.ResponseWriter, r *http.Request) {
	deviceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	var serial string
	if err := s.pool.QueryRow(r.Context(), `SELECT serial_number FROM devices WHERE id = $1 AND deleted_at IS NULL`, deviceID).Scan(&serial); err != nil {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	s.processProvisionPayload(w, r, serial)
}

func (s *Server) handleListProvisioning(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListProvisioningProfiles(r.Context(), postgres.DefaultTenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "items": items})
}

func (s *Server) handleGetProvisioning(w http.ResponseWriter, r *http.Request) {
	serial := chi.URLParam(r, "serial")
	item, err := s.store.GetProvisioningProfileBySerial(r.Context(), postgres.DefaultTenantID, serial)
	if err != nil {
		writeError(w, http.StatusNotFound, "provisioning profile not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": item})
}

func (s *Server) handleDeleteProvisioning(w http.ResponseWriter, r *http.Request) {
	serial := chi.URLParam(r, "serial")
	if err := s.store.DeleteProvisioningProfile(r.Context(), postgres.DefaultTenantID, serial); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleSoftDeleteDevice(w http.ResponseWriter, r *http.Request) {
	deviceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	_, err = s.pool.Exec(r.Context(), `UPDATE devices SET deleted_at = NOW(), admin_disabled = TRUE, status = 'disabled' WHERE id = $1`, deviceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "device.soft_delete", "device", deviceID.String(), map[string]interface{}{})
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	taskType := q.Get("taskType")
	status := q.Get("status")
	search := q.Get("search")
	items, err := s.store.ListTasks(r.Context(), postgres.DefaultTenantID, taskType, status, search, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	queue := s.store.GetSummonQueueSummary(r.Context(), postgres.DefaultTenantID)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"items":   items,
		"queue":   queue,
	})
}

func (s *Server) handleListFaults(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	status := r.URL.Query().Get("status")
	items, err := s.store.ListFaults(r.Context(), postgres.DefaultTenantID, status, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "items": items})
}

func (s *Server) handleUpdateFaultStatus(newStatus string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		faultID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid fault id")
			return
		}
		var body struct {
			Note string `json:"note"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if len(strings.TrimSpace(body.Note)) > 500 {
			writeError(w, http.StatusBadRequest, "resolution note must be <= 500 characters")
			return
		}
		if err := s.store.UpdateFaultStatus(r.Context(), faultID, newStatus, body.Note); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "status": newStatus})
	}
}

func (s *Server) handleDeleteFault(w http.ResponseWriter, r *http.Request) {
	faultID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid fault id")
		return
	}
	if err := s.store.DeleteFault(r.Context(), faultID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleListFirmware(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListFirmware(r.Context(), postgres.DefaultTenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jobs, _ := s.store.ListFirmwareJobs(r.Context(), postgres.DefaultTenantID)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "items": items, "jobs": jobs})
}

func (s *Server) handleUploadFirmware(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(128 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart upload")
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "firmware file is required")
		return
	}
	defer file.Close()

	mfg := strings.TrimSpace(r.FormValue("manufacturer"))
	modelName := strings.TrimSpace(r.FormValue("modelName"))
	version := strings.TrimSpace(r.FormValue("version"))
	releaseNotes := r.FormValue("releaseNotes")
	if mfg == "" || len(mfg) > 64 || modelName == "" || len(modelName) > 64 || version == "" || len(version) > 64 {
		writeError(w, http.StatusBadRequest, "manufacturer, modelName, and version are required (<= 64 chars)")
		return
	}
	if len(releaseNotes) > 2000 {
		writeError(w, http.StatusBadRequest, "releaseNotes must be <= 2000 characters")
		return
	}

	safeName := sanitizeFirmwareFilename(hdr.Filename)
	if safeName == "" {
		writeError(w, http.StatusBadRequest, "invalid firmware filename (use letters, digits, '.', '_', '-')")
		return
	}
	fwDir := s.cfg.Storage.FirmwareDir
	if fwDir == "" {
		fwDir = "./data/firmware"
	}
	_ = os.MkdirAll(fwDir, 0o755)
	absDir, err := filepath.Abs(fwDir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invalid firmware storage directory")
		return
	}
	dstPath := filepath.Join(absDir, safeName)
	if !strings.HasPrefix(dstPath, absDir+string(filepath.Separator)) {
		writeError(w, http.StatusBadRequest, "invalid firmware file path")
		return
	}
	dst, err := os.Create(dstPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer dst.Close()

	hasher := sha256.New()
	size, err := io.Copy(io.MultiWriter(dst, hasher), file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if size == 0 {
		_ = os.Remove(dstPath)
		writeError(w, http.StatusBadRequest, "firmware file cannot be empty")
		return
	}
	checksum := hex.EncodeToString(hasher.Sum(nil))

	row, err := s.store.CreateFirmware(r.Context(), postgres.DefaultTenantID, postgres.FirmwareRow{
		Manufacturer:     mfg,
		ModelName:        modelName,
		ProductClass:     strings.TrimSpace(r.FormValue("productClass")),
		HardwareRevision: strings.TrimSpace(r.FormValue("hardwareRevision")),
		Version:          version,
		FileName:         safeName,
		FileSize:         size,
		ChecksumSHA256:   checksum,
		SignatureStatus:  "unsigned",
		ReleaseNotes:     releaseNotes,
		StoragePath:      dstPath,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "firmware.upload", "firmware", row.ID.String(), map[string]interface{}{"file_name": safeName, "sha256": checksum})
	writeJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "data": row})
}

func (s *Server) handleDeleteFirmware(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid firmware id")
		return
	}
	storagePath, err := s.store.DeleteFirmware(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "firmware not found")
		return
	}
	if storagePath != "" {
		_ = os.Remove(storagePath)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleDeployFirmware(w http.ResponseWriter, r *http.Request) {
	fwID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid firmware id")
		return
	}
	var body struct {
		DeviceIDs []uuid.UUID `json:"deviceIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.DeviceIDs) == 0 {
		writeError(w, http.StatusBadRequest, "deviceIds required")
		return
	}
	baseFileURL := strings.TrimRight(strings.TrimSpace(s.cfg.Storage.PublicFileURL), "/")
	if baseFileURL == "" {
		host := validateHTTPRequestHost(r.Host)
		if host == "" {
			host = "127.0.0.1"
		}
		fsPort := "7567"
		if parts := strings.Split(s.cfg.Storage.FileServerListenAddr, ":"); len(parts) > 1 && parts[len(parts)-1] != "" {
			fsPort = parts[len(parts)-1]
		}
		baseFileURL = fmt.Sprintf("http://%s:%s", host, fsPort)
	}
	taskIDs, err := s.store.QueueFirmwareDeploy(r.Context(), postgres.DefaultTenantID, fwID, body.DeviceIDs, baseFileURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]interface{}{"success": true, "task_ids": taskIDs})
}

func (s *Server) handleListAliases(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.LoadAliases(r.Context(), postgres.DefaultTenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "items": items})
}

func (s *Server) handleCreateAlias(w http.ResponseWriter, r *http.Request) {
	var body mapping.AliasRule
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid alias JSON payload")
		return
	}
	if err := validateAliasFields(body.RawName, body.CanonicalName, body.OUI, body.Confidence, true); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	body.OUI = strings.ToUpper(strings.TrimSpace(body.OUI))
	created, err := s.store.CreateAlias(r.Context(), postgres.DefaultTenantID, body)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "data": created})
}

func (s *Server) handleUpdateAlias(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid alias id")
		return
	}
	var body mapping.AliasRule
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid alias payload")
		return
	}
	if err := validateAliasFields(body.RawName, body.CanonicalName, body.OUI, body.Confidence, false); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	body.OUI = strings.ToUpper(strings.TrimSpace(body.OUI))
	updated, err := s.store.UpdateAlias(r.Context(), id, body)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": updated})
}

func (s *Server) handleDeleteAlias(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid alias id")
		return
	}
	if err := s.store.DeleteAlias(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		SELECT u.id, u.username, u.full_name, u.status, COALESCE(r.name, 'Viewer'), u.last_login_at, u.created_at
		FROM users u
		LEFT JOIN user_roles ur ON ur.user_id = u.id
		LEFT JOIN roles r ON r.id = ur.role_id
		WHERE u.tenant_id = $1
		ORDER BY u.created_at ASC
	`, postgres.DefaultTenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	items := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id uuid.UUID
		var username, name, status, role string
		var lastLogin *time.Time
		var created time.Time
		if rows.Scan(&id, &username, &name, &status, &role, &lastLogin, &created) == nil {
			items = append(items, map[string]interface{}{
				"id": id, "username": username, "fullName": name, "status": status,
				"role": role, "lastLoginAt": lastLogin, "createdAt": created,
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "items": items})
}

func (s *Server) handleListRoles(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		SELECT r.id, r.name, r.description, r.is_system,
		       COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '{}')
		FROM roles r
		LEFT JOIN role_permissions rp ON rp.role_id = r.id
		LEFT JOIN permissions p ON p.id = rp.permission_id
		WHERE r.tenant_id = $1
		GROUP BY r.id
		ORDER BY r.name ASC
	`, postgres.DefaultTenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	items := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id uuid.UUID
		var name, desc string
		var isSys bool
		var perms []string
		if rows.Scan(&id, &name, &desc, &isSys, &perms) == nil {
			items = append(items, map[string]interface{}{
				"id": id, "name": name, "description": desc, "isSystem": isSys, "permissions": perms,
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "items": items})
}

func (s *Server) handleListPermissions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `SELECT id, code, description, is_high_risk FROM permissions ORDER BY code ASC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	items := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id uuid.UUID
		var code, desc string
		var highRisk bool
		if rows.Scan(&id, &code, &desc, &highRisk) == nil {
			items = append(items, map[string]interface{}{"id": id, "code": code, "description": desc, "isHighRisk": highRisk})
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "items": items})
}

func (s *Server) handleListAuditLogs(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `
		SELECT id, actor_email, action, target_type, target_id, metadata, created_at
		FROM audit_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200
	`, postgres.DefaultTenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	items := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id uuid.UUID
		var actor, action, tType, tID string
		var metaRaw []byte
		var created time.Time
		if rows.Scan(&id, &actor, &action, &tType, &tID, &metaRaw, &created) == nil {
			var meta map[string]interface{}
			_ = json.Unmarshal(metaRaw, &meta)
			items = append(items, map[string]interface{}{
				"id": id, "actorUsername": actor, "actorEmail": actor, "action": action,
				"targetType": tType, "targetId": tID, "metadata": meta, "createdAt": created,
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "items": items})
}

func (s *Server) handleGetSetting(w http.ResponseWriter, r *http.Request) {
	cat := chi.URLParam(r, "category")
	var raw json.RawMessage
	err := s.pool.QueryRow(r.Context(), `SELECT settings FROM system_settings WHERE tenant_id = $1 AND category = $2`, postgres.DefaultTenantID, cat).Scan(&raw)
	if err != nil {
		writeError(w, http.StatusNotFound, "setting category not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": raw})
}

func (s *Server) handlePutSetting(w http.ResponseWriter, r *http.Request) {
	cat := chi.URLParam(r, "category")
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid settings JSON")
		return
	}
	if err := validateSettingPayload(cat, raw); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.store.UpsertSetting(r.Context(), postgres.DefaultTenantID, cat, raw); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": raw})
}

func (s *Server) handleRevealCredentials(w http.ResponseWriter, r *http.Request) {
	deviceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid device id")
		return
	}
	creds, err := s.store.RevealDeviceCredentials(r.Context(), postgres.DefaultTenantID, deviceID, s.cipher)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "secret.revealed", "device", deviceID.String(), map[string]interface{}{"scopes": len(creds)})
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": creds})
}

func (s *Server) handleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListAPIKeys(r.Context(), postgres.DefaultTenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "items": items})
}

func (s *Server) handleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name   string   `json:"name"`
		Scopes []string `json:"scopes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if len(body.Scopes) == 0 {
		body.Scopes = []string{"provisioning:write", "devices:read"}
	}
	row, rawKey, err := s.store.CreateAPIKey(r.Context(), postgres.DefaultTenantID, body.Name, body.Scopes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	email, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, email, "api_key.created", "api_key", row.ID.String(), map[string]interface{}{"name": row.Name})
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"apiKey":  row,
			"rawKey":  rawKey,
			"warning": "Store this key securely; it will not be shown again.",
		},
	})
}

func (s *Server) handleRevokeAPIKey(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid api key id")
		return
	}
	if err := s.store.RevokeAPIKey(r.Context(), postgres.DefaultTenantID, id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		FullName string `json:"fullName"`
		Password string `json:"password"`
		Role     string `json:"role"`
		Status   string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	username := strings.ToLower(strings.TrimSpace(body.Username))
	if username == "" {
		username = strings.ToLower(strings.TrimSpace(body.Email))
	}
	if err := validateUsername(username); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Password) < 4 || len(body.Password) > 128 {
		writeError(w, http.StatusBadRequest, "password must be 4–128 characters")
		return
	}
	if strings.TrimSpace(body.Role) == "" {
		body.Role = "Viewer"
	}
	if err := validateRoleName(body.Role); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateUserStatus(body.Status); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	fullName := strings.TrimSpace(body.FullName)
	if fullName == "" {
		fullName = username
	}
	created, err := s.store.CreateUser(r.Context(), postgres.DefaultTenantID, username, fullName, body.Password, body.Role, body.Status)
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	actor, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, actor, "user.created", "user", created.Username, map[string]interface{}{"role": created.Role})
	writeJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "data": created})
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var body struct {
		FullName string `json:"fullName"`
		Role     string `json:"role"`
		Status   string `json:"status"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	if body.Password != "" && (len(body.Password) < 4 || len(body.Password) > 128) {
		writeError(w, http.StatusBadRequest, "password must be 4–128 characters")
		return
	}
	if body.Role != "" {
		if err := validateRoleName(body.Role); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if err := validateUserStatus(body.Status); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	actor, _ := s.callerFromRequest(r)
	updated, err := s.store.UpdateUser(r.Context(), postgres.DefaultTenantID, userID, body.FullName, body.Role, body.Status, body.Password, actor)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, actor, "user.updated", "user", updated.Username, map[string]interface{}{"role": updated.Role, "status": updated.Status})
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": updated})
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	actor, _ := s.callerFromRequest(r)
	if err := s.store.DeleteUser(r.Context(), postgres.DefaultTenantID, userID, actor); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, actor, "user.deleted", "user", userID.String(), map[string]interface{}{})
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleUpdateRolePermissions(w http.ResponseWriter, r *http.Request) {
	roleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid role id")
		return
	}
	var body struct {
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	roleName, savedPerms, err := s.store.UpdateRolePermissions(r.Context(), postgres.DefaultTenantID, roleID, body.Permissions)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	actor, _ := s.callerFromRequest(r)
	s.store.InsertAuditLog(r.Context(), postgres.DefaultTenantID, actor, "role.permissions_updated", "role", roleName, map[string]interface{}{"count": len(savedPerms)})
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": map[string]interface{}{"id": roleID, "name": roleName, "permissions": savedPerms}})
}

func (s *Server) securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "0")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		if strings.HasPrefix(r.URL.Path, "/api/v1/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		allowed := false
		wildcard := false
		for _, o := range s.cfg.API.CORSAllowedOrigins {
			if o == "*" {
				wildcard = true
				break
			}
			if origin != "" && strings.EqualFold(o, origin) {
				allowed = true
				break
			}
		}
		if wildcard {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]interface{}{
		"success": false,
		"error":   msg,
	})
}
