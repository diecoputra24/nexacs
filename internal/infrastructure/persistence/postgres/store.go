package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nexaacs/nexaacs/internal/domain/device"
	"github.com/nexaacs/nexaacs/internal/domain/fault"
	"github.com/nexaacs/nexaacs/internal/domain/task"
	"github.com/nexaacs/nexaacs/internal/platform/security"
	"github.com/nexaacs/nexaacs/internal/protocol/common/mapping"
	"github.com/nexaacs/nexaacs/internal/protocol/cwmp/soap"
)

var DefaultTenantID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

type Store struct {
	pool             *pgxpool.Pool
	cipher           *security.SecretCipher
	settingsMu       sync.RWMutex
	cachedSettings   *RuntimeSettings
	cachedSettingsAt time.Time
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) WithCipher(c *security.SecretCipher) *Store {
	s.cipher = c
	return s
}

func (s *Store) LoadAliases(ctx context.Context, tenantID uuid.UUID) ([]mapping.AliasRule, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, raw_name, canonical_name, oui, source, confidence, virtual_parameters
		FROM device_manufacturer_aliases
		WHERE tenant_id IS NULL OR tenant_id = $1
		ORDER BY CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END, created_at DESC
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []mapping.AliasRule
	for rows.Next() {
		var r mapping.AliasRule
		var id uuid.UUID
		var vpRaw []byte
		if err := rows.Scan(&id, &r.RawName, &r.CanonicalName, &r.OUI, &r.Source, &r.Confidence, &vpRaw); err != nil {
			return nil, err
		}
		r.ID = id.String()
		if len(vpRaw) > 0 {
			_ = json.Unmarshal(vpRaw, &r.VirtualParameters)
		}
		out = append(out, r)
	}
	return out, nil
}

func matchAliasRule(aliases []mapping.AliasRule, oui, rawName, canonicalName string) *mapping.AliasRule {
	cleanOUI := strings.ToUpper(strings.TrimSpace(oui))
	cleanRaw := strings.TrimSpace(rawName)
	cleanCanon := strings.TrimSpace(canonicalName)

	for i := range aliases {
		if mapping.MatchAliasToken(cleanOUI, aliases[i].OUI) {
			return &aliases[i]
		}
	}
	for i := range aliases {
		if mapping.MatchAliasToken(cleanRaw, aliases[i].RawName) {
			return &aliases[i]
		}
	}
	for i := range aliases {
		if mapping.MatchAliasToken(cleanCanon, aliases[i].CanonicalName) {
			return &aliases[i]
		}
	}
	return nil
}

func (s *Store) UpsertDeviceOnInform(ctx context.Context, sourceIP string, inf *soap.Inform) (*device.Device, error) {
	now := time.Now().UTC()
	serial := strings.TrimSpace(inf.DeviceId.SerialNumber)
	if serial == "" {
		return nil, errors.New("inform missing SerialNumber")
	}

	aliases, _ := s.LoadAliases(ctx, DefaultTenantID)
	var modelName string
	for _, p := range inf.ParameterList {
		if strings.HasSuffix(p.Name, ".ModelName") {
			if v := strings.TrimSpace(p.Value.Value); v != "" {
				modelName = v
				break
			}
		}
	}
	mfgRes := mapping.ResolveManufacturerWithModel(inf.DeviceId.Manufacturer, inf.DeviceId.OUI, modelName, inf.DeviceId.ProductClass, aliases)
	matchedAlias := matchAliasRule(aliases, inf.DeviceId.OUI, inf.DeviceId.Manufacturer, mfgRes.Canonical)
	var vp *mapping.VirtualParameterMapping
	if matchedAlias != nil {
		vp = &matchedAlias.VirtualParameters
	}

	var swVersion, hwVersion, connReqURL, wanIP, pppUser string
	var uptimePtr *int64
	var rxPtr, tempPtr *float64
	var informIntervalPtr *int

	paramPaths := make([]string, 0, len(inf.ParameterList))
	for _, p := range inf.ParameterList {
		paramPaths = append(paramPaths, p.Name)
	}
	if mfgRes.Source == "unmapped_raw" || mfgRes.Source == "missing" {
		if vfam := mapping.DetectVParamVendorFamily(paramPaths); vfam != "" {
			mfgRes = mapping.ManufacturerResolution{
				Canonical:  vfam,
				Source:     "vparam_detect",
				Confidence: "high",
			}
			matchedAlias = matchAliasRule(aliases, "", vfam, vfam)
			if matchedAlias != nil {
				vp = &matchedAlias.VirtualParameters
			}
		}
	}

	for _, p := range inf.ParameterList {
		ck := mapping.ResolveCanonicalKey(p.Name, vp)
		val := strings.TrimSpace(p.Value.Value)
		switch {
		case ck == "device.software_version" || strings.HasSuffix(p.Name, ".SoftwareVersion"):
			swVersion = val
		case ck == "device.hardware_version" || strings.HasSuffix(p.Name, ".HardwareVersion"):
			hwVersion = val
		case ck == "device.model_name" || strings.HasSuffix(p.Name, ".ModelName"):
			modelName = val
		case ck == "management.connection_request_url" || strings.HasSuffix(p.Name, ".ConnectionRequestURL"):
			connReqURL = val
		case ck == "management.periodic_inform_interval" || strings.HasSuffix(p.Name, ".PeriodicInformInterval"):
			if n, err := strconv.Atoi(val); err == nil && n > 0 {
				informIntervalPtr = &n
			}
		case ck == "device.uptime_seconds" || strings.HasSuffix(p.Name, ".UpTime"):
			if n, err := strconv.ParseInt(val, 10, 64); err == nil && n >= 0 {
				uptimePtr = &n
			}
		case ck == "optical.rx_power_dbm" || isOpticalRXPowerPath(p.Name):
			if f, ok := parseOpticalRXPowerDBM(val); ok {
				rxPtr = &f
			}
		case ck == "device.temperature_celsius" || isTransceiverTempPath(p.Name):
			if f, ok := parseTemperatureCelsius(val); ok {
				tempPtr = &f
			}
		case ck == "wan.external_ip" || strings.HasSuffix(p.Name, ".ExternalIPAddress"):
			if wanIP == "" && val != "" && val != "0.0.0.0" {
				wanIP = val
			}
		case ck == "wan.pppoe_username" || (strings.Contains(p.Name, "PPP") && strings.HasSuffix(p.Name, ".Username")):
			if pppUser == "" && val != "" && !strings.EqualFold(val, "admin") && !strings.EqualFold(val, "user") {
				pppUser = val
			}
		}
	}
	root := mapping.DetectDataModelRoot(paramPaths)

	const query = `
		INSERT INTO devices (
			tenant_id, serial_number, oui, manufacturer_raw, manufacturer_canonical,
			manufacturer_source, manufacturer_confidence, product_class, model_name,
			hardware_version, software_version, protocol, data_model_root,
			tr_source_ip, wan_ip, pppoe_username, connection_request_url,
			periodic_inform_interval, uptime_seconds, uptime_fetched_at,
			rx_power_dbm, rx_power_fetched_at, temperature_celsius, temperature_fetched_at,
			status, last_inform_at, last_seen_source, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9,
			$10, $11, 'TR-069', $12,
			NULLIF($13, '')::inet, NULLIF($14, '')::inet, $15, $16,
			$17, $18, $22,
			$19, $23,
			$20, $24,
			'online', $21, 'cwmp_inform', $21
		)
		ON CONFLICT (tenant_id, serial_number) WHERE deleted_at IS NULL
		DO UPDATE SET
			oui = EXCLUDED.oui,
			manufacturer_raw = EXCLUDED.manufacturer_raw,
			manufacturer_canonical = CASE
				WHEN EXCLUDED.manufacturer_source IN ('unmapped_raw', 'missing')
				 AND devices.manufacturer_source IN ('model_map', 'vparam_detect', 'manual')
				THEN devices.manufacturer_canonical
				ELSE EXCLUDED.manufacturer_canonical
			END,
			manufacturer_source = CASE
				WHEN EXCLUDED.manufacturer_source IN ('unmapped_raw', 'missing')
				 AND devices.manufacturer_source IN ('model_map', 'vparam_detect', 'manual')
				THEN devices.manufacturer_source
				ELSE EXCLUDED.manufacturer_source
			END,
			manufacturer_confidence = CASE
				WHEN EXCLUDED.manufacturer_source IN ('unmapped_raw', 'missing')
				 AND devices.manufacturer_source IN ('model_map', 'vparam_detect', 'manual')
				THEN devices.manufacturer_confidence
				ELSE EXCLUDED.manufacturer_confidence
			END,
			product_class = EXCLUDED.product_class,
			model_name = CASE WHEN EXCLUDED.model_name <> '' THEN EXCLUDED.model_name ELSE devices.model_name END,
			hardware_version = CASE WHEN EXCLUDED.hardware_version <> '' THEN EXCLUDED.hardware_version ELSE devices.hardware_version END,
			software_version = CASE WHEN EXCLUDED.software_version <> '' THEN EXCLUDED.software_version ELSE devices.software_version END,
			data_model_root = EXCLUDED.data_model_root,
			tr_source_ip = COALESCE(EXCLUDED.tr_source_ip, devices.tr_source_ip),
			wan_ip = COALESCE(EXCLUDED.wan_ip, devices.wan_ip),
			pppoe_username = CASE WHEN EXCLUDED.pppoe_username <> '' THEN EXCLUDED.pppoe_username ELSE devices.pppoe_username END,
			connection_request_url = CASE WHEN EXCLUDED.connection_request_url <> '' THEN EXCLUDED.connection_request_url ELSE devices.connection_request_url END,
			periodic_inform_interval = COALESCE(EXCLUDED.periodic_inform_interval, devices.periodic_inform_interval),
			uptime_seconds = COALESCE(EXCLUDED.uptime_seconds, devices.uptime_seconds),
			uptime_fetched_at = COALESCE(EXCLUDED.uptime_fetched_at, devices.uptime_fetched_at),
			rx_power_dbm = COALESCE(EXCLUDED.rx_power_dbm, devices.rx_power_dbm),
			rx_power_fetched_at = COALESCE(EXCLUDED.rx_power_fetched_at, devices.rx_power_fetched_at),
			temperature_celsius = COALESCE(EXCLUDED.temperature_celsius, devices.temperature_celsius),
			temperature_fetched_at = COALESCE(EXCLUDED.temperature_fetched_at, devices.temperature_fetched_at),
			status = 'online',
			last_inform_at = EXCLUDED.last_inform_at,
			last_seen_source = 'cwmp_inform',
			updated_at = EXCLUDED.updated_at
		RETURNING id, tenant_id, serial_number, oui, manufacturer_raw, manufacturer_canonical,
			product_class, model_name, hardware_version, software_version, protocol, data_model_root,
			COALESCE(host(tr_source_ip), ''), connection_request_url, last_inform_at, created_at, updated_at;
	`

	var uptimeFetchedAt, rxFetchedAt, tempFetchedAt *time.Time
	if uptimePtr != nil {
		uptimeFetchedAt = &now
	}
	if rxPtr != nil {
		rxFetchedAt = &now
	}
	if tempPtr != nil {
		tempFetchedAt = &now
	}

	var d device.Device
	var proto string
	err := s.pool.QueryRow(ctx, query,
		DefaultTenantID, serial, inf.DeviceId.OUI, inf.DeviceId.Manufacturer,
		mfgRes.Canonical, mfgRes.Source, mfgRes.Confidence,
		inf.DeviceId.ProductClass, modelName, hwVersion, swVersion,
		root, sourceIP, wanIP, pppUser, connReqURL,
		informIntervalPtr, uptimePtr, rxPtr, tempPtr, now,
		uptimeFetchedAt, rxFetchedAt, tempFetchedAt,
	).Scan(
		&d.ID, &d.TenantID, &d.SerialNumber, &d.OUI, &d.ManufacturerRaw, &d.ManufacturerCanonical,
		&d.ProductClass, &d.ModelName, &d.HardwareVersion, &d.SoftwareVersion, &proto, &d.DataModelRoot,
		&d.TRSourceIP, &d.ConnectionRequestURL, &d.LastInformAt, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	d.Protocol = device.Protocol(proto)

	for _, ev := range inf.Event {
		payload, _ := json.Marshal(ev)
		_, _ = s.pool.Exec(ctx,
			`INSERT INTO device_events (tenant_id, device_id, protocol, event_code, payload) VALUES ($1, $2, 'TR-069', $3, $4)`,
			d.TenantID, d.ID, ev.EventCode, payload,
		)
	}
	return &d, nil
}

func parseOpticalRXPowerDBM(raw string) (float64, bool) {
	v, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, false
	}
	// CT-COM / ZTE EPON & CMCC GPON often report positive 0.1 uW units (e.g. 57 -> -22.44 dBm, 605 -> -12.18 dBm).
	if v > 10 && v <= 100000 {
		dbm := 10 * math.Log10(v*0.0001)
		if !math.IsNaN(dbm) && !math.IsInf(dbm, 0) && dbm >= -60 && dbm <= 15 {
			return math.Round(dbm*100) / 100, true
		}
		return 0, false
	}
	if v >= -60 && v <= 15 {
		return v, true
	}
	return 0, false
}

func parseTemperatureCelsius(raw string) (float64, bool) {
	v, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, false
	}
	// ZTE ONTs without a readable transceiver temp sensor report sentinel 256 / 256.000000;
	// XST99 / XSF609 ONTs without a readable sensor report 0.
	if v == 0 || v == 256 {
		return 0, false
	}
	// SFP DDM 1/256 °C integer encoding (e.g. 12151 -> 47.5 °C, 12705 -> 49.6 °C).
	// Require > 512 (> 2.0 °C) so ZTE sentinel 256 is never converted into a bogus 1.0 °C.
	if v > 512 && v < 40000 {
		v = v / 256.0
	}
	if v >= -40 && v <= 130 {
		return math.Round(v*10) / 10, true
	}
	return 0, false
}

func isOpticalRXPowerPath(path string) bool {
	return strings.HasSuffix(path, ".RXPower") && !strings.HasSuffix(path, ".CATVRXPower")
}

func isTransceiverTempPath(path string) bool {
	if strings.HasSuffix(path, ".TransceiverTemperature") || strings.HasSuffix(path, ".OpticalTransceiver.Temperature") {
		return true
	}
	return strings.HasSuffix(path, ".Temperature") &&
		(strings.Contains(path, "Optical") ||
			strings.Contains(path, "PONInterfaceConfig") ||
			strings.Contains(path, "GponInterafceConfig") ||
			strings.Contains(path, "EponInterfaceConfig") ||
			strings.Contains(path, "EponInterafceConfig"))
}

func (s *Store) SaveInformParameters(ctx context.Context, deviceID uuid.UUID, sessionID uuid.UUID, params []soap.ParameterValueStruct) error {
	now := time.Now().UTC()

	var oui, mfgRaw, mfgCanon, mfgSource string
	_ = s.pool.QueryRow(ctx, `SELECT oui, manufacturer_raw, manufacturer_canonical, manufacturer_source FROM devices WHERE id = $1`, deviceID).
		Scan(&oui, &mfgRaw, &mfgCanon, &mfgSource)

	paramNames := make([]string, 0, len(params))
	for _, p := range params {
		paramNames = append(paramNames, p.Name)
	}

	aliases, _ := s.LoadAliases(ctx, DefaultTenantID)
	var detectedMfgCanon string
	isAutoClassifiable := mfgCanon == "" ||
		strings.EqualFold(mfgCanon, "Lainnya") ||
		strings.EqualFold(mfgCanon, "N/A") ||
		strings.EqualFold(mfgCanon, "GM") ||
		strings.EqualFold(mfgCanon, "Xtetch") ||
		strings.EqualFold(mfgCanon, "China Mobile") ||
		strings.EqualFold(mfgCanon, "China Telecom") ||
		mfgSource == "unmapped_raw" ||
		mfgSource == "missing" ||
		mfgSource == "model_map" ||
		mfgSource == "vparam_detect"
	if isAutoClassifiable {
		if vfam := mapping.DetectVParamVendorFamily(paramNames); vfam != "" && !strings.EqualFold(mfgCanon, vfam) {
			mfgCanon = vfam
			detectedMfgCanon = vfam
		}
	}

	var matchedAlias *mapping.AliasRule
	if detectedMfgCanon != "" {
		matchedAlias = matchAliasRule(aliases, "", detectedMfgCanon, detectedMfgCanon)
	} else {
		matchedAlias = matchAliasRule(aliases, oui, mfgRaw, mfgCanon)
	}
	var vp *mapping.VirtualParameterMapping
	if matchedAlias != nil {
		vp = &matchedAlias.VirtualParameters
	}

	var uptimePtr *int64
	var rxPtr, tempPtr *float64
	var wanIP, pppUser, connReqURL, swVersion, hwVersion, modelName string
	var informIntervalPtr *int

	var batch pgx.Batch
	for _, p := range params {
		ck := mapping.ResolveCanonicalKey(p.Name, vp)
		if ck == "" {
			switch {
			case isOpticalRXPowerPath(p.Name):
				ck = "optical.rx_power_dbm"
			case isTransceiverTempPath(p.Name):
				ck = "device.temperature_celsius"
			}
		}
		lowerPath := strings.ToLower(p.Name)
		isSecret := strings.Contains(lowerPath, "password") ||
			strings.Contains(lowerPath, "passphrase") ||
			strings.Contains(lowerPath, "presharedkey") ||
			ck == "wifi.security_key" ||
			ck == "wan.pppoe_password" ||
			ck == "credentials.admin_password" ||
			ck == "credentials.user_password"

		var ckParam *string
		if ck != "" {
			ckCopy := ck
			ckParam = &ckCopy
		}

		batch.Queue(`
			INSERT INTO device_parameters (
				tenant_id, device_id, parameter_path, canonical_key, value, value_type, read_state,
				is_secret, source_protocol, source_session_id, last_attempt_at, last_success_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, 'available', $7, 'TR-069', $8, $9, $9, $9
			)
			ON CONFLICT (device_id, parameter_path) DO UPDATE SET
				canonical_key = COALESCE(EXCLUDED.canonical_key, device_parameters.canonical_key),
				value = EXCLUDED.value,
				value_type = CASE WHEN EXCLUDED.value_type <> '' THEN EXCLUDED.value_type ELSE device_parameters.value_type END,
				read_state = 'available',
				is_secret = EXCLUDED.is_secret,
				source_session_id = EXCLUDED.source_session_id,
				last_attempt_at = EXCLUDED.last_attempt_at,
				last_success_at = EXCLUDED.last_success_at,
				updated_at = EXCLUDED.updated_at
		`, DefaultTenantID, deviceID, p.Name, ckParam, p.Value.Value, p.Value.Type, isSecret, sessionID, now)

		val := strings.TrimSpace(p.Value.Value)
		switch {
		case ck == "device.software_version" || strings.HasSuffix(p.Name, ".SoftwareVersion"):
			if val != "" {
				swVersion = val
			}
		case ck == "device.hardware_version" || strings.HasSuffix(p.Name, ".HardwareVersion"):
			if val != "" {
				hwVersion = val
			}
		case ck == "device.model_name" || strings.HasSuffix(p.Name, ".ModelName"):
			if val != "" {
				modelName = val
			}
		case ck == "device.uptime_seconds" || strings.HasSuffix(p.Name, ".UpTime"):
			if n, err := strconv.ParseInt(val, 10, 64); err == nil && n >= 0 {
				uptimePtr = &n
			}
		case ck == "optical.rx_power_dbm" || isOpticalRXPowerPath(p.Name):
			if f, ok := parseOpticalRXPowerDBM(val); ok {
				rxPtr = &f
			}
		case ck == "device.temperature_celsius" || isTransceiverTempPath(p.Name):
			if f, ok := parseTemperatureCelsius(val); ok {
				tempPtr = &f
			}
		case ck == "wan.external_ip" || strings.HasSuffix(p.Name, ".ExternalIPAddress"):
			if wanIP == "" && val != "" && val != "0.0.0.0" && net.ParseIP(val) != nil {
				wanIP = val
			}
		case ck == "wan.pppoe_username" || (strings.Contains(p.Name, "PPP") && strings.HasSuffix(p.Name, ".Username")):
			if pppUser == "" && val != "" && !strings.EqualFold(val, "admin") && !strings.EqualFold(val, "user") {
				pppUser = val
			}
		case ck == "management.connection_request_url" || strings.HasSuffix(p.Name, ".ConnectionRequestURL"):
			if val != "" {
				connReqURL = val
			}
		case ck == "management.periodic_inform_interval" || strings.HasSuffix(p.Name, ".PeriodicInformInterval"):
			if n, err := strconv.Atoi(val); err == nil && n > 0 {
				informIntervalPtr = &n
			}
		}
	}

	if batch.Len() > 0 {
		br := s.pool.SendBatch(ctx, &batch)
		for i := 0; i < batch.Len(); i++ {
			if _, err := br.Exec(); err != nil {
				_ = br.Close()
				return err
			}
		}
		if err := br.Close(); err != nil {
			return err
		}
	}

	var uptimeFetchedAt, rxFetchedAt, tempFetchedAt *time.Time
	if uptimePtr != nil {
		uptimeFetchedAt = &now
	}
	if rxPtr != nil {
		rxFetchedAt = &now
	}
	if tempPtr != nil {
		tempFetchedAt = &now
	}

	_, _ = s.pool.Exec(ctx, `
		UPDATE devices SET
			uptime_seconds = COALESCE($2, uptime_seconds),
			uptime_fetched_at = COALESCE($13, uptime_fetched_at),
			rx_power_dbm = COALESCE($3, rx_power_dbm),
			rx_power_fetched_at = COALESCE($14, rx_power_fetched_at),
			temperature_celsius = COALESCE($4, temperature_celsius),
			temperature_fetched_at = COALESCE($15, temperature_fetched_at),
			wan_ip = COALESCE(NULLIF($5, '')::inet, wan_ip),
			pppoe_username = CASE WHEN $6 <> '' THEN $6 ELSE pppoe_username END,
			connection_request_url = CASE WHEN $7 <> '' THEN $7 ELSE connection_request_url END,
			periodic_inform_interval = COALESCE($9, periodic_inform_interval),
			software_version = CASE WHEN $10 <> '' THEN $10 ELSE software_version END,
			hardware_version = CASE WHEN $11 <> '' THEN $11 ELSE hardware_version END,
			model_name = CASE WHEN $12 <> '' THEN $12 ELSE model_name END,
			manufacturer_canonical = CASE WHEN $16 <> '' THEN $16 ELSE manufacturer_canonical END,
			manufacturer_source = CASE WHEN $16 <> '' THEN 'vparam_detect' ELSE manufacturer_source END,
			manufacturer_confidence = CASE WHEN $16 <> '' THEN 'high' ELSE manufacturer_confidence END,
			last_param_sync_at = $8,
			updated_at = $8
		WHERE id = $1
	`, deviceID, uptimePtr, rxPtr, tempPtr, wanIP, pppUser, connReqURL, now, informIntervalPtr, swVersion, hwVersion, modelName, uptimeFetchedAt, rxFetchedAt, tempFetchedAt, detectedMfgCanon)

	// Record lightweight time-series telemetry samples for Device Detail trend charts.
	if rxPtr != nil {
		_, _ = s.pool.Exec(ctx, `
			INSERT INTO parameter_history (tenant_id, device_id, parameter_path, old_value, new_value, source, created_at)
			VALUES ($1, $2, 'optical.rx_power_dbm', NULL, $3, 'cwmp', $4)
		`, DefaultTenantID, deviceID, fmt.Sprintf("%.2f", *rxPtr), now)
	}
	if tempPtr != nil {
		_, _ = s.pool.Exec(ctx, `
			INSERT INTO parameter_history (tenant_id, device_id, parameter_path, old_value, new_value, source, created_at)
			VALUES ($1, $2, 'device.temperature_celsius', NULL, $3, 'cwmp', $4)
		`, DefaultTenantID, deviceID, fmt.Sprintf("%.1f", *tempPtr), now)
	}

	return nil
}

// QueueAutoSummonOnFirstDetect queues a one-time initial VParams Summon strictly on initial ONT registration
// (0 BOOTSTRAP or first enrollment with no prior summon history), using only mapped Aliases VParams paths.
func (s *Store) QueueAutoSummonOnFirstDetect(ctx context.Context, dev *device.Device, events []soap.EventStruct) (bool, error) {
	if dev == nil {
		return false, nil
	}

	var lastSummon *time.Time
	if err := s.pool.QueryRow(ctx, `SELECT last_summon_at FROM devices WHERE id = $1`, dev.ID).Scan(&lastSummon); err != nil {
		return false, err
	}
	isBootstrap := false
	for _, ev := range events {
		if strings.HasPrefix(strings.TrimSpace(ev.EventCode), "0 BOOTSTRAP") {
			isBootstrap = true
			break
		}
	}
	if lastSummon != nil && !isBootstrap {
		return false, nil
	}

	// Never re-trigger automatically on periodic/boot informs once any summon task was already created before
	// (unless explicitly triggered by 0 BOOTSTRAP re-registration).
	var priorSummonCount int
	if err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM tasks
		WHERE device_id = $1
		  AND task_type IN ('summon', 'refresh_params')
		  AND (
		    status IN ('queued', 'waiting_for_device', 'executing')
		    OR $2 = FALSE
		    OR created_at > NOW() - INTERVAL '30 seconds'
		  )
	`, dev.ID, isBootstrap).Scan(&priorSummonCount); err != nil {
		return false, err
	}
	if priorSummonCount > 0 {
		return false, nil
	}

	groups := []string{"vparams"}
	aliases, _ := s.LoadAliases(ctx, dev.TenantID)
	matchedAlias := matchAliasRule(aliases, dev.OUI, dev.ManufacturerRaw, dev.ManufacturerCanonical)
	var vp *mapping.VirtualParameterMapping
	if matchedAlias != nil {
		vp = &matchedAlias.VirtualParameters
	}
	paths := mapping.ResolveSummonPaths(dev.DataModelRoot, vp, groups)
	if len(paths) == 0 {
		return false, nil
	}
	payloadRaw, _ := json.Marshal(map[string]interface{}{
		"source": "auto_first_detect",
		"groups": groups,
		"paths":  paths,
	})
	proto := string(dev.Protocol)
	if proto == "" {
		proto = "TR-069"
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO tasks (tenant_id, device_id, protocol, task_type, status, payload, scheduled_at)
		VALUES ($1, $2, $3, 'summon', 'queued', $4, NOW())
	`, dev.TenantID, dev.ID, proto, payloadRaw)
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *Store) DequeueNextTask(ctx context.Context, deviceID uuid.UUID) (*task.Task, error) {
	const q = `
		UPDATE tasks
		SET status = 'executing', started_at = NOW()
		WHERE id = (
			SELECT id FROM tasks
			WHERE device_id = $1 AND status IN ('queued', 'waiting_for_device') AND scheduled_at <= NOW()
			  AND COALESCE(payload->>'blocked_by', '') = ''
			ORDER BY scheduled_at ASC, created_at ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		RETURNING id, tenant_id, device_id, task_type, protocol, status, payload, retry_count, max_retries;
	`
	var t task.Task
	var payloadRaw []byte
	var tType, status string
	err := s.pool.QueryRow(ctx, q, deviceID).Scan(
		&t.ID, &t.TenantID, &t.DeviceID, &tType, &t.Protocol, &status, &payloadRaw, &t.RetryCount, &t.MaxRetries,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.TaskType = task.Type(tType)
	t.Status = task.State(status)
	_ = json.Unmarshal(payloadRaw, &t.Payload)
	return &t, nil
}

func (s *Store) CompleteTask(ctx context.Context, taskID uuid.UUID, result map[string]interface{}) error {
	raw, _ := json.Marshal(result)
	var deviceID uuid.UUID
	var taskType string
	var payloadRaw []byte
	err := s.pool.QueryRow(ctx,
		`UPDATE tasks SET status = 'completed', result = $2, completed_at = NOW() WHERE id = $1 RETURNING device_id, task_type, COALESCE(payload, '{}'::jsonb)`,
		taskID, raw,
	).Scan(&deviceID, &taskType, &payloadRaw)
	if err != nil {
		return err
	}
	if taskType == string(task.TypeAddObject) {
		var pMap map[string]interface{}
		_ = json.Unmarshal(payloadRaw, &pMap)
		replaceToken, _ := pMap["replace_token"].(string)
		var instStr string
		switch v := result["instance_number"].(type) {
		case uint:
			if v > 0 {
				instStr = strconv.FormatUint(uint64(v), 10)
			}
		case uint64:
			if v > 0 {
				instStr = strconv.FormatUint(v, 10)
			}
		case int:
			if v > 0 {
				instStr = strconv.Itoa(v)
			}
		case int64:
			if v > 0 {
				instStr = strconv.FormatInt(v, 10)
			}
		case float64:
			if v > 0 {
				instStr = strconv.FormatInt(int64(v), 10)
			}
		}
		if replaceToken != "" && instStr != "" {
			_, _ = s.pool.Exec(ctx, `
				WITH RECURSIVE downstream AS (
					SELECT id FROM tasks
					WHERE device_id = $1
					  AND status = 'queued'
					  AND payload->>'blocked_by' = $4
					UNION ALL
					SELECT t.id FROM tasks t
					JOIN downstream d ON t.payload->>'blocked_by' = d.id::text
					WHERE t.device_id = $1
					  AND t.status = 'queued'
				)
				UPDATE tasks
				SET payload = CASE
						WHEN payload->>'blocked_by' = $4 THEN (REPLACE(payload::text, $2, $3)::jsonb) - 'blocked_by'
						ELSE REPLACE(payload::text, $2, $3)::jsonb
					END,
				    scheduled_at = CASE
						WHEN payload->>'blocked_by' = $4 THEN NOW()
						ELSE scheduled_at
					END
				WHERE id IN (SELECT id FROM downstream)
			`, deviceID, replaceToken, instStr, taskID.String())
		}
	}
	// Unblock any remaining chained task waiting on this task ID.
	_, _ = s.pool.Exec(ctx, `
		UPDATE tasks
		SET payload = payload - 'blocked_by',
		    scheduled_at = NOW()
		WHERE device_id = $1
		  AND status = 'queued'
		  AND payload->>'blocked_by' = $2
	`, deviceID, taskID.String())
	if taskType == string(task.TypeSummon) || taskType == string(task.TypeRefreshParams) {
		_, _ = s.pool.Exec(ctx, `UPDATE devices SET last_summon_at = NOW(), updated_at = NOW() WHERE id = $1`, deviceID)
	}
	if taskType == "set_parameter_values" {
		// Ensure queued IPPingDiagnostics follow-up read waits >=7s after SetParameterValues finishes on CPE.
		_, _ = s.pool.Exec(ctx, `
			UPDATE tasks
			SET scheduled_at = GREATEST(scheduled_at, NOW() + INTERVAL '7 seconds')
			WHERE device_id = $1 AND task_type = 'get_parameter_values' AND status = 'queued' AND payload->>'reason' = 'diagnostics_ping'
		`, deviceID)
	}
	if taskType == string(task.TypeDownloadFirmware) {
		_, _ = s.pool.Exec(ctx, `
			UPDATE firmware_jobs
			SET status = 'downloading', progress_percent = GREATEST(progress_percent, 50), started_at = COALESCE(started_at, NOW())
			WHERE task_id = $1 AND status IN ('queued', 'downloading')
		`, taskID)
	}
	_, _ = s.pool.Exec(ctx, `
		UPDATE provisioning_profiles
		SET status = 'applied', last_error = '', last_applied_at = NOW(), updated_at = NOW()
		WHERE last_task_id = $1
	`, taskID)
	return nil
}

// CompleteTransfer processes a CPE TransferComplete RPC (post-Download) and updates tasks + firmware_jobs.
func (s *Store) CompleteTransfer(ctx context.Context, commandKey, faultCode, faultString string) error {
	taskID, err := uuid.Parse(strings.TrimSpace(commandKey))
	if err != nil {
		return nil
	}
	failed := (faultCode != "" && faultCode != "0") || faultString != ""
	if failed {
		errMsg := strings.TrimSpace(faultCode + " " + faultString)
		if errMsg == "" {
			errMsg = "firmware transfer failed"
		}
		resRaw, _ := json.Marshal(map[string]interface{}{"error": errMsg, "fault_code": faultCode})
		_, _ = s.pool.Exec(ctx, `
			UPDATE tasks SET status = 'failed', result = $2, completed_at = NOW()
			WHERE id = $1
		`, taskID, resRaw)
		_, _ = s.pool.Exec(ctx, `
			UPDATE firmware_jobs
			SET status = 'failed', error_message = $2, completed_at = NOW()
			WHERE task_id = $1
		`, taskID, errMsg)
		return nil
	}

	resRaw, _ := json.Marshal(map[string]interface{}{"transfer_complete": true})
	_, _ = s.pool.Exec(ctx, `
		UPDATE tasks SET status = 'completed', result = $2, completed_at = NOW()
		WHERE id = $1
	`, taskID, resRaw)
	_, _ = s.pool.Exec(ctx, `
		UPDATE firmware_jobs
		SET status = 'completed', progress_percent = 100, error_message = '', completed_at = NOW()
		WHERE task_id = $1
	`, taskID)
	return nil
}

func (s *Store) FailTaskAndCreateFault(ctx context.Context, taskID uuid.UUID, deviceID uuid.UUID, cat fault.Category, code, msg, logs string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, `UPDATE tasks SET status = 'failed', completed_at = NOW() WHERE id = $1`, taskID)
	if err != nil {
		return err
	}
	// Cascade failure to any chained child tasks blocked by this parent task so UI never stalls.
	_, _ = tx.Exec(ctx, `
		UPDATE tasks
		SET status = 'failed',
		    completed_at = NOW(),
		    payload = payload - 'blocked_by'
		WHERE device_id = $1
		  AND status = 'queued'
		  AND payload->>'blocked_by' = $2
	`, deviceID, taskID.String())

	_, _ = tx.Exec(ctx, `
		UPDATE provisioning_profiles
		SET status = 'failed', last_error = $2, updated_at = NOW()
		WHERE last_task_id = $1
	`, taskID, msg)

	_, _ = tx.Exec(ctx, `
		UPDATE firmware_jobs
		SET status = 'failed', error_message = $2, completed_at = NOW()
		WHERE task_id = $1 AND status NOT IN ('completed', 'failed')
	`, taskID, msg)

	_, err = tx.Exec(ctx, `
		INSERT INTO faults (
			tenant_id, device_id, task_id, protocol, category, operation,
			error_code, message, sanitized_logs, status, last_attempt_at
		) VALUES (
			$1, $2, $3, 'TR-069', $4, 'cwmp_rpc', $5, $6, $7, 'open', NOW()
		)
	`, DefaultTenantID, deviceID, taskID, string(cat), code, msg, logs)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type DeviceListQuery struct {
	Limit                int
	Offset               int
	Search               string
	Manufacturer         string
	Model                string
	ProductClass         string
	Technology           string
	Protocol             string
	DeviceGroup          string
	Status               string
	StatusBucket         string
	UptimeBucket         string
	TempBucket           string
	RXBucket             string
	SortBy               string
	SortDir              string
	OnlineThresholdSec   int
	NeverConnectedPolicy string
	Thresholds           device.ThresholdPolicy
}

func (s *Store) ListDevices(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]device.Device, int, error) {
	return s.ListDevicesFiltered(ctx, tenantID, DeviceListQuery{
		Limit:              limit,
		Offset:             offset,
		OnlineThresholdSec: 1800,
		Thresholds:         device.DefaultThresholdPolicy(),
	})
}

func (s *Store) ListDevicesFiltered(ctx context.Context, tenantID uuid.UUID, q DeviceListQuery) ([]device.Device, int, error) {
	if q.Limit <= 0 || q.Limit > 10000 {
		q.Limit = 25
	}
	if q.Offset < 0 {
		q.Offset = 0
	}
	threshSec := q.OnlineThresholdSec
	if threshSec <= 0 {
		threshSec = 1800
	}

	whereParts := []string{`tenant_id = $1`, `deleted_at IS NULL`}
	args := []interface{}{tenantID}
	addArg := func(v interface{}) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	if s := strings.TrimSpace(q.Search); s != "" {
		ph := addArg("%" + s + "%")
		whereParts = append(whereParts, fmt.Sprintf(`(
			serial_number ILIKE %[1]s OR
			manufacturer_canonical ILIKE %[1]s OR
			manufacturer_raw ILIKE %[1]s OR
			model_name ILIKE %[1]s OR
			product_class ILIKE %[1]s OR
			oui ILIKE %[1]s OR
			COALESCE(host(tr_source_ip), '') ILIKE %[1]s OR
			COALESCE(host(wan_ip), '') ILIKE %[1]s OR
			pppoe_username ILIKE %[1]s OR
			EXISTS (
				SELECT 1 FROM device_parameters dp
				WHERE dp.device_id = devices.id
				  AND (dp.canonical_key = 'wan.pppoe_username' OR (dp.parameter_path LIKE '%%PPP%%.Username'))
				  AND dp.value ILIKE %[1]s
			)
		)`, ph))
	}
	if v := strings.TrimSpace(q.Manufacturer); v != "" {
		whereParts = append(whereParts, `manufacturer_canonical = `+addArg(v))
	}
	if v := strings.TrimSpace(q.Model); v != "" {
		whereParts = append(whereParts, `model_name = `+addArg(v))
	}
	if v := strings.TrimSpace(q.ProductClass); v != "" {
		whereParts = append(whereParts, `product_class = `+addArg(v))
	}
	if v := strings.TrimSpace(q.Technology); v != "" {
		whereParts = append(whereParts, `technology_normalized = `+addArg(v))
	}
	if v := strings.TrimSpace(q.Protocol); v != "" {
		whereParts = append(whereParts, `protocol = `+addArg(v))
	}
	if v := strings.TrimSpace(q.DeviceGroup); v != "" {
		whereParts = append(whereParts, `device_group = `+addArg(v))
	}

	var threshPh string
	getThreshPh := func() string {
		if threshPh == "" {
			threshPh = addArg(threshSec)
		}
		return threshPh
	}
	switch strings.TrimSpace(q.Status) {
	case "online":
		whereParts = append(whereParts, fmt.Sprintf(`admin_disabled = FALSE AND last_inform_at IS NOT NULL AND last_inform_at >= NOW() - (%s * INTERVAL '1 second')`, getThreshPh()))
	case "offline":
		whereParts = append(whereParts, fmt.Sprintf(`admin_disabled = FALSE AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - (%s * INTERVAL '1 second')`, getThreshPh()))
	case "never_connected":
		if q.NeverConnectedPolicy == "treat_unknown" {
			whereParts = append(whereParts, `FALSE`)
		} else {
			whereParts = append(whereParts, `admin_disabled = FALSE AND last_inform_at IS NULL`)
		}
	case "unknown":
		if q.NeverConnectedPolicy == "treat_unknown" {
			whereParts = append(whereParts, `admin_disabled = FALSE AND last_inform_at IS NULL`)
		} else {
			whereParts = append(whereParts, `FALSE`)
		}
	case "disabled":
		whereParts = append(whereParts, `admin_disabled = TRUE`)
	}

	switch strings.TrimSpace(q.StatusBucket) {
	case "Online":
		whereParts = append(whereParts, fmt.Sprintf(`admin_disabled = FALSE AND last_inform_at IS NOT NULL AND last_inform_at >= NOW() - (%s * INTERVAL '1 second')`, getThreshPh()))
	case "Offline < 2h", "Offline > 30m":
		whereParts = append(whereParts, fmt.Sprintf(`admin_disabled = FALSE AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - (%s * INTERVAL '1 second') AND last_inform_at >= NOW() - INTERVAL '2 hours'`, getThreshPh()))
	case "Offline 2–24h", "Offline > 2h":
		whereParts = append(whereParts, `admin_disabled = FALSE AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - INTERVAL '2 hours' AND last_inform_at >= NOW() - INTERVAL '24 hours'`)
	case "Offline > 1d":
		whereParts = append(whereParts, `admin_disabled = FALSE AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - INTERVAL '24 hours' AND last_inform_at >= NOW() - INTERVAL '7 days'`)
	case "Offline > 1w":
		whereParts = append(whereParts, `admin_disabled = FALSE AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - INTERVAL '7 days' AND last_inform_at >= NOW() - INTERVAL '30 days'`)
	case "Offline > 1mo":
		whereParts = append(whereParts, `admin_disabled = FALSE AND last_inform_at IS NOT NULL AND last_inform_at < NOW() - INTERVAL '30 days'`)
	case "Never Connected":
		whereParts = append(whereParts, `admin_disabled = FALSE AND last_inform_at IS NULL`)
	}

	switch strings.TrimSpace(q.UptimeBucket) {
	case "< 1h":
		whereParts = append(whereParts, `uptime_seconds IS NOT NULL AND uptime_seconds >= 0 AND uptime_seconds < 3600`)
	case "1–12h":
		whereParts = append(whereParts, `uptime_seconds IS NOT NULL AND uptime_seconds >= 3600 AND uptime_seconds < 43200`)
	case "12–24h":
		whereParts = append(whereParts, `uptime_seconds IS NOT NULL AND uptime_seconds >= 43200 AND uptime_seconds < 86400`)
	case "1–7d":
		whereParts = append(whereParts, `uptime_seconds IS NOT NULL AND uptime_seconds >= 86400 AND uptime_seconds < 604800`)
	case "7–30d":
		whereParts = append(whereParts, `uptime_seconds IS NOT NULL AND uptime_seconds >= 604800 AND uptime_seconds < 2592000`)
	case "> 1 month":
		whereParts = append(whereParts, `uptime_seconds IS NOT NULL AND uptime_seconds >= 2592000`)
	case "N/A":
		whereParts = append(whereParts, `(uptime_seconds IS NULL OR uptime_seconds < 0)`)
	}

	switch strings.TrimSpace(q.TempBucket) {
	case "Normal":
		whereParts = append(whereParts, `temperature_celsius IS NOT NULL AND temperature_celsius < `+addArg(q.Thresholds.TempWarningC))
	case "Warning":
		wPh := addArg(q.Thresholds.TempWarningC)
		cPh := addArg(q.Thresholds.TempCriticalC)
		whereParts = append(whereParts, fmt.Sprintf(`temperature_celsius IS NOT NULL AND temperature_celsius >= %s AND temperature_celsius <= %s`, wPh, cPh))
	case "Critical":
		whereParts = append(whereParts, `temperature_celsius IS NOT NULL AND temperature_celsius > `+addArg(q.Thresholds.TempCriticalC))
	case "N/A":
		whereParts = append(whereParts, `temperature_celsius IS NULL`)
	}

	switch strings.TrimSpace(q.RXBucket) {
	case "Sangat Kuat":
		whereParts = append(whereParts, `rx_power_dbm IS NOT NULL AND rx_power_dbm >= `+addArg(q.Thresholds.RXStrongMinDBM))
	case "Baik":
		sPh := addArg(q.Thresholds.RXStrongMinDBM)
		gPh := addArg(q.Thresholds.RXGoodMinDBM)
		whereParts = append(whereParts, fmt.Sprintf(`rx_power_dbm IS NOT NULL AND rx_power_dbm < %s AND rx_power_dbm >= %s`, sPh, gPh))
	case "Perlu Perhatian":
		gPh := addArg(q.Thresholds.RXGoodMinDBM)
		aPh := addArg(q.Thresholds.RXAttentionMinDBM)
		whereParts = append(whereParts, fmt.Sprintf(`rx_power_dbm IS NOT NULL AND rx_power_dbm < %s AND rx_power_dbm >= %s`, gPh, aPh))
	case "Lemah":
		aPh := addArg(q.Thresholds.RXAttentionMinDBM)
		wPh := addArg(q.Thresholds.RXWeakMinDBM)
		whereParts = append(whereParts, fmt.Sprintf(`rx_power_dbm IS NOT NULL AND rx_power_dbm < %s AND rx_power_dbm >= %s`, aPh, wPh))
	case "Sangat Lemah":
		whereParts = append(whereParts, `rx_power_dbm IS NOT NULL AND rx_power_dbm < `+addArg(q.Thresholds.RXWeakMinDBM))
	case "N/A":
		whereParts = append(whereParts, `rx_power_dbm IS NULL`)
	}

	whereSQL := strings.Join(whereParts, " AND ")
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM devices WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	dir := "ASC"
	if strings.EqualFold(strings.TrimSpace(q.SortDir), "desc") {
		dir = "DESC"
	}
	orderSQL := `last_inform_at DESC NULLS LAST, created_at DESC`
	switch strings.TrimSpace(q.SortBy) {
	case "serialNumber":
		orderSQL = `serial_number ` + dir + `, created_at DESC`
	case "manufacturerCanonical":
		orderSQL = `manufacturer_canonical ` + dir + `, serial_number ASC`
	case "modelName":
		orderSQL = `model_name ` + dir + `, serial_number ASC`
	case "trSourceIp":
		orderSQL = `tr_source_ip ` + dir + ` NULLS LAST, serial_number ASC`
	case "status":
		orderSQL = fmt.Sprintf(`(CASE WHEN admin_disabled THEN 3 WHEN last_inform_at IS NULL THEN 2 WHEN last_inform_at >= NOW() - (%s * INTERVAL '1 second') THEN 0 ELSE 1 END) %s, last_inform_at DESC NULLS LAST`, getThreshPh(), dir)
	case "lastInform":
		orderSQL = `last_inform_at ` + dir + ` NULLS LAST`
	}

	limitPh := addArg(q.Limit)
	offsetPh := addArg(q.Offset)

	rows, err := s.pool.Query(ctx, `
		SELECT id, tenant_id, serial_number, oui, manufacturer_raw, manufacturer_canonical,
			product_class, model_name, hardware_version, software_version, technology_normalized,
			protocol, data_model_root, COALESCE(host(tr_source_ip), ''), COALESCE(host(wan_ip), ''), pppoe_username,
			connection_request_url, admin_disabled, device_group, periodic_inform_interval,
			last_inform_at, last_summon_at, last_param_sync_at,
			uptime_seconds, rx_power_dbm, temperature_celsius, created_at, updated_at,
			COALESCE((SELECT de.event_code FROM device_events de WHERE de.device_id = devices.id ORDER BY de.created_at DESC LIMIT 1), '') AS last_event_code,
			(SELECT MAX(de.created_at) FROM device_events de WHERE de.device_id = devices.id AND de.event_code LIKE '0 BOOTSTRAP%') AS last_bootstrap_at,
			(SELECT MAX(de.created_at) FROM device_events de WHERE de.device_id = devices.id AND de.event_code LIKE '1 BOOT%') AS last_boot_at
		FROM devices
		WHERE `+whereSQL+`
		ORDER BY `+orderSQL+`
		LIMIT `+limitPh+` OFFSET `+offsetPh, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := make([]device.Device, 0)
	for rows.Next() {
		var d device.Device
		var tech, proto string
		if err := rows.Scan(
			&d.ID, &d.TenantID, &d.SerialNumber, &d.OUI, &d.ManufacturerRaw, &d.ManufacturerCanonical,
			&d.ProductClass, &d.ModelName, &d.HardwareVersion, &d.SoftwareVersion, &tech,
			&proto, &d.DataModelRoot, &d.TRSourceIP, &d.WANIP, &d.PPPoEUsername,
			&d.ConnectionRequestURL, &d.AdminDisabled, &d.DeviceGroup, &d.PeriodicInformInterval,
			&d.LastInformAt, &d.LastSummonAt, &d.LastParamSyncAt,
			&d.UptimeSeconds, &d.RXPowerDBM, &d.TemperatureCelsius, &d.CreatedAt, &d.UpdatedAt,
			&d.LastEventCode, &d.LastBootstrapAt, &d.LastBootAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan device row: %w", err)
		}
		d.TechnologyNormalized = device.Technology(tech)
		d.Protocol = device.Protocol(proto)
		out = append(out, d)
	}
	return out, total, nil
}
