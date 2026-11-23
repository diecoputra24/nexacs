package postgres

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexaacs/nexaacs/internal/domain/device"
	"github.com/nexaacs/nexaacs/internal/platform/security"
	"github.com/nexaacs/nexaacs/internal/protocol/common/mapping"
	"golang.org/x/crypto/bcrypt"
)

type DeviceParameterRow struct {
	Path           string     `json:"path"`
	CanonicalKey   string     `json:"canonicalKey,omitempty"`
	Value          *string    `json:"value"`
	ValueType      string     `json:"valueType"`
	ReadState      string     `json:"readState"`
	IsWritable     bool       `json:"isWritable"`
	IsSecret       bool       `json:"isSecret"`
	SourceProtocol string     `json:"sourceProtocol"`
	LastAttemptAt  *time.Time `json:"lastAttemptAt"`
	LastSuccessAt  *time.Time `json:"lastSuccessAt"`
}

type TaskRow struct {
	ID            uuid.UUID              `json:"id"`
	DeviceID      uuid.UUID              `json:"deviceId"`
	DeviceSerial  string                 `json:"deviceSerial"`
	Protocol      string                 `json:"protocol"`
	TaskType      string                 `json:"taskType"`
	Status        string                 `json:"status"`
	CorrelationID string                 `json:"correlationId"`
	Payload       map[string]interface{} `json:"payload"`
	Result        map[string]interface{} `json:"result"`
	RetryCount    int                    `json:"retryCount"`
	CreatedAt     time.Time              `json:"createdAt"`
	StartedAt     *time.Time             `json:"startedAt"`
	CompletedAt   *time.Time             `json:"completedAt"`
}

type SummonQueueSummary struct {
	ActiveCount    int `json:"activeCount"`
	QueuedCount    int `json:"queuedCount"`
	WaitingCount   int `json:"waitingCount"`
	ExecutingCount int `json:"executingCount"`
}

type FaultRow struct {
	ID            uuid.UUID  `json:"id"`
	DeviceID      uuid.UUID  `json:"deviceId"`
	DeviceSerial  string     `json:"deviceSerial"`
	TaskID        *uuid.UUID `json:"taskId,omitempty"`
	Protocol      string     `json:"protocol"`
	Category      string     `json:"category"`
	Operation     string     `json:"operation"`
	ErrorCode     string     `json:"errorCode"`
	ErrorMessage  string     `json:"errorMessage"`
	SanitizedLogs string     `json:"sanitizedLogs"`
	Status        string     `json:"status"`
	RetryCount    int        `json:"retryCount"`
	LastAttemptAt *time.Time `json:"lastAttemptAt"`
	CreatedAt     time.Time  `json:"createdAt"`
	ResolvedAt    *time.Time `json:"resolvedAt"`
}

type DeviceEventRow struct {
	ID        uuid.UUID              `json:"id"`
	Protocol  string                 `json:"protocol"`
	EventCode string                 `json:"eventCode"`
	Payload   map[string]interface{} `json:"payload"`
	CreatedAt time.Time              `json:"createdAt"`
}

type ProtocolSessionRow struct {
	ID              uuid.UUID  `json:"id"`
	Protocol        string     `json:"protocol"`
	ProtocolVersion string     `json:"protocolVersion"`
	SourceIP        string     `json:"sourceIp"`
	Status          string     `json:"status"`
	RPCCount        int        `json:"rpcCount"`
	StartedAt       time.Time  `json:"startedAt"`
	EndedAt         *time.Time `json:"endedAt"`
}

type FirmwareRow struct {
	ID               uuid.UUID `json:"id"`
	Manufacturer     string    `json:"manufacturer"`
	ModelName        string    `json:"modelName"`
	ProductClass     string    `json:"productClass"`
	HardwareRevision string    `json:"hardwareRevision"`
	Version          string    `json:"version"`
	FileName         string    `json:"fileName"`
	FileSize         int64     `json:"fileSize"`
	ChecksumSHA256   string    `json:"checksumSha256"`
	SignatureStatus  string    `json:"signatureStatus"`
	ReleaseNotes     string    `json:"releaseNotes"`
	StoragePath      string    `json:"storagePath"`
	CreatedAt        time.Time `json:"createdAt"`
}

type FirmwareJobRow struct {
	ID          uuid.UUID  `json:"id"`
	FirmwareID  uuid.UUID  `json:"firmwareId"`
	DeviceID    uuid.UUID  `json:"deviceId"`
	TaskID      *uuid.UUID `json:"taskId,omitempty"`
	Status      string     `json:"status"`
	ProgressPct int        `json:"progressPercent"`
	ErrorMsg    string     `json:"errorMessage"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type TelemetrySampleRow struct {
	Metric     string    `json:"metric"`
	Value      string    `json:"value"`
	RecordedAt time.Time `json:"recordedAt"`
}

type BucketCount struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type OverviewFilter struct {
	Manufacturer string
	Model        string
	ProductClass string
	Technology   string
	Protocol     string
	DeviceGroup  string
}

type OverviewStats struct {
	Total                int           `json:"total"`
	Online               int           `json:"online"`
	Offline              int           `json:"offline"`
	NeverConnected       int           `json:"neverConnected"`
	Disabled             int           `json:"disabled"`
	AvailabilityPct      float64       `json:"availabilityPct"`
	StatusBuckets        []BucketCount `json:"statusBuckets"`
	UptimeBuckets        []BucketCount `json:"uptimeBuckets"`
	TempBuckets          []BucketCount `json:"tempBuckets"`
	RXBuckets            []BucketCount `json:"rxBuckets"`
	TechBuckets          []BucketCount `json:"techBuckets"`
	ProtocolBuckets      []BucketCount `json:"protocolBuckets"`
	Manufacturers        []BucketCount `json:"manufacturers"`
	ProductClasses       []BucketCount `json:"productClasses"`
	Models               []BucketCount `json:"models"`
	FilterManufacturers  []string      `json:"filterManufacturers"`
	FilterModels         []string      `json:"filterModels"`
	FilterProductClasses []string      `json:"filterProductClasses"`
	FilterDeviceGroups   []string      `json:"filterDeviceGroups"`
}

type DeviceDetailResult struct {
	Device           device.Device        `json:"device"`
	Status           device.Status        `json:"status"`
	MatchedAlias     *mapping.AliasRule   `json:"matched_alias,omitempty"`
	Parameters       []DeviceParameterRow `json:"parameters"`
	Tasks            []TaskRow            `json:"tasks"`
	Faults           []FaultRow           `json:"faults"`
	Events           []DeviceEventRow     `json:"events"`
	Sessions         []ProtocolSessionRow `json:"sessions"`
	TelemetryHistory []TelemetrySampleRow `json:"telemetryHistory"`
}

type PendingCRTask struct {
	TaskID               uuid.UUID
	DeviceID             uuid.UUID
	SerialNumber         string
	ConnectionRequestURL string
	Username             string
	Password             string
	ReportedUsername     string
	ReportedPassword     string
}

func (s *Store) GetDeviceDetail(ctx context.Context, tenantID, deviceID uuid.UUID, onlineThreshold int) (*DeviceDetailResult, error) {
	var d device.Device
	var tech, proto string
	err := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, serial_number, oui, manufacturer_raw, manufacturer_canonical,
			manufacturer_source, manufacturer_confidence, product_class, model_name,
			hardware_version, software_version, technology_normalized, protocol, data_model_root,
			COALESCE(host(tr_source_ip), ''), COALESCE(host(wan_ip), ''), pppoe_username,
			connection_request_url, admin_disabled, device_group, online_threshold_seconds, periodic_inform_interval,
			last_inform_at, last_summon_at, last_param_sync_at,
			uptime_seconds, uptime_fetched_at, rx_power_dbm, rx_power_fetched_at,
			temperature_celsius, temperature_fetched_at, created_at, updated_at, deleted_at,
			COALESCE((SELECT de.event_code FROM device_events de WHERE de.device_id = devices.id ORDER BY de.created_at DESC LIMIT 1), '') AS last_event_code,
			(SELECT MAX(de.created_at) FROM device_events de WHERE de.device_id = devices.id AND de.event_code LIKE '0 BOOTSTRAP%') AS last_bootstrap_at,
			(SELECT MAX(de.created_at) FROM device_events de WHERE de.device_id = devices.id AND de.event_code LIKE '1 BOOT%') AS last_boot_at
		FROM devices
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
	`, deviceID, tenantID).Scan(
		&d.ID, &d.TenantID, &d.SerialNumber, &d.OUI, &d.ManufacturerRaw, &d.ManufacturerCanonical,
		&d.ManufacturerSource, &d.ManufacturerConfidence, &d.ProductClass, &d.ModelName,
		&d.HardwareVersion, &d.SoftwareVersion, &tech, &proto, &d.DataModelRoot,
		&d.TRSourceIP, &d.WANIP, &d.PPPoEUsername,
		&d.ConnectionRequestURL, &d.AdminDisabled, &d.DeviceGroup, &d.OnlineThresholdSeconds, &d.PeriodicInformInterval,
		&d.LastInformAt, &d.LastSummonAt, &d.LastParamSyncAt,
		&d.UptimeSeconds, &d.UptimeFetchedAt, &d.RXPowerDBM, &d.RXPowerFetchedAt,
		&d.TemperatureCelsius, &d.TemperatureFetchedAt, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
		&d.LastEventCode, &d.LastBootstrapAt, &d.LastBootAt,
	)
	if err != nil {
		return nil, err
	}
	d.TechnologyNormalized = device.Technology(tech)
	d.Protocol = device.Protocol(proto)

	aliases, _ := s.LoadAliases(ctx, tenantID)
	matchedAlias := matchAliasRule(aliases, d.OUI, d.ManufacturerRaw, d.ManufacturerCanonical)
	var vp *mapping.VirtualParameterMapping
	if matchedAlias != nil {
		vp = &matchedAlias.VirtualParameters
	}

	params := make([]DeviceParameterRow, 0)
	pRows, err := s.pool.Query(ctx, `
		SELECT parameter_path, COALESCE(canonical_key, ''), value, value_type, read_state,
		       is_writable, is_secret, source_protocol, last_attempt_at, last_success_at
		FROM device_parameters
		WHERE device_id = $1
		ORDER BY parameter_path ASC
	`, deviceID)
	if err == nil {
		defer pRows.Close()
		for pRows.Next() {
			var p DeviceParameterRow
			var ck string
			if err := pRows.Scan(
				&p.Path, &ck, &p.Value, &p.ValueType, &p.ReadState,
				&p.IsWritable, &p.IsSecret, &p.SourceProtocol, &p.LastAttemptAt, &p.LastSuccessAt,
			); err == nil {
				if vpKey := mapping.ResolveCanonicalKey(p.Path, vp); vpKey != "" {
					p.CanonicalKey = vpKey
				} else {
					p.CanonicalKey = ck
				}
				if p.IsSecret && p.Value != nil {
					masked := "••••••••"
					p.Value = &masked
				}
				params = append(params, p)
			}
		}
	}

	tasks, _ := s.listDeviceTasks(ctx, deviceID, 50)
	faults, _ := s.listDeviceFaults(ctx, deviceID, 50)
	events := make([]DeviceEventRow, 0)
	eRows, err := s.pool.Query(ctx, `
		SELECT id, protocol, event_code, payload, created_at
		FROM device_events WHERE device_id = $1 ORDER BY created_at DESC LIMIT 30
	`, deviceID)
	if err == nil {
		defer eRows.Close()
		for eRows.Next() {
			var ev DeviceEventRow
			var raw []byte
			if eRows.Scan(&ev.ID, &ev.Protocol, &ev.EventCode, &raw, &ev.CreatedAt) == nil {
				_ = json.Unmarshal(raw, &ev.Payload)
				events = append(events, ev)
			}
		}
	}

	sessions := make([]ProtocolSessionRow, 0)
	sRows, err := s.pool.Query(ctx, `
		SELECT id, protocol, protocol_version, COALESCE(host(source_ip), ''), status, rpc_count, started_at, ended_at
		FROM protocol_sessions WHERE device_id = $1 ORDER BY started_at DESC LIMIT 20
	`, deviceID)
	if err == nil {
		defer sRows.Close()
		for sRows.Next() {
			var sess ProtocolSessionRow
			if sRows.Scan(&sess.ID, &sess.Protocol, &sess.ProtocolVersion, &sess.SourceIP, &sess.Status, &sess.RPCCount, &sess.StartedAt, &sess.EndedAt) == nil {
				sessions = append(sessions, sess)
			}
		}
	}

	telemetryHistory := make([]TelemetrySampleRow, 0)
	hRows, err := s.pool.Query(ctx, `
		SELECT parameter_path, COALESCE(new_value, ''), created_at
		FROM parameter_history
		WHERE device_id = $1 AND parameter_path IN ('optical.rx_power_dbm', 'device.temperature_celsius')
		ORDER BY created_at DESC LIMIT 60
	`, deviceID)
	if err == nil {
		defer hRows.Close()
		for hRows.Next() {
			var h TelemetrySampleRow
			if hRows.Scan(&h.Metric, &h.Value, &h.RecordedAt) == nil {
				telemetryHistory = append(telemetryHistory, h)
			}
		}
	}
	// Reverse to chronological ascending for chart plotting
	for i, j := 0, len(telemetryHistory)-1; i < j; i, j = i+1, j-1 {
		telemetryHistory[i], telemetryHistory[j] = telemetryHistory[j], telemetryHistory[i]
	}

	if onlineThreshold > 0 {
		d.OnlineThresholdSeconds = onlineThreshold
	}

	return &DeviceDetailResult{
		Device:           d,
		Status:           d.ComputeStatus(time.Now().UTC(), onlineThreshold),
		MatchedAlias:     matchedAlias,
		Parameters:       params,
		Tasks:            tasks,
		Faults:           faults,
		Events:           events,
		Sessions:         sessions,
		TelemetryHistory: telemetryHistory,
	}, nil
}

// GetOverviewStats aggregates full-fleet KPIs and chart buckets directly in PostgreSQL
// so 10,000+ ONTs render instantaneously without transferring raw device payloads.
func (s *Store) GetOverviewStats(ctx context.Context, tenantID uuid.UUID, onlineThresh int, tp device.ThresholdPolicy, filter OverviewFilter) (*OverviewStats, error) {
	if onlineThresh <= 0 {
		onlineThresh = 1800
	}
	whereParts := []string{`tenant_id = $1`, `deleted_at IS NULL`}
	args := []interface{}{tenantID}
	addArg := func(v interface{}) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	if v := strings.TrimSpace(filter.Manufacturer); v != "" {
		whereParts = append(whereParts, `manufacturer_canonical = `+addArg(v))
	}
	if v := strings.TrimSpace(filter.Model); v != "" {
		whereParts = append(whereParts, `model_name = `+addArg(v))
	}
	if v := strings.TrimSpace(filter.ProductClass); v != "" {
		whereParts = append(whereParts, `product_class = `+addArg(v))
	}
	if v := strings.TrimSpace(filter.Technology); v != "" {
		whereParts = append(whereParts, `technology_normalized = `+addArg(v))
	}
	if v := strings.TrimSpace(filter.Protocol); v != "" {
		whereParts = append(whereParts, `protocol = `+addArg(v))
	}
	if v := strings.TrimSpace(filter.DeviceGroup); v != "" {
		whereParts = append(whereParts, `device_group = `+addArg(v))
	}
	whereSQL := strings.Join(whereParts, " AND ")

	threshPh := addArg(onlineThresh)
	tempWarnPh := addArg(tp.TempWarningC)
	tempCritPh := addArg(tp.TempCriticalC)
	rxStrongPh := addArg(tp.RXStrongMinDBM)
	rxGoodPh := addArg(tp.RXGoodMinDBM)
	rxAttPh := addArg(tp.RXAttentionMinDBM)
	rxWeakPh := addArg(tp.RXWeakMinDBM)

	var (
		total, online, offline, neverConn, disabled                   int
		off2h, off24h, off1d, off1w, off1mo                           int
		upLt1h, up1to12h, up12to24h, up1to7d, up7to30d, upGt1mo, upNA int
		tempNorm, tempWarn, tempCrit, tempNA                          int
		rxStrong, rxGood, rxAtt, rxWeak, rxVeryWeak, rxNA             int
		techGpon, techEpon, techRouter, techNA                        int
	)

	aggSQL := fmt.Sprintf(`
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE NOT admin_disabled AND last_inform_at IS NOT NULL AND last_inform_at >= NOW() - (%[1]s * INTERVAL '1 second'))::int,
			COUNT(*) FILTER (WHERE NOT admin_disabled AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - (%[1]s * INTERVAL '1 second'))::int,
			COUNT(*) FILTER (WHERE NOT admin_disabled AND last_inform_at IS NULL)::int,
			COUNT(*) FILTER (WHERE admin_disabled)::int,
			COUNT(*) FILTER (WHERE NOT admin_disabled AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - (%[1]s * INTERVAL '1 second') AND last_inform_at >= NOW() - INTERVAL '2 hours')::int,
			COUNT(*) FILTER (WHERE NOT admin_disabled AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - INTERVAL '2 hours' AND last_inform_at >= NOW() - INTERVAL '24 hours')::int,
			COUNT(*) FILTER (WHERE NOT admin_disabled AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - INTERVAL '24 hours' AND last_inform_at >= NOW() - INTERVAL '7 days')::int,
			COUNT(*) FILTER (WHERE NOT admin_disabled AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - INTERVAL '7 days' AND last_inform_at >= NOW() - INTERVAL '30 days')::int,
			COUNT(*) FILTER (WHERE NOT admin_disabled AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - INTERVAL '30 days')::int,
			COUNT(*) FILTER (WHERE uptime_seconds IS NOT NULL AND uptime_seconds >= 0 AND uptime_seconds < 3600)::int,
			COUNT(*) FILTER (WHERE uptime_seconds IS NOT NULL AND uptime_seconds >= 3600 AND uptime_seconds < 43200)::int,
			COUNT(*) FILTER (WHERE uptime_seconds IS NOT NULL AND uptime_seconds >= 43200 AND uptime_seconds < 86400)::int,
			COUNT(*) FILTER (WHERE uptime_seconds IS NOT NULL AND uptime_seconds >= 86400 AND uptime_seconds < 604800)::int,
			COUNT(*) FILTER (WHERE uptime_seconds IS NOT NULL AND uptime_seconds >= 604800 AND uptime_seconds < 2592000)::int,
			COUNT(*) FILTER (WHERE uptime_seconds IS NOT NULL AND uptime_seconds >= 2592000)::int,
			COUNT(*) FILTER (WHERE uptime_seconds IS NULL OR uptime_seconds < 0)::int,
			COUNT(*) FILTER (WHERE temperature_celsius IS NOT NULL AND temperature_celsius < %[2]s)::int,
			COUNT(*) FILTER (WHERE temperature_celsius IS NOT NULL AND temperature_celsius >= %[2]s AND temperature_celsius <= %[3]s)::int,
			COUNT(*) FILTER (WHERE temperature_celsius IS NOT NULL AND temperature_celsius > %[3]s)::int,
			COUNT(*) FILTER (WHERE temperature_celsius IS NULL)::int,
			COUNT(*) FILTER (WHERE rx_power_dbm IS NOT NULL AND rx_power_dbm >= %[4]s)::int,
			COUNT(*) FILTER (WHERE rx_power_dbm IS NOT NULL AND rx_power_dbm < %[4]s AND rx_power_dbm >= %[5]s)::int,
			COUNT(*) FILTER (WHERE rx_power_dbm IS NOT NULL AND rx_power_dbm < %[5]s AND rx_power_dbm >= %[6]s)::int,
			COUNT(*) FILTER (WHERE rx_power_dbm IS NOT NULL AND rx_power_dbm < %[6]s AND rx_power_dbm >= %[7]s)::int,
			COUNT(*) FILTER (WHERE rx_power_dbm IS NOT NULL AND rx_power_dbm < %[7]s)::int,
			COUNT(*) FILTER (WHERE rx_power_dbm IS NULL)::int,
			COUNT(*) FILTER (WHERE technology_normalized = 'GPON')::int,
			COUNT(*) FILTER (WHERE technology_normalized = 'EPON')::int,
			COUNT(*) FILTER (WHERE technology_normalized = 'Router')::int,
			COUNT(*) FILTER (WHERE technology_normalized NOT IN ('GPON', 'EPON', 'Router'))::int
		FROM devices WHERE %[8]s
	`, threshPh, tempWarnPh, tempCritPh, rxStrongPh, rxGoodPh, rxAttPh, rxWeakPh, whereSQL)

	if err := s.pool.QueryRow(ctx, aggSQL, args...).Scan(
		&total, &online, &offline, &neverConn, &disabled,
		&off2h, &off24h, &off1d, &off1w, &off1mo,
		&upLt1h, &up1to12h, &up12to24h, &up1to7d, &up7to30d, &upGt1mo, &upNA,
		&tempNorm, &tempWarn, &tempCrit, &tempNA,
		&rxStrong, &rxGood, &rxAtt, &rxWeak, &rxVeryWeak, &rxNA,
		&techGpon, &techEpon, &techRouter, &techNA,
	); err != nil {
		return nil, err
	}

	avail := 0.0
	denom := online + offline
	if denom > 0 {
		avail = float64(online) * 100.0 / float64(denom)
	}

	// Build grouped counts (use base filter args only: len(whereArgs) = len(args)-7)
	baseArgs := args[:len(args)-7]
	queryGroup := func(col string, limit int) []BucketCount {
		out := make([]BucketCount, 0)
		q := fmt.Sprintf(`
			SELECT COALESCE(NULLIF(TRIM(%s), ''), 'N/A') AS name, COUNT(*)::int AS cnt
			FROM devices WHERE %s
			GROUP BY 1 ORDER BY cnt DESC, name ASC LIMIT %d
		`, col, whereSQL, limit)
		rows, gerr := s.pool.Query(ctx, q, baseArgs...)
		if gerr != nil {
			return out
		}
		defer rows.Close()
		for rows.Next() {
			var b BucketCount
			if rows.Scan(&b.Name, &b.Value) == nil {
				out = append(out, b)
			}
		}
		return out
	}

	queryDistinct := func(col string) []string {
		out := make([]string, 0)
		q := fmt.Sprintf(`
			SELECT DISTINCT %s FROM devices
			WHERE tenant_id = $1 AND deleted_at IS NULL AND COALESCE(TRIM(%s), '') <> ''
			ORDER BY 1 ASC LIMIT 200
		`, col, col)
		rows, derr := s.pool.Query(ctx, q, tenantID)
		if derr != nil {
			return out
		}
		defer rows.Close()
		for rows.Next() {
			var sVal string
			if rows.Scan(&sVal) == nil {
				out = append(out, sVal)
			}
		}
		return out
	}

	return &OverviewStats{
		Total:           total,
		Online:          online,
		Offline:         offline,
		NeverConnected:  neverConn,
		Disabled:        disabled,
		AvailabilityPct: avail,
		StatusBuckets: []BucketCount{
			{Name: "Online", Value: online},
			{Name: "Offline < 2h", Value: off2h},
			{Name: "Offline 2–24h", Value: off24h},
			{Name: "Offline > 1d", Value: off1d},
			{Name: "Offline > 1w", Value: off1w},
			{Name: "Offline > 1mo", Value: off1mo},
			{Name: "Never Connected", Value: neverConn},
		},
		UptimeBuckets: []BucketCount{
			{Name: "< 1h", Value: upLt1h},
			{Name: "1–12h", Value: up1to12h},
			{Name: "12–24h", Value: up12to24h},
			{Name: "1–7d", Value: up1to7d},
			{Name: "7–30d", Value: up7to30d},
			{Name: "> 1 month", Value: upGt1mo},
			{Name: "N/A", Value: upNA},
		},
		TempBuckets: []BucketCount{
			{Name: "Normal", Value: tempNorm},
			{Name: "Warning", Value: tempWarn},
			{Name: "Critical", Value: tempCrit},
			{Name: "N/A", Value: tempNA},
		},
		RXBuckets: []BucketCount{
			{Name: "Sangat Kuat", Value: rxStrong},
			{Name: "Baik", Value: rxGood},
			{Name: "Perlu Perhatian", Value: rxAtt},
			{Name: "Lemah", Value: rxWeak},
			{Name: "Sangat Lemah", Value: rxVeryWeak},
			{Name: "N/A", Value: rxNA},
		},
		TechBuckets: []BucketCount{
			{Name: "GPON", Value: techGpon},
			{Name: "EPON", Value: techEpon},
			{Name: "Router", Value: techRouter},
			{Name: "N/A", Value: techNA},
		},
		ProtocolBuckets:      queryGroup("protocol", 10),
		Manufacturers:        queryGroup("manufacturer_canonical", 10),
		ProductClasses:       queryGroup("product_class", 8),
		Models:               queryGroup("model_name", 8),
		FilterManufacturers:  queryDistinct("manufacturer_canonical"),
		FilterModels:         queryDistinct("model_name"),
		FilterProductClasses: queryDistinct("product_class"),
		FilterDeviceGroups:   queryDistinct("device_group"),
	}, nil
}

func (s *Store) listDeviceTasks(ctx context.Context, deviceID uuid.UUID, limit int) ([]TaskRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT t.id, t.device_id, d.serial_number, t.protocol, t.task_type, t.status,
		       t.correlation_id, COALESCE(t.payload, '{}'::jsonb) - 'paths', t.result, t.retry_count, t.created_at, t.started_at, t.completed_at
		FROM tasks t JOIN devices d ON d.id = t.device_id
		WHERE t.device_id = $1
		ORDER BY t.created_at DESC LIMIT $2
	`, deviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTaskRows(rows)
}

func (s *Store) ListTasks(ctx context.Context, tenantID uuid.UUID, taskType, status, search string, limit int) ([]TaskRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	taskType = strings.TrimSpace(taskType)
	status = strings.TrimSpace(status)
	search = strings.TrimSpace(search)

	rows, err := s.pool.Query(ctx, `
		SELECT t.id, t.device_id, d.serial_number, t.protocol, t.task_type, t.status,
		       t.correlation_id, COALESCE(t.payload, '{}'::jsonb) - 'paths', t.result, t.retry_count, t.created_at, t.started_at, t.completed_at
		FROM tasks t JOIN devices d ON d.id = t.device_id
		WHERE t.tenant_id = $1
		  AND ($2 = '' OR (
		    CASE WHEN $2 = 'summon' THEN t.task_type IN ('summon', 'refresh_params')
		         ELSE t.task_type = $2
		    END
		  ))
		  AND ($3 = '' OR (
		    CASE WHEN $3 = 'active' THEN t.status IN ('pending', 'queued', 'waiting_for_device', 'executing')
		         WHEN $3 = 'failed' THEN t.status IN ('failed', 'timeout')
		         ELSE t.status = $3
		    END
		  ))
		  AND ($4 = '' OR d.serial_number ILIKE '%' || $4 || '%' OR COALESCE(t.correlation_id, '') ILIKE '%' || $4 || '%' OR COALESCE(t.result::text, '') ILIKE '%' || $4 || '%')
		ORDER BY
		  CASE WHEN t.status IN ('pending', 'queued', 'waiting_for_device', 'executing') THEN 0 ELSE 1 END,
		  t.created_at DESC
		LIMIT $5
	`, tenantID, taskType, status, search, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTaskRows(rows)
}

func (s *Store) GetSummonQueueSummary(ctx context.Context, tenantID uuid.UUID) SummonQueueSummary {
	var out SummonQueueSummary
	_ = s.pool.QueryRow(ctx, `
		SELECT
		  COUNT(*) FILTER (WHERE status IN ('pending', 'queued', 'waiting_for_device', 'executing'))::int,
		  COUNT(*) FILTER (WHERE status IN ('pending', 'queued'))::int,
		  COUNT(*) FILTER (WHERE status = 'waiting_for_device')::int,
		  COUNT(*) FILTER (WHERE status = 'executing')::int
		FROM tasks
		WHERE tenant_id = $1
		  AND task_type IN ('summon', 'refresh_params')
		  AND status IN ('pending', 'queued', 'waiting_for_device', 'executing')
	`, tenantID).Scan(&out.ActiveCount, &out.QueuedCount, &out.WaitingCount, &out.ExecutingCount)
	return out
}

func scanTaskRows(rows pgx.Rows) ([]TaskRow, error) {
	out := make([]TaskRow, 0)
	for rows.Next() {
		var r TaskRow
		var pRaw, resRaw []byte
		if err := rows.Scan(
			&r.ID, &r.DeviceID, &r.DeviceSerial, &r.Protocol, &r.TaskType, &r.Status,
			&r.CorrelationID, &pRaw, &resRaw, &r.RetryCount, &r.CreatedAt, &r.StartedAt, &r.CompletedAt,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(pRaw, &r.Payload)
		_ = json.Unmarshal(resRaw, &r.Result)
		out = append(out, r)
	}
	return out, nil
}

func (s *Store) listDeviceFaults(ctx context.Context, deviceID uuid.UUID, limit int) ([]FaultRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT f.id, f.device_id, d.serial_number, f.task_id, f.protocol, f.category, f.operation,
		       f.error_code, f.message, f.sanitized_logs, f.status, f.retry_count, f.last_attempt_at, f.created_at, f.resolved_at
		FROM faults f JOIN devices d ON d.id = f.device_id
		WHERE f.device_id = $1
		ORDER BY f.created_at DESC LIMIT $2
	`, deviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFaultRows(rows)
}

func (s *Store) ListFaults(ctx context.Context, tenantID uuid.UUID, status string, limit int) ([]FaultRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := s.pool.Query(ctx, `
		SELECT f.id, f.device_id, d.serial_number, f.task_id, f.protocol, f.category, f.operation,
		       f.error_code, f.message, f.sanitized_logs, f.status, f.retry_count, f.last_attempt_at, f.created_at, f.resolved_at
		FROM faults f JOIN devices d ON d.id = f.device_id
		WHERE f.tenant_id = $1 AND ($2 = '' OR f.status = $2)
		ORDER BY f.created_at DESC LIMIT $3
	`, tenantID, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFaultRows(rows)
}

func scanFaultRows(rows pgx.Rows) ([]FaultRow, error) {
	out := make([]FaultRow, 0)
	for rows.Next() {
		var r FaultRow
		if err := rows.Scan(
			&r.ID, &r.DeviceID, &r.DeviceSerial, &r.TaskID, &r.Protocol, &r.Category, &r.Operation,
			&r.ErrorCode, &r.ErrorMessage, &r.SanitizedLogs, &r.Status, &r.RetryCount, &r.LastAttemptAt, &r.CreatedAt, &r.ResolvedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

func (s *Store) UpdateFaultStatus(ctx context.Context, faultID uuid.UUID, newStatus, note string) error {
	var resolvedExpr string
	if newStatus == "resolved" {
		resolvedExpr = ", resolved_at = NOW()"
	}
	q := fmt.Sprintf(`UPDATE faults SET status = $2, resolution_note = CASE WHEN $3 <> '' THEN $3 ELSE resolution_note END%s WHERE id = $1`, resolvedExpr)
	_, err := s.pool.Exec(ctx, q, faultID, newStatus, note)
	return err
}

func (s *Store) DeleteFault(ctx context.Context, faultID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM faults WHERE id = $1`, faultID)
	return err
}

func (s *Store) CreateAlias(ctx context.Context, tenantID uuid.UUID, rule mapping.AliasRule) (*mapping.AliasRule, error) {
	vpJSON, _ := json.Marshal(rule.VirtualParameters)
	if rule.Confidence == "" {
		rule.Confidence = "high"
	}
	if rule.Source == "" {
		rule.Source = "manual"
	}
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `
		INSERT INTO device_manufacturer_aliases (tenant_id, raw_name, canonical_name, oui, source, confidence, virtual_parameters)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, tenantID, rule.RawName, rule.CanonicalName, rule.OUI, rule.Source, rule.Confidence, vpJSON).Scan(&id)
	if err != nil {
		return nil, err
	}
	rule.ID = id.String()
	return &rule, nil
}

func (s *Store) UpdateAlias(ctx context.Context, aliasID uuid.UUID, rule mapping.AliasRule) (*mapping.AliasRule, error) {
	vpJSON, _ := json.Marshal(rule.VirtualParameters)
	if rule.Confidence == "" {
		rule.Confidence = "high"
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE device_manufacturer_aliases
		SET raw_name = $2, canonical_name = $3, oui = $4, confidence = $5, virtual_parameters = $6
		WHERE id = $1
	`, aliasID, rule.RawName, rule.CanonicalName, rule.OUI, rule.Confidence, vpJSON)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, errors.New("alias not found")
	}
	rule.ID = aliasID.String()
	return &rule, nil
}

func (s *Store) DeleteAlias(ctx context.Context, aliasID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM device_manufacturer_aliases WHERE id = $1`, aliasID)
	return err
}

func (s *Store) ListFirmware(ctx context.Context, tenantID uuid.UUID) ([]FirmwareRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, manufacturer, model_name, product_class, hardware_revision, version,
		       file_name, file_size, checksum_sha256, signature_status, release_notes, storage_path, created_at
		FROM firmware_files
		WHERE tenant_id = $1
		ORDER BY created_at DESC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]FirmwareRow, 0)
	for rows.Next() {
		var r FirmwareRow
		if err := rows.Scan(
			&r.ID, &r.Manufacturer, &r.ModelName, &r.ProductClass, &r.HardwareRevision, &r.Version,
			&r.FileName, &r.FileSize, &r.ChecksumSHA256, &r.SignatureStatus, &r.ReleaseNotes, &r.StoragePath, &r.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

func (s *Store) CreateFirmware(ctx context.Context, tenantID uuid.UUID, row FirmwareRow) (*FirmwareRow, error) {
	err := s.pool.QueryRow(ctx, `
		INSERT INTO firmware_files (
			tenant_id, manufacturer, model_name, product_class, hardware_revision,
			version, file_name, file_size, checksum_sha256, signature_status, release_notes, storage_path
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING id, created_at
	`, tenantID, row.Manufacturer, row.ModelName, row.ProductClass, row.HardwareRevision,
		row.Version, row.FileName, row.FileSize, row.ChecksumSHA256, row.SignatureStatus, row.ReleaseNotes, row.StoragePath,
	).Scan(&row.ID, &row.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Store) DeleteFirmware(ctx context.Context, id uuid.UUID) (string, error) {
	var storagePath string
	err := s.pool.QueryRow(ctx, `DELETE FROM firmware_files WHERE id = $1 RETURNING storage_path`, id).Scan(&storagePath)
	return storagePath, err
}

func (s *Store) ListFirmwareJobs(ctx context.Context, tenantID uuid.UUID) ([]FirmwareJobRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, firmware_id, device_id, task_id, status, progress_percent, error_message, created_at
		FROM firmware_jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]FirmwareJobRow, 0)
	for rows.Next() {
		var r FirmwareJobRow
		if err := rows.Scan(&r.ID, &r.FirmwareID, &r.DeviceID, &r.TaskID, &r.Status, &r.ProgressPct, &r.ErrorMsg, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

func (s *Store) QueueFirmwareDeploy(ctx context.Context, tenantID, firmwareID uuid.UUID, deviceIDs []uuid.UUID, baseFileURL string) ([]uuid.UUID, error) {
	var fileName string
	var fileSize int64
	if err := s.pool.QueryRow(ctx, `SELECT file_name, file_size FROM firmware_files WHERE id = $1`, firmwareID).Scan(&fileName, &fileSize); err != nil {
		return nil, err
	}
	downloadURL := fmt.Sprintf("%s/%s", baseFileURL, fileName)
	payload, _ := json.Marshal(map[string]interface{}{
		"url":       downloadURL,
		"file_name": fileName,
		"file_size": fileSize,
		"file_type": "1 Firmware Upgrade Image",
	})

	taskIDs := make([]uuid.UUID, 0, len(deviceIDs))
	for _, devID := range deviceIDs {
		var tid uuid.UUID
		if err := s.pool.QueryRow(ctx, `
			INSERT INTO tasks (tenant_id, device_id, protocol, task_type, status, payload)
			VALUES ($1, $2, 'TR-069', 'download_firmware', 'queued', $3)
			RETURNING id
		`, tenantID, devID, payload).Scan(&tid); err != nil {
			return nil, err
		}
		_, _ = s.pool.Exec(ctx, `
			INSERT INTO firmware_jobs (tenant_id, firmware_id, device_id, task_id, status, progress_percent)
			VALUES ($1, $2, $3, $4, 'queued', 0)
		`, tenantID, firmwareID, devID, tid)
		taskIDs = append(taskIDs, tid)
	}
	return taskIDs, nil
}

func (s *Store) UpsertSetting(ctx context.Context, tenantID uuid.UUID, category string, payload json.RawMessage) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO system_settings (tenant_id, category, settings, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (tenant_id, category) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
	`, tenantID, category, payload)
	if err == nil {
		s.InvalidateSettingsCache()
	}
	return err
}

func (s *Store) UpsertDeviceCredential(ctx context.Context, tenantID, deviceID uuid.UUID, scope, username, plainPassword string, cipher *security.SecretCipher) error {
	var enc []byte
	if plainPassword != "" {
		if cipher == nil {
			return errors.New("secret cipher not configured")
		}
		var err error
		enc, err = cipher.Encrypt(plainPassword)
		if err != nil {
			return err
		}
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO device_credentials (tenant_id, device_id, credential_scope, username, password_ciphertext, rotated_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		ON CONFLICT (device_id, credential_scope) DO UPDATE SET
			username = CASE WHEN EXCLUDED.username <> '' THEN EXCLUDED.username ELSE device_credentials.username END,
			password_ciphertext = COALESCE(EXCLUDED.password_ciphertext, device_credentials.password_ciphertext),
			rotated_at = NOW(),
			updated_at = NOW()
	`, tenantID, deviceID, scope, username, enc)
	return err
}

func (s *Store) GetDashboardDistributions(ctx context.Context, tenantID uuid.UUID, metric string, policy device.ThresholdPolicy) (map[string]int, error) {
	devices, _, err := s.ListDevices(ctx, tenantID, 10000, 0)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	counts := make(map[string]int)
	for i := range devices {
		d := &devices[i]
		var bucket string
		switch metric {
		case "status":
			bucket = device.ClassifyStatusBucket(d, now, policy.OnlineThresholdSeconds)
		case "uptime":
			bucket = device.ClassifyUptimeBucket(d.UptimeSeconds)
		case "temperature":
			bucket = device.ClassifyTemperature(d.TemperatureCelsius, policy)
		case "rx_power":
			bucket = device.ClassifyRXPower(d.RXPowerDBM, policy)
		case "technology":
			bucket = string(d.TechnologyNormalized)
			if bucket == "" {
				bucket = "N/A"
			}
		case "manufacturer":
			bucket = d.ManufacturerCanonical
			if bucket == "" {
				bucket = "Lainnya"
			}
		case "product_class":
			bucket = d.ProductClass
			if bucket == "" {
				bucket = "N/A"
			}
		case "model":
			bucket = d.ModelName
			if bucket == "" {
				bucket = "N/A"
			}
		default:
			bucket = "Unknown"
		}
		counts[bucket]++
	}
	return counts, nil
}

func (s *Store) InsertAuditLog(ctx context.Context, tenantID uuid.UUID, actorEmail, action, targetType, targetID string, metadata map[string]interface{}) {
	raw, _ := json.Marshal(metadata)
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO audit_logs (tenant_id, actor_email, action, target_type, target_id, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, tenantID, actorEmail, action, targetType, targetID, raw)
}

func (s *Store) ListPendingConnectionRequestTasks(ctx context.Context, cipher *security.SecretCipher) ([]PendingCRTask, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (d.id) t.id, d.id, d.serial_number, d.connection_request_url,
		       COALESCE(dc.username, ''), dc.password_ciphertext,
		       COALESCE((SELECT dp.value FROM device_parameters dp WHERE dp.device_id = d.id AND dp.parameter_path LIKE '%.ManagementServer.ConnectionRequestUsername' LIMIT 1), ''),
		       COALESCE((SELECT dp.value FROM device_parameters dp WHERE dp.device_id = d.id AND dp.parameter_path LIKE '%.ManagementServer.ConnectionRequestPassword' LIMIT 1), '')
		FROM tasks t
		JOIN devices d ON d.id = t.device_id
		LEFT JOIN device_credentials dc ON dc.device_id = d.id AND dc.credential_scope = 'connection_request'
		WHERE t.status = 'queued'
		  AND t.scheduled_at <= NOW()
		  AND COALESCE(t.payload->>'blocked_by', '') = ''
		  AND d.deleted_at IS NULL
		  AND d.admin_disabled = FALSE
		  AND d.connection_request_url <> ''
		ORDER BY d.id, t.scheduled_at ASC
		LIMIT 50
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PendingCRTask
	for rows.Next() {
		var item PendingCRTask
		var pwdRaw []byte
		if err := rows.Scan(&item.TaskID, &item.DeviceID, &item.SerialNumber, &item.ConnectionRequestURL, &item.Username, &pwdRaw, &item.ReportedUsername, &item.ReportedPassword); err != nil {
			return nil, err
		}
		if len(pwdRaw) > 0 && cipher != nil {
			if plain, err := cipher.Decrypt(pwdRaw); err == nil {
				item.Password = plain
			}
		}
		out = append(out, item)
	}
	return out, nil
}

// QueueRealtimeAutoSummon queues periodic background Summon tasks for online reachable devices
// honoring AutoSummonPolicy (WorkerSyncMode: first_detect_only | realtime_loop | off).
func (s *Store) QueueRealtimeAutoSummon(ctx context.Context, tenantID uuid.UUID, onlineThresholdSec int, policy AutoSummonPolicy, batchLimit int) (int, error) {
	if policy.WorkerSyncMode == "off" || len(policy.Groups) == 0 {
		return 0, nil
	}
	if onlineThresholdSec <= 0 {
		onlineThresholdSec = 1800
	}
	refreshIntervalSec := policy.WorkerCooldownSeconds
	if refreshIntervalSec <= 0 {
		refreshIntervalSec = 300
	}
	if batchLimit <= 0 {
		batchLimit = 5
	}

	firstDetectClause := `(d.last_summon_at IS NULL OR d.last_summon_at < NOW() - ($3 * INTERVAL '1 second'))`
	if policy.WorkerSyncMode == "" || policy.WorkerSyncMode == "first_detect_only" {
		firstDetectClause = `d.last_summon_at IS NULL`
	}

	rows, err := s.pool.Query(ctx, `
		SELECT d.id, d.oui, d.manufacturer_raw, d.manufacturer_canonical, d.protocol, d.data_model_root
		FROM devices d
		WHERE d.tenant_id = $1
		  AND d.deleted_at IS NULL
		  AND d.admin_disabled = FALSE
		  AND d.connection_request_url <> ''
		  AND d.last_inform_at IS NOT NULL
		  AND d.last_inform_at >= NOW() - ($2 * INTERVAL '1 second')
		  AND `+firstDetectClause+`
		  AND NOT EXISTS (
		    SELECT 1 FROM tasks t
		    WHERE t.device_id = d.id
		      AND (
		        t.status IN ('queued', 'waiting_for_device', 'executing')
		        OR (t.task_type IN ('summon', 'refresh_params') AND t.created_at > NOW() - ($3 * INTERVAL '1 second'))
		      )
		  )
		ORDER BY d.last_summon_at ASC NULLS FIRST, d.last_inform_at DESC
		LIMIT $4
	`, tenantID, onlineThresholdSec, refreshIntervalSec, batchLimit)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	aliases, _ := s.LoadAliases(ctx, tenantID)
	type candidate struct {
		id     uuid.UUID
		oui    string
		mfgRaw string
		mfgCan string
		proto  string
		root   string
	}
	cands := make([]candidate, 0, batchLimit)
	for rows.Next() {
		var c candidate
		if rows.Scan(&c.id, &c.oui, &c.mfgRaw, &c.mfgCan, &c.proto, &c.root) == nil {
			cands = append(cands, c)
		}
	}

	queued := 0
	for _, c := range cands {
		matched := matchAliasRule(aliases, c.oui, c.mfgRaw, c.mfgCan)
		var vp *mapping.VirtualParameterMapping
		if matched != nil {
			vp = &matched.VirtualParameters
		}
		if c.root == "" {
			c.root = "InternetGatewayDevice."
		}
		if c.proto == "" {
			c.proto = "TR-069"
		}
		paths := mapping.ResolveSummonPaths(c.root, vp, policy.Groups)
		if len(paths) == 0 {
			continue
		}
		payloadRaw, _ := json.Marshal(map[string]interface{}{
			"source": "realtime_auto_sync",
			"groups": policy.Groups,
			"paths":  paths,
		})
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO tasks (tenant_id, device_id, protocol, task_type, status, payload, scheduled_at)
			VALUES ($1, $2, $3, 'summon', 'queued', $4, NOW())
		`, tenantID, c.id, c.proto, payloadRaw); err == nil {
			queued++
		}
	}
	return queued, nil
}

// QueueBatchSummon queues summon tasks in a single database query batch for the requested device IDs,
// skipping disabled devices and devices that already have an active summon task in flight.
func (s *Store) QueueBatchSummon(ctx context.Context, tenantID uuid.UUID, deviceIDs []uuid.UUID, groups []string) ([]uuid.UUID, error) {
	if len(deviceIDs) == 0 {
		return nil, nil
	}
	if len(groups) == 0 {
		groups = []string{"vparams"}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT d.id, d.oui, d.manufacturer_raw, d.manufacturer_canonical, d.protocol, d.data_model_root
		FROM devices d
		WHERE d.tenant_id = $1
		  AND d.id = ANY($2)
		  AND d.deleted_at IS NULL
		  AND d.admin_disabled = FALSE
		  AND NOT EXISTS (
		    SELECT 1 FROM tasks t
		    WHERE t.device_id = d.id
		      AND t.task_type IN ('summon', 'refresh_params')
		      AND t.status IN ('queued', 'waiting_for_device', 'executing')
		  )
	`, tenantID, deviceIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type rowDev struct {
		id     uuid.UUID
		oui    string
		mfgRaw string
		mfgCan string
		proto  string
		root   string
	}
	var cands []rowDev
	for rows.Next() {
		var c rowDev
		if rows.Scan(&c.id, &c.oui, &c.mfgRaw, &c.mfgCan, &c.proto, &c.root) == nil {
			cands = append(cands, c)
		}
	}
	if len(cands) == 0 {
		return nil, nil
	}

	aliases, _ := s.LoadAliases(ctx, tenantID)
	var batch pgx.Batch
	taskIDs := make([]uuid.UUID, 0, len(cands))
	for _, c := range cands {
		matched := matchAliasRule(aliases, c.oui, c.mfgRaw, c.mfgCan)
		var vp *mapping.VirtualParameterMapping
		if matched != nil {
			vp = &matched.VirtualParameters
		}
		root := c.root
		if root == "" {
			root = "InternetGatewayDevice."
		}
		proto := c.proto
		if proto == "" {
			proto = "TR-069"
		}
		paths := mapping.ResolveSummonPaths(root, vp, groups)
		if len(paths) == 0 {
			continue
		}
		tid := uuid.New()
		taskIDs = append(taskIDs, tid)
		payloadRaw, _ := json.Marshal(map[string]interface{}{
			"source": "ui_batch_summon",
			"groups": groups,
			"paths":  paths,
		})
		batch.Queue(`
			INSERT INTO tasks (id, tenant_id, device_id, protocol, task_type, status, payload, scheduled_at)
			VALUES ($1, $2, $3, $4, 'summon', 'queued', $5, NOW())
		`, tid, tenantID, c.id, proto, payloadRaw)
	}
	if batch.Len() == 0 {
		return nil, nil
	}
	br := s.pool.SendBatch(ctx, &batch)
	defer func() { _ = br.Close() }()
	for i := 0; i < batch.Len(); i++ {
		if _, err := br.Exec(); err != nil {
			return taskIDs[:i], err
		}
	}
	return taskIDs, nil
}

// LookupUserPermissions returns role name and permission codes for a tenant user.
func (s *Store) LookupUserPermissions(ctx context.Context, tenantID uuid.UUID, username string) (string, []string, error) {
	var roleName string
	err := s.pool.QueryRow(ctx, `
		SELECT r.name
		FROM users u
		JOIN user_roles ur ON ur.user_id = u.id
		JOIN roles r ON r.id = ur.role_id
		WHERE u.tenant_id = $1 AND LOWER(u.username) = LOWER($2) AND u.status = 'active'
		LIMIT 1
	`, tenantID, username).Scan(&roleName)
	if errors.Is(err, pgx.ErrNoRows) {
		// Fail closed to least-privilege Viewer rather than escalating unknown accounts.
		return "Viewer", []string{}, nil
	} else if err != nil {
		return "", nil, err
	}

	pRows, err := s.pool.Query(ctx, `
		SELECT p.code
		FROM roles r
		JOIN role_permissions rp ON rp.role_id = r.id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE r.tenant_id = $1 AND r.name = $2
	`, tenantID, roleName)
	if err != nil {
		return roleName, nil, err
	}
	defer pRows.Close()

	perms := make([]string, 0)
	for pRows.Next() {
		var code string
		if pRows.Scan(&code) == nil {
			perms = append(perms, code)
		}
	}
	return roleName, perms, nil
}

type APIKeyRow struct {
	ID         uuid.UUID  `json:"id"`
	Name       string     `json:"name"`
	KeyPrefix  string     `json:"keyPrefix"`
	Scopes     []string   `json:"scopes"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
	ExpiresAt  *time.Time `json:"expiresAt"`
	RevokedAt  *time.Time `json:"revokedAt"`
	CreatedAt  time.Time  `json:"createdAt"`
}

func (s *Store) AuthenticateUser(ctx context.Context, tenantID uuid.UUID, username, password string) (string, []string, error) {
	var hash, status string
	err := s.pool.QueryRow(ctx, `
		SELECT password_hash, status
		FROM users
		WHERE tenant_id = $1 AND LOWER(username) = LOWER($2)
	`, tenantID, strings.TrimSpace(username)).Scan(&hash, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, errors.New("invalid username or password")
	}
	if err != nil {
		return "", nil, err
	}
	if status != "active" {
		return "", nil, errors.New("account is not active")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return "", nil, errors.New("invalid username or password")
	}
	_, _ = s.pool.Exec(ctx, `UPDATE users SET last_login_at = NOW() WHERE tenant_id = $1 AND LOWER(username) = LOWER($2)`, tenantID, strings.TrimSpace(username))
	return s.LookupUserPermissions(ctx, tenantID, username)
}

func hashAPIKey(rawKey string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(rawKey)))
	return hex.EncodeToString(sum[:])
}

func (s *Store) ValidateAPIKey(ctx context.Context, rawKey string) (uuid.UUID, string, []string, error) {
	if strings.TrimSpace(rawKey) == "" {
		return uuid.Nil, "", nil, errors.New("empty api key")
	}
	keyHash := hashAPIKey(rawKey)
	var id, tenantID uuid.UUID
	var name string
	var scopesRaw []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, tenant_id, name, scopes
		FROM api_keys
		WHERE key_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
	`, keyHash).Scan(&id, &tenantID, &name, &scopesRaw)
	if err != nil {
		return uuid.Nil, "", nil, errors.New("invalid or revoked api key")
	}
	var scopes []string
	_ = json.Unmarshal(scopesRaw, &scopes)
	_, _ = s.pool.Exec(ctx, `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, id)
	return tenantID, "api-key:" + name, scopes, nil
}

func (s *Store) CreateAPIKey(ctx context.Context, tenantID uuid.UUID, name string, scopes []string) (*APIKeyRow, string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return nil, "", err
	}
	rawKey := "nxk_" + hex.EncodeToString(buf)
	prefix := rawKey[:12]
	keyHash := hashAPIKey(rawKey)
	scopesRaw, _ := json.Marshal(scopes)

	var row APIKeyRow
	err := s.pool.QueryRow(ctx, `
		INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, scopes)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, key_prefix, created_at
	`, tenantID, strings.TrimSpace(name), prefix, keyHash, scopesRaw).Scan(&row.ID, &row.Name, &row.KeyPrefix, &row.CreatedAt)
	if err != nil {
		return nil, "", err
	}
	row.Scopes = scopes
	return &row, rawKey, nil
}

func (s *Store) ListAPIKeys(ctx context.Context, tenantID uuid.UUID) ([]APIKeyRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at
		FROM api_keys
		WHERE tenant_id = $1
		ORDER BY created_at DESC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]APIKeyRow, 0)
	for rows.Next() {
		var r APIKeyRow
		var raw []byte
		if rows.Scan(&r.ID, &r.Name, &r.KeyPrefix, &raw, &r.LastUsedAt, &r.ExpiresAt, &r.RevokedAt, &r.CreatedAt) == nil {
			_ = json.Unmarshal(raw, &r.Scopes)
			out = append(out, r)
		}
	}
	return out, nil
}

func (s *Store) RevokeAPIKey(ctx context.Context, tenantID, keyID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2`, keyID, tenantID)
	return err
}

func (s *Store) RevealDeviceCredentials(ctx context.Context, tenantID, deviceID uuid.UUID, cipher *security.SecretCipher) (map[string]map[string]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT credential_scope, username, password_ciphertext
		FROM device_credentials
		WHERE tenant_id = $1 AND device_id = $2
	`, tenantID, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]map[string]string)
	for rows.Next() {
		var scope, username string
		var enc []byte
		if rows.Scan(&scope, &username, &enc) != nil {
			continue
		}
		pwd := ""
		if len(enc) > 0 && cipher != nil {
			if plain, err := cipher.Decrypt(enc); err == nil {
				pwd = plain
			}
		}
		out[scope] = map[string]string{"username": username, "password": pwd}
	}
	return out, nil
}

type UserAccountRow struct {
	ID          uuid.UUID  `json:"id"`
	Username    string     `json:"username"`
	FullName    string     `json:"fullName"`
	Status      string     `json:"status"`
	Role        string     `json:"role"`
	LastLoginAt *time.Time `json:"lastLoginAt"`
	CreatedAt   time.Time  `json:"createdAt"`
}

func (s *Store) CreateUser(ctx context.Context, tenantID uuid.UUID, username, fullName, password, roleName, status string) (*UserAccountRow, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	fullName = strings.TrimSpace(fullName)
	if fullName == "" {
		fullName = username
	}
	if status == "" {
		status = "active"
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var roleID uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2`, tenantID, roleName).Scan(&roleID); err != nil {
		return nil, fmt.Errorf("role %q not found", roleName)
	}

	var u UserAccountRow
	err = tx.QueryRow(ctx, `
		INSERT INTO users (tenant_id, username, full_name, password_hash, status)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, username, full_name, status, last_login_at, created_at
	`, tenantID, username, fullName, string(hash), status).Scan(&u.ID, &u.Username, &u.FullName, &u.Status, &u.LastLoginAt, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, u.ID, roleID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	u.Role = roleName
	return &u, nil
}

func (s *Store) UpdateUser(ctx context.Context, tenantID, userID uuid.UUID, fullName, roleName, status, newPassword, actorUsername string) (*UserAccountRow, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentUsername, currentRole string
	err = tx.QueryRow(ctx, `
		SELECT u.username, COALESCE(r.name, 'Viewer')
		FROM users u
		LEFT JOIN user_roles ur ON ur.user_id = u.id
		LEFT JOIN roles r ON r.id = ur.role_id
		WHERE u.id = $1 AND u.tenant_id = $2
	`, userID, tenantID).Scan(&currentUsername, &currentRole)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	if strings.EqualFold(currentUsername, actorUsername) && (status == "disabled" || (roleName != "" && roleName != currentRole && currentRole == "Super Admin")) {
		return nil, fmt.Errorf("cannot disable or demote your own active admin session")
	}

	if currentRole == "Super Admin" && (status == "disabled" || (roleName != "" && roleName != "Super Admin")) {
		var adminCount int
		_ = tx.QueryRow(ctx, `
			SELECT COUNT(*)
			FROM users u
			JOIN user_roles ur ON ur.user_id = u.id
			JOIN roles r ON r.id = ur.role_id
			WHERE u.tenant_id = $1 AND u.status = 'active' AND r.name = 'Super Admin'
		`, tenantID).Scan(&adminCount)
		if adminCount <= 1 {
			return nil, fmt.Errorf("at least one active Super Admin must remain")
		}
	}

	if strings.TrimSpace(fullName) != "" {
		_, err = tx.Exec(ctx, `UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`, strings.TrimSpace(fullName), userID, tenantID)
		if err != nil {
			return nil, err
		}
	}
	if status == "active" || status == "disabled" {
		_, err = tx.Exec(ctx, `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`, status, userID, tenantID)
		if err != nil {
			return nil, err
		}
	}
	if strings.TrimSpace(newPassword) != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx, `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`, string(hash), userID, tenantID)
		if err != nil {
			return nil, err
		}
	}
	if strings.TrimSpace(roleName) != "" {
		var roleID uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2`, tenantID, roleName).Scan(&roleID); err != nil {
			return nil, fmt.Errorf("role %q not found", roleName)
		}
		_, _ = tx.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, userID)
		if _, err := tx.Exec(ctx, `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, userID, roleID); err != nil {
			return nil, err
		}
	}

	var u UserAccountRow
	err = tx.QueryRow(ctx, `
		SELECT u.id, u.username, u.full_name, u.status, COALESCE(r.name, 'Viewer'), u.last_login_at, u.created_at
		FROM users u
		LEFT JOIN user_roles ur ON ur.user_id = u.id
		LEFT JOIN roles r ON r.id = ur.role_id
		WHERE u.id = $1 AND u.tenant_id = $2
	`, userID, tenantID).Scan(&u.ID, &u.Username, &u.FullName, &u.Status, &u.Role, &u.LastLoginAt, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) DeleteUser(ctx context.Context, tenantID, userID uuid.UUID, actorUsername string) error {
	var username, roleName string
	err := s.pool.QueryRow(ctx, `
		SELECT u.username, COALESCE(r.name, 'Viewer')
		FROM users u
		LEFT JOIN user_roles ur ON ur.user_id = u.id
		LEFT JOIN roles r ON r.id = ur.role_id
		WHERE u.id = $1 AND u.tenant_id = $2
	`, userID, tenantID).Scan(&username, &roleName)
	if err != nil {
		return fmt.Errorf("user not found")
	}
	if strings.EqualFold(username, actorUsername) {
		return fmt.Errorf("cannot delete your own account")
	}
	if roleName == "Super Admin" {
		var adminCount int
		_ = s.pool.QueryRow(ctx, `
			SELECT COUNT(*)
			FROM users u
			JOIN user_roles ur ON ur.user_id = u.id
			JOIN roles r ON r.id = ur.role_id
			WHERE u.tenant_id = $1 AND u.status = 'active' AND r.name = 'Super Admin'
		`, tenantID).Scan(&adminCount)
		if adminCount <= 1 {
			return fmt.Errorf("cannot delete the last active Super Admin")
		}
	}
	_, err = s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1 AND tenant_id = $2`, userID, tenantID)
	return err
}

func (s *Store) UpdateRolePermissions(ctx context.Context, tenantID, roleID uuid.UUID, permCodes []string) (string, []string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var roleName string
	if err := tx.QueryRow(ctx, `SELECT name FROM roles WHERE id = $1 AND tenant_id = $2`, roleID, tenantID).Scan(&roleName); err != nil {
		return "", nil, fmt.Errorf("role not found")
	}

	cleanSet := make(map[string]struct{}, len(permCodes))
	for _, code := range permCodes {
		c := strings.TrimSpace(code)
		if c != "" {
			cleanSet[c] = struct{}{}
		}
	}
	// Safeguard: Super Admin always keeps security.users.manage to prevent admin lockout.
	if roleName == "Super Admin" {
		cleanSet["security.users.manage"] = struct{}{}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return "", nil, err
	}

	codesSlice := make([]string, 0, len(cleanSet))
	for c := range cleanSet {
		codesSlice = append(codesSlice, c)
	}
	if len(codesSlice) > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO role_permissions (role_id, permission_id)
			SELECT $1, id FROM permissions WHERE code = ANY($2)
			ON CONFLICT DO NOTHING
		`, roleID, codesSlice); err != nil {
			return "", nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return "", nil, err
	}
	return roleName, codesSlice, nil
}

type DeviceReachability struct {
	SerialNumber         string
	Status               device.Status
	ConnectionRequestURL string
	AdminDisabled        bool
}

func (s *Store) CheckDeviceReachability(ctx context.Context, tenantID, deviceID uuid.UUID, onlineThreshold int) (*DeviceReachability, error) {
	var serial, crURL string
	var adminDisabled bool
	var lastInform *time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT serial_number, connection_request_url, admin_disabled, last_inform_at
		FROM devices
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
	`, deviceID, tenantID).Scan(&serial, &crURL, &adminDisabled, &lastInform)
	if err != nil {
		return nil, err
	}
	d := device.Device{
		AdminDisabled:          adminDisabled,
		LastInformAt:           lastInform,
		OnlineThresholdSeconds: onlineThreshold,
	}
	return &DeviceReachability{
		SerialNumber:         serial,
		Status:               d.ComputeStatus(time.Now().UTC(), onlineThreshold),
		ConnectionRequestURL: crURL,
		AdminDisabled:        adminDisabled,
	}, nil
}
