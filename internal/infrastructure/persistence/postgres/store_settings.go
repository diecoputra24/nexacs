package postgres

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nexaacs/nexaacs/internal/domain/device"
	"github.com/nexaacs/nexaacs/internal/platform/config"
	"github.com/nexaacs/nexaacs/internal/protocol/common/mapping"
)

type AutoSummonPolicy struct {
	Groups                  []string
	Events                  []string
	PeriodicCooldownSeconds int
	WorkerSyncMode          string // first_detect_only | realtime_loop | off
	WorkerCooldownSeconds   int
}

type RuntimeSettings struct {
	SystemName                       string
	Timezone                         string
	RetentionDays                    int
	OnlineThresholdSeconds           int
	PeriodicInformExpectationSeconds int
	NeverConnectedPolicy             string // separate_bucket | treat_unknown
	Thresholds                       device.ThresholdPolicy
	CWMPEndpoint                     string
	SessionTimeoutSeconds            int
	ConnectionRequestTimeoutSeconds  int
	AllowAutoEnrollment              bool
	USPControllerID                  string
	USPMTP                           string
	AutoSummon                       AutoSummonPolicy
}

func (s *Store) InvalidateSettingsCache() {
	s.settingsMu.Lock()
	s.cachedSettingsAt = time.Time{}
	s.cachedSettings = nil
	s.settingsMu.Unlock()
}

func (s *Store) LoadRuntimeSettings(ctx context.Context, tenantID uuid.UUID, baseCfg *config.Config) RuntimeSettings {
	rt := RuntimeSettings{
		SystemName:                       "NexACS",
		Timezone:                         "Asia/Jakarta",
		RetentionDays:                    90,
		OnlineThresholdSeconds:           1800,
		PeriodicInformExpectationSeconds: 900,
		NeverConnectedPolicy:             "separate_bucket",
		Thresholds:                       device.DefaultThresholdPolicy(),
		SessionTimeoutSeconds:            60,
		ConnectionRequestTimeoutSeconds:  10,
		AllowAutoEnrollment:              true,
		USPControllerID:                  "proto::nexaacs-controller",
		USPMTP:                           "mqtt",
		AutoSummon: AutoSummonPolicy{
			Groups:                  append([]string(nil), mapping.DefaultAutoSummonGroups...),
			Events:                  []string{"0 BOOTSTRAP", "1 BOOT", "4 VALUE CHANGE", "2 PERIODIC"},
			PeriodicCooldownSeconds: 300,
			WorkerSyncMode:          "first_detect_only",
			WorkerCooldownSeconds:   300,
		},
	}
	if baseCfg != nil {
		if baseCfg.Thresholds.OnlineThresholdSeconds > 0 {
			rt.OnlineThresholdSeconds = baseCfg.Thresholds.OnlineThresholdSeconds
			rt.Thresholds.OnlineThresholdSeconds = baseCfg.Thresholds.OnlineThresholdSeconds
		}
		if baseCfg.Thresholds.TempCriticalC > baseCfg.Thresholds.TempWarningC {
			rt.Thresholds.TempWarningC = baseCfg.Thresholds.TempWarningC
			rt.Thresholds.TempCriticalC = baseCfg.Thresholds.TempCriticalC
		}
		if baseCfg.Thresholds.RXStrongMinDBM != 0 {
			rt.Thresholds.RXStrongMinDBM = baseCfg.Thresholds.RXStrongMinDBM
			rt.Thresholds.RXGoodMinDBM = baseCfg.Thresholds.RXGoodMinDBM
			rt.Thresholds.RXAttentionMinDBM = baseCfg.Thresholds.RXAttentionMinDBM
			rt.Thresholds.RXWeakMinDBM = baseCfg.Thresholds.RXWeakMinDBM
		}
		if baseCfg.CWMP.SessionTimeoutSeconds > 0 {
			rt.SessionTimeoutSeconds = baseCfg.CWMP.SessionTimeoutSeconds
		}
		if baseCfg.CWMP.ConnectionRequestTimeoutSeconds > 0 {
			rt.ConnectionRequestTimeoutSeconds = baseCfg.CWMP.ConnectionRequestTimeoutSeconds
		}
		rt.AllowAutoEnrollment = baseCfg.CWMP.AllowAutoEnroll
		if baseCfg.USP.ControllerEndpointID != "" {
			rt.USPControllerID = baseCfg.USP.ControllerEndpointID
		}
		if baseCfg.USP.DefaultMTP != "" {
			rt.USPMTP = baseCfg.USP.DefaultMTP
		}
	}

	s.settingsMu.RLock()
	if s.cachedSettings != nil && time.Since(s.cachedSettingsAt) < 5*time.Second {
		cached := *s.cachedSettings
		s.settingsMu.RUnlock()
		return cached
	}
	s.settingsMu.RUnlock()

	rows, err := s.pool.Query(ctx, `SELECT category, settings FROM system_settings WHERE tenant_id = $1`, tenantID)
	if err != nil {
		return rt
	}
	defer rows.Close()

	for rows.Next() {
		var cat string
		var raw []byte
		if rows.Scan(&cat, &raw) != nil {
			continue
		}
		switch cat {
		case "general":
			var g struct {
				SystemName      string `json:"systemName"`
				SystemNameSnake string `json:"system_name"`
				Timezone        string `json:"timezone"`
				RetentionDays   int    `json:"retentionDays"`
				RetentionSnake  int    `json:"retention_days"`
			}
			if json.Unmarshal(raw, &g) == nil {
				if v := firstNonEmptyStr(g.SystemName, g.SystemNameSnake); v != "" {
					rt.SystemName = v
				}
				if v := strings.TrimSpace(g.Timezone); v != "" {
					rt.Timezone = v
				}
				if d := firstPositiveInt(g.RetentionDays, g.RetentionSnake); d > 0 {
					rt.RetentionDays = d
				}
			}
		case "device_status":
			var ds struct {
				OnlineThreshold      int    `json:"onlineThresholdSeconds"`
				OnlineThresholdSnake int    `json:"online_threshold_seconds"`
				PeriodicExpect       int    `json:"periodicInformExpectationSeconds"`
				PeriodicExpectSnake  int    `json:"periodic_inform_expectation_seconds"`
				NeverConnected       string `json:"neverConnectedPolicy"`
				NeverConnectedSnake  string `json:"never_connected_policy"`
			}
			if json.Unmarshal(raw, &ds) == nil {
				if v := firstPositiveInt(ds.OnlineThreshold, ds.OnlineThresholdSnake); v >= 30 {
					rt.OnlineThresholdSeconds = v
					rt.Thresholds.OnlineThresholdSeconds = v
				}
				if v := firstPositiveInt(ds.PeriodicExpect, ds.PeriodicExpectSnake); v >= 30 {
					rt.PeriodicInformExpectationSeconds = v
				}
				if p := firstNonEmptyStr(ds.NeverConnected, ds.NeverConnectedSnake); p == "separate_bucket" || p == "treat_unknown" {
					rt.NeverConnectedPolicy = p
				}
			}
		case "classification":
			var c struct {
				TempWarning       *float64 `json:"tempWarningC"`
				TempWarningSnake  *float64 `json:"temp_warning_c"`
				TempCritical      *float64 `json:"tempCriticalC"`
				TempCriticalSnake *float64 `json:"temp_critical_c"`
				RXStrong          *float64 `json:"rxStrongMinDbm"`
				RXStrongSnake     *float64 `json:"rx_strong_min_dbm"`
				RXGood            *float64 `json:"rxGoodMinDbm"`
				RXGoodSnake       *float64 `json:"rx_good_min_dbm"`
				RXAttention       *float64 `json:"rxAttentionMinDbm"`
				RXAttentionSnake  *float64 `json:"rx_attention_min_dbm"`
				RXWeak            *float64 `json:"rxWeakMinDbm"`
				RXWeakSnake       *float64 `json:"rx_weak_min_dbm"`
			}
			if json.Unmarshal(raw, &c) == nil {
				if tw := firstPtrFloat(c.TempWarning, c.TempWarningSnake); tw != nil {
					rt.Thresholds.TempWarningC = *tw
				}
				if tc := firstPtrFloat(c.TempCritical, c.TempCriticalSnake); tc != nil {
					rt.Thresholds.TempCriticalC = *tc
				}
				if rs := firstPtrFloat(c.RXStrong, c.RXStrongSnake); rs != nil {
					rt.Thresholds.RXStrongMinDBM = *rs
				}
				if rg := firstPtrFloat(c.RXGood, c.RXGoodSnake); rg != nil {
					rt.Thresholds.RXGoodMinDBM = *rg
				}
				if ra := firstPtrFloat(c.RXAttention, c.RXAttentionSnake); ra != nil {
					rt.Thresholds.RXAttentionMinDBM = *ra
				}
				if rw := firstPtrFloat(c.RXWeak, c.RXWeakSnake); rw != nil {
					rt.Thresholds.RXWeakMinDBM = *rw
				}
			}
		case "protocol":
			var p struct {
				CWMPEndpoint       string `json:"cwmpEndpoint"`
				CWMPEndpointSnake  string `json:"cwmp_endpoint"`
				SessionTimeout     int    `json:"sessionTimeoutSeconds"`
				SessionTimeoutSnk  int    `json:"session_timeout_seconds"`
				CRTimeout          int    `json:"connectionRequestTimeoutSeconds"`
				CRTimeoutSnake     int    `json:"connection_request_timeout_seconds"`
				AllowAutoEnroll    *bool  `json:"allowAutoEnrollment"`
				AllowAutoEnrollSnk *bool  `json:"allow_auto_enrollment"`
				USPController      string `json:"uspControllerId"`
				USPControllerSnake string `json:"usp_controller_id"`
				USPMTP             string `json:"uspMtp"`
				USPMTPSnake        string `json:"usp_mtp"`
			}
			if json.Unmarshal(raw, &p) == nil {
				if v := firstNonEmptyStr(p.CWMPEndpoint, p.CWMPEndpointSnake); v != "" {
					rt.CWMPEndpoint = v
				}
				if v := firstPositiveInt(p.SessionTimeout, p.SessionTimeoutSnk); v >= 10 {
					rt.SessionTimeoutSeconds = v
				}
				if v := firstPositiveInt(p.CRTimeout, p.CRTimeoutSnake); v >= 1 {
					rt.ConnectionRequestTimeoutSeconds = v
				}
				if p.AllowAutoEnroll != nil {
					rt.AllowAutoEnrollment = *p.AllowAutoEnroll
				} else if p.AllowAutoEnrollSnk != nil {
					rt.AllowAutoEnrollment = *p.AllowAutoEnrollSnk
				}
				if v := firstNonEmptyStr(p.USPController, p.USPControllerSnake); v != "" {
					rt.USPControllerID = v
				}
				if v := firstNonEmptyStr(p.USPMTP, p.USPMTPSnake); v != "" {
					rt.USPMTP = v
				}
			}
		case "auto_summon":
			var a struct {
				Groups          []string `json:"groups"`
				Events          []string `json:"events"`
				PeriodicCD      int      `json:"periodicCooldownSeconds"`
				PeriodicCDSnake int      `json:"periodic_cooldown_seconds"`
				WorkerMode      string   `json:"workerSyncMode"`
				WorkerModeSnake string   `json:"worker_sync_mode"`
				WorkerCD        int      `json:"workerCooldownSeconds"`
				WorkerCDSnake   int      `json:"worker_cooldown_seconds"`
			}
			if json.Unmarshal(raw, &a) == nil {
				if a.Groups != nil {
					rt.AutoSummon.Groups = a.Groups
				}
				if a.Events != nil {
					rt.AutoSummon.Events = a.Events
				}
				if v := firstPositiveInt(a.PeriodicCD, a.PeriodicCDSnake); v >= 10 {
					rt.AutoSummon.PeriodicCooldownSeconds = v
				}
				if m := firstNonEmptyStr(a.WorkerMode, a.WorkerModeSnake); m == "first_detect_only" || m == "realtime_loop" || m == "off" {
					rt.AutoSummon.WorkerSyncMode = m
				}
				if v := firstPositiveInt(a.WorkerCD, a.WorkerCDSnake); v >= 30 {
					rt.AutoSummon.WorkerCooldownSeconds = v
				}
			}
		}
	}

	s.settingsMu.Lock()
	copyRT := rt
	s.cachedSettings = &copyRT
	s.cachedSettingsAt = time.Now()
	s.settingsMu.Unlock()

	return rt
}

func (s *Store) IsDeviceEnrolled(ctx context.Context, tenantID uuid.UUID, serial string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM devices WHERE tenant_id = $1 AND UPPER(serial_number) = UPPER($2) AND deleted_at IS NULL
		)
	`, tenantID, strings.TrimSpace(serial)).Scan(&exists)
	return exists, err
}

func (s *Store) LoadCWMPProtocolSettings(ctx context.Context) (sessionTimeoutSec int, crTimeoutSec int, allowAutoEnroll bool) {
	rt := s.LoadRuntimeSettings(ctx, DefaultTenantID, nil)
	return rt.SessionTimeoutSeconds, rt.ConnectionRequestTimeoutSeconds, rt.AllowAutoEnrollment
}

func (s *Store) PruneExpiredTelemetry(ctx context.Context, tenantID uuid.UUID, retentionDays int) {
	if retentionDays < 1 {
		return
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays)
	_, _ = s.pool.Exec(ctx, `DELETE FROM device_events WHERE tenant_id = $1 AND created_at < $2`, tenantID, cutoff)
	_, _ = s.pool.Exec(ctx, `DELETE FROM parameter_history WHERE tenant_id = $1 AND created_at < $2`, tenantID, cutoff)
	_, _ = s.pool.Exec(ctx, `DELETE FROM protocol_sessions WHERE tenant_id = $1 AND started_at < $2`, tenantID, cutoff)
	_, _ = s.pool.Exec(ctx, `DELETE FROM tasks WHERE tenant_id = $1 AND status IN ('completed', 'failed', 'timeout', 'cancelled') AND created_at < $2`, tenantID, cutoff)
}

// ReapStaleSummonTasks expires stuck pending/queued/waiting/executing summon jobs older than staleAfter
// so offline or unreachable CPEs do not keep active queue counters stuck indefinitely.
func (s *Store) ReapStaleSummonTasks(ctx context.Context, tenantID uuid.UUID, staleAfter time.Duration) int64 {
	if staleAfter <= 0 {
		staleAfter = 5 * time.Minute
	}
	cutoff := time.Now().UTC().Add(-staleAfter)
	tag, err := s.pool.Exec(ctx, `
		UPDATE tasks
		SET status = 'timeout',
		    completed_at = NOW(),
		    result = CASE
		      WHEN result = '{}'::jsonb THEN '{"error":"Timed out waiting for CPE response"}'::jsonb
		      ELSE result
		    END
		WHERE tenant_id = $1
		  AND task_type IN ('summon', 'refresh_params')
		  AND status IN ('pending', 'queued', 'waiting_for_device', 'executing')
		  AND COALESCE(started_at, scheduled_at, created_at) < $2
	`, tenantID, cutoff)
	if err != nil {
		return 0
	}
	return tag.RowsAffected()
}

// PruneFinishedSummonTasks deletes completed/failed/timeout/cancelled summon rows older than keepDuration (default 1h)
// so summon logs stay compact without bloating PostgreSQL.
func (s *Store) PruneFinishedSummonTasks(ctx context.Context, tenantID uuid.UUID, keepDuration time.Duration) int64 {
	if keepDuration <= 0 {
		keepDuration = time.Hour
	}
	cutoff := time.Now().UTC().Add(-keepDuration)
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM tasks
		WHERE tenant_id = $1
		  AND task_type IN ('summon', 'refresh_params')
		  AND status IN ('completed', 'failed', 'timeout', 'cancelled')
		  AND COALESCE(completed_at, created_at) < $2
	`, tenantID, cutoff)
	if err != nil {
		return 0
	}
	return tag.RowsAffected()
}

// PruneOldFaults deletes fault rows older than keepDuration (default 24h) so faults retention stays within 1 day.
func (s *Store) PruneOldFaults(ctx context.Context, tenantID uuid.UUID, keepDuration time.Duration) int64 {
	if keepDuration <= 0 {
		keepDuration = 24 * time.Hour
	}
	cutoff := time.Now().UTC().Add(-keepDuration)
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM faults
		WHERE tenant_id = $1
		  AND COALESCE(resolved_at, created_at) < $2
	`, tenantID, cutoff)
	if err != nil {
		return 0
	}
	return tag.RowsAffected()
}

func firstNonEmptyStr(a, b string) string {
	if t := strings.TrimSpace(a); t != "" {
		return t
	}
	return strings.TrimSpace(b)
}

func firstPositiveInt(a, b int) int {
	if a > 0 {
		return a
	}
	return b
}

func firstPtrFloat(a, b *float64) *float64 {
	if a != nil {
		return a
	}
	return b
}
