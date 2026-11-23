package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexaacs/nexaacs/internal/domain/device"
	"github.com/nexaacs/nexaacs/internal/protocol/common/mapping"
	"github.com/nexaacs/nexaacs/internal/protocol/cwmp/soap"
)

type ProvisionRequest struct {
	SerialNumber           string `json:"serialNumber"`
	OUI                    string `json:"oui"`
	Manufacturer           string `json:"manufacturer"`
	WANIndex               int    `json:"wanIndex"`
	VLANID                 *int   `json:"vlanId"`
	PPPoEUsername          string `json:"pppoeUsername"`
	PPPoEPassword          string `json:"pppoePassword"`
	WiFiIndex              int    `json:"wifiIndex"`
	SSID                   string `json:"ssid"`
	SSIDKey                string `json:"ssidKey"`
	WiFiEnabled            *bool  `json:"wifiEnabled"`
	PeriodicInformInterval *int   `json:"periodicInformInterval"`
	AutoApplyOnBoot        *bool  `json:"autoApplyOnBoot"`
}

type ProvisioningProfileRow struct {
	ID                     uuid.UUID  `json:"id"`
	SerialNumber           string     `json:"serialNumber"`
	OUI                    string     `json:"oui"`
	Manufacturer           string     `json:"manufacturer"`
	WANIndex               int        `json:"wanIndex"`
	VLANID                 *int       `json:"vlanId"`
	PPPoEUsername          string     `json:"pppoeUsername"`
	HasPPPoEPassword       bool       `json:"hasPppoePassword"`
	WiFiIndex              int        `json:"wifiIndex"`
	SSID                   string     `json:"ssid"`
	HasSSIDKey             bool       `json:"hasSsidKey"`
	WiFiEnabled            bool       `json:"wifiEnabled"`
	PeriodicInformInterval *int       `json:"periodicInformInterval"`
	AutoApplyOnBoot        bool       `json:"autoApplyOnBoot"`
	Status                 string     `json:"status"`
	LastTaskID             *uuid.UUID `json:"lastTaskId,omitempty"`
	LastError              string     `json:"lastError"`
	LastAppliedAt          *time.Time `json:"lastAppliedAt"`
	CreatedAt              time.Time  `json:"createdAt"`
	UpdatedAt              time.Time  `json:"updatedAt"`
}

type ProvisionResult struct {
	Profile       *ProvisioningProfileRow      `json:"profile"`
	DeviceID      uuid.UUID                    `json:"deviceId"`
	TaskID        *uuid.UUID                   `json:"taskId,omitempty"`
	MappedParams  []mapping.ProvisionParamSpec `json:"mappedParameters,omitempty"`
	ExecutionMode string                       `json:"executionMode"` // queued_immediately, waiting_for_bootstrap
}

func (s *Store) UpsertAndQueueProvisioning(ctx context.Context, tenantID uuid.UUID, req ProvisionRequest) (*ProvisionResult, error) {
	serial := strings.ToUpper(strings.TrimSpace(req.SerialNumber))
	if serial == "" {
		return nil, errors.New("serialNumber is required")
	}
	if req.WANIndex <= 0 {
		req.WANIndex = 1
	}
	if req.WiFiIndex <= 0 {
		req.WiFiIndex = 1
	}
	wifiEnabled := true
	if req.WiFiEnabled != nil {
		wifiEnabled = *req.WiFiEnabled
	}
	autoOnBoot := true
	if req.AutoApplyOnBoot != nil {
		autoOnBoot = *req.AutoApplyOnBoot
	}

	var pppoePwdEnc, ssidKeyEnc []byte
	if req.PPPoEPassword != "" {
		if s.cipher == nil {
			return nil, errors.New("NEXAACS_SECRET_MASTER_KEY is required to encrypt PPPoE password")
		}
		var err error
		if pppoePwdEnc, err = s.cipher.Encrypt(req.PPPoEPassword); err != nil {
			return nil, err
		}
	}
	if req.SSIDKey != "" {
		if s.cipher == nil {
			return nil, errors.New("NEXAACS_SECRET_MASTER_KEY is required to encrypt SSID key")
		}
		var err error
		if ssidKeyEnc, err = s.cipher.Encrypt(req.SSIDKey); err != nil {
			return nil, err
		}
	}

	aliases, _ := s.LoadAliases(ctx, tenantID)

	// Locate existing device or pre-enroll placeholder device for zero-touch onboarding
	var devID uuid.UUID
	var devOUI, devMfgRaw, devMfgCanon, devRoot, devProto string
	var lastInform *time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT id, oui, manufacturer_raw, manufacturer_canonical, data_model_root, protocol, last_inform_at
		FROM devices
		WHERE tenant_id = $1 AND UPPER(serial_number) = $2 AND deleted_at IS NULL
	`, tenantID, serial).Scan(&devID, &devOUI, &devMfgRaw, &devMfgCanon, &devRoot, &devProto, &lastInform)

	if errors.Is(err, pgx.ErrNoRows) {
		mfgRes := mapping.ResolveManufacturer(req.Manufacturer, req.OUI, aliases)
		devOUI = strings.ToUpper(strings.TrimSpace(req.OUI))
		devMfgRaw = strings.TrimSpace(req.Manufacturer)
		devMfgCanon = mfgRes.Canonical
		devRoot = "InternetGatewayDevice."
		devProto = "TR-069"

		if err := s.pool.QueryRow(ctx, `
			INSERT INTO devices (
				tenant_id, serial_number, oui, manufacturer_raw, manufacturer_canonical,
				manufacturer_source, manufacturer_confidence, protocol, data_model_root,
				pppoe_username, status
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, 'TR-069', 'InternetGatewayDevice.', $8, 'never_connected'
			)
			RETURNING id
		`, tenantID, serial, devOUI, devMfgRaw, devMfgCanon, mfgRes.Source, mfgRes.Confidence, strings.TrimSpace(req.PPPoEUsername)).Scan(&devID); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}

	// Upsert provisioning profile (preserve existing encrypted secrets if field omitted on partial update)
	var prof ProvisioningProfileRow
	err = s.pool.QueryRow(ctx, `
		INSERT INTO provisioning_profiles (
			tenant_id, serial_number, oui, manufacturer, wan_index, vlan_id,
			pppoe_username, pppoe_password_ciphertext, wifi_index, ssid, ssid_key_ciphertext,
			wifi_enabled, periodic_inform_interval, auto_apply_on_boot, status, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10, $11,
			$12, $13, $14, 'pending', NOW()
		)
		ON CONFLICT (tenant_id, serial_number) DO UPDATE SET
			oui = CASE WHEN EXCLUDED.oui <> '' THEN EXCLUDED.oui ELSE provisioning_profiles.oui END,
			manufacturer = CASE WHEN EXCLUDED.manufacturer <> '' THEN EXCLUDED.manufacturer ELSE provisioning_profiles.manufacturer END,
			wan_index = EXCLUDED.wan_index,
			vlan_id = COALESCE(EXCLUDED.vlan_id, provisioning_profiles.vlan_id),
			pppoe_username = CASE WHEN EXCLUDED.pppoe_username <> '' THEN EXCLUDED.pppoe_username ELSE provisioning_profiles.pppoe_username END,
			pppoe_password_ciphertext = COALESCE(EXCLUDED.pppoe_password_ciphertext, provisioning_profiles.pppoe_password_ciphertext),
			wifi_index = EXCLUDED.wifi_index,
			ssid = CASE WHEN EXCLUDED.ssid <> '' THEN EXCLUDED.ssid ELSE provisioning_profiles.ssid END,
			ssid_key_ciphertext = COALESCE(EXCLUDED.ssid_key_ciphertext, provisioning_profiles.ssid_key_ciphertext),
			wifi_enabled = EXCLUDED.wifi_enabled,
			periodic_inform_interval = COALESCE(EXCLUDED.periodic_inform_interval, provisioning_profiles.periodic_inform_interval),
			auto_apply_on_boot = EXCLUDED.auto_apply_on_boot,
			status = 'pending',
			last_error = '',
			updated_at = NOW()
		RETURNING id, serial_number, oui, manufacturer, wan_index, vlan_id, pppoe_username,
		          (pppoe_password_ciphertext IS NOT NULL), wifi_index, ssid, (ssid_key_ciphertext IS NOT NULL),
		          wifi_enabled, periodic_inform_interval, auto_apply_on_boot, status,
		          last_task_id, last_error, last_applied_at, created_at, updated_at
	`, tenantID, serial, devOUI, devMfgCanon, req.WANIndex, req.VLANID,
		strings.TrimSpace(req.PPPoEUsername), pppoePwdEnc, req.WiFiIndex, strings.TrimSpace(req.SSID), ssidKeyEnc,
		wifiEnabled, req.PeriodicInformInterval, autoOnBoot,
	).Scan(
		&prof.ID, &prof.SerialNumber, &prof.OUI, &prof.Manufacturer, &prof.WANIndex, &prof.VLANID,
		&prof.PPPoEUsername, &prof.HasPPPoEPassword, &prof.WiFiIndex, &prof.SSID, &prof.HasSSIDKey,
		&prof.WiFiEnabled, &prof.PeriodicInformInterval, &prof.AutoApplyOnBoot, &prof.Status,
		&prof.LastTaskID, &prof.LastError, &prof.LastAppliedAt, &prof.CreatedAt, &prof.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(req.PPPoEUsername) != "" || req.PPPoEPassword != "" {
		_ = s.UpsertDeviceCredential(ctx, tenantID, devID, "pppoe", strings.TrimSpace(req.PPPoEUsername), req.PPPoEPassword, s.cipher)
	}

	// If device is already known (has informed before), resolve VParams and queue SetParameterValues + Summon immediately
	if lastInform != nil {
		matchedAlias := matchAliasRule(aliases, devOUI, devMfgRaw, devMfgCanon)
		var vp *mapping.VirtualParameterMapping
		if matchedAlias != nil {
			vp = &matchedAlias.VirtualParameters
		}
		specs := mapping.BuildProvisioningSetParams(devRoot, vp, mapping.ProvisioningInput{
			WANIndex:               req.WANIndex,
			VLANID:                 req.VLANID,
			PPPoEUsername:          req.PPPoEUsername,
			PPPoEPassword:          req.PPPoEPassword,
			WiFiIndex:              req.WiFiIndex,
			SSID:                   req.SSID,
			SSIDKey:                req.SSIDKey,
			WiFiEnabled:            &wifiEnabled,
			PeriodicInformInterval: req.PeriodicInformInterval,
		})
		if len(specs) > 0 {
			tid, err := s.queueProvisionTasks(ctx, tenantID, devID, devProto, devRoot, vp, prof.ID, specs)
			if err != nil {
				return nil, err
			}
			prof.Status = "queued"
			prof.LastTaskID = &tid
			return &ProvisionResult{
				Profile:       &prof,
				DeviceID:      devID,
				TaskID:        &tid,
				MappedParams:  specs,
				ExecutionMode: "queued_immediately",
			}, nil
		}
	}

	return &ProvisionResult{
		Profile:       &prof,
		DeviceID:      devID,
		ExecutionMode: "waiting_for_bootstrap",
	}, nil
}

// ApplyProvisioningOnInform automatically pushes stored ISP provisioning settings (PPPoE, VLAN, SSID, SSID Key)
// when an ONT connects via `0 BOOTSTRAP`, `1 BOOT`, or has a pending provisioning profile.
func (s *Store) ApplyProvisioningOnInform(ctx context.Context, dev *device.Device, events []soap.EventStruct) error {
	if dev == nil {
		return nil
	}
	var profID uuid.UUID
	var wanIdx, wifiIdx int
	var vlanPtr, periodicPtr *int
	var pppoeUser, ssid, status string
	var pppoeEnc, ssidKeyEnc []byte
	var wifiEnabled, autoOnBoot bool
	var lastApplied *time.Time

	err := s.pool.QueryRow(ctx, `
		SELECT id, wan_index, vlan_id, pppoe_username, pppoe_password_ciphertext,
		       wifi_index, ssid, ssid_key_ciphertext, wifi_enabled,
		       periodic_inform_interval, auto_apply_on_boot, status, last_applied_at
		FROM provisioning_profiles
		WHERE tenant_id = $1 AND UPPER(serial_number) = $2
	`, dev.TenantID, strings.ToUpper(dev.SerialNumber)).Scan(
		&profID, &wanIdx, &vlanPtr, &pppoeUser, &pppoeEnc,
		&wifiIdx, &ssid, &ssidKeyEnc, &wifiEnabled,
		&periodicPtr, &autoOnBoot, &status, &lastApplied,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}

	hasBootstrap := false
	for _, ev := range events {
		if strings.HasPrefix(strings.TrimSpace(ev.EventCode), "0 BOOTSTRAP") {
			hasBootstrap = true
			break
		}
	}

	// Apply when profile is pending OR when device just underwent a factory reset / bootstrap with auto_apply_on_boot
	if status != "pending" && !(autoOnBoot && hasBootstrap) {
		return nil
	}
	// Guard against duplicate queueing if already queued in the last 15 seconds
	if status == "queued" && lastApplied != nil && time.Since(*lastApplied) < 15*time.Second {
		return nil
	}

	var pppoePwd, ssidKey string
	if len(pppoeEnc) > 0 && s.cipher != nil {
		if p, err := s.cipher.Decrypt(pppoeEnc); err == nil {
			pppoePwd = p
		}
	}
	if len(ssidKeyEnc) > 0 && s.cipher != nil {
		if k, err := s.cipher.Decrypt(ssidKeyEnc); err == nil {
			ssidKey = k
		}
	}

	aliases, _ := s.LoadAliases(ctx, dev.TenantID)
	matchedAlias := matchAliasRule(aliases, dev.OUI, dev.ManufacturerRaw, dev.ManufacturerCanonical)
	var vp *mapping.VirtualParameterMapping
	if matchedAlias != nil {
		vp = &matchedAlias.VirtualParameters
	}

	specs := mapping.BuildProvisioningSetParams(dev.DataModelRoot, vp, mapping.ProvisioningInput{
		WANIndex:               wanIdx,
		VLANID:                 vlanPtr,
		PPPoEUsername:          pppoeUser,
		PPPoEPassword:          pppoePwd,
		WiFiIndex:              wifiIdx,
		SSID:                   ssid,
		SSIDKey:                ssidKey,
		WiFiEnabled:            &wifiEnabled,
		PeriodicInformInterval: periodicPtr,
	})
	if len(specs) == 0 {
		return nil
	}

	_, err = s.queueProvisionTasks(ctx, dev.TenantID, dev.ID, string(dev.Protocol), dev.DataModelRoot, vp, profID, specs)
	return err
}

func (s *Store) queueProvisionTasks(
	ctx context.Context,
	tenantID, devID uuid.UUID,
	proto, dataModelRoot string,
	vp *mapping.VirtualParameterMapping,
	profID uuid.UUID,
	specs []mapping.ProvisionParamSpec,
) (uuid.UUID, error) {
	if proto == "" {
		proto = "TR-069"
	}
	payloadRaw, _ := json.Marshal(map[string]interface{}{
		"source":     "auto_provisioning",
		"parameters": specs,
	})
	var taskID uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO tasks (tenant_id, device_id, protocol, task_type, status, payload, scheduled_at)
		VALUES ($1, $2, $3, 'set_parameter_values', 'queued', $4, NOW() - INTERVAL '1 millisecond')
		RETURNING id
	`, tenantID, devID, proto, payloadRaw).Scan(&taskID); err != nil {
		return uuid.Nil, err
	}

	// Queue follow-up Summon All in the same CWMP session right after SetParameterValues
	summonPaths := mapping.ResolveSummonPaths(dataModelRoot, vp, mapping.AllSummonGroups)
	summonPayload, _ := json.Marshal(map[string]interface{}{
		"source": "auto_provisioning",
		"groups": mapping.AllSummonGroups,
		"paths":  summonPaths,
	})
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO tasks (tenant_id, device_id, protocol, task_type, status, payload, scheduled_at)
		VALUES ($1, $2, $3, 'summon', 'queued', $4, NOW())
	`, tenantID, devID, proto, summonPayload)

	_, _ = s.pool.Exec(ctx, `
		UPDATE provisioning_profiles
		SET status = 'queued', last_task_id = $2, last_error = '', last_applied_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, profID, taskID)

	return taskID, nil
}

func (s *Store) ListProvisioningProfiles(ctx context.Context, tenantID uuid.UUID) ([]ProvisioningProfileRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, serial_number, oui, manufacturer, wan_index, vlan_id, pppoe_username,
		       (pppoe_password_ciphertext IS NOT NULL), wifi_index, ssid, (ssid_key_ciphertext IS NOT NULL),
		       wifi_enabled, periodic_inform_interval, auto_apply_on_boot, status,
		       last_task_id, last_error, last_applied_at, created_at, updated_at
		FROM provisioning_profiles
		WHERE tenant_id = $1
		ORDER BY updated_at DESC
		LIMIT 200
	`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]ProvisioningProfileRow, 0)
	for rows.Next() {
		var r ProvisioningProfileRow
		if err := rows.Scan(
			&r.ID, &r.SerialNumber, &r.OUI, &r.Manufacturer, &r.WANIndex, &r.VLANID, &r.PPPoEUsername,
			&r.HasPPPoEPassword, &r.WiFiIndex, &r.SSID, &r.HasSSIDKey,
			&r.WiFiEnabled, &r.PeriodicInformInterval, &r.AutoApplyOnBoot, &r.Status,
			&r.LastTaskID, &r.LastError, &r.LastAppliedAt, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

func (s *Store) GetProvisioningProfileBySerial(ctx context.Context, tenantID uuid.UUID, serial string) (*ProvisioningProfileRow, error) {
	var r ProvisioningProfileRow
	err := s.pool.QueryRow(ctx, `
		SELECT id, serial_number, oui, manufacturer, wan_index, vlan_id, pppoe_username,
		       (pppoe_password_ciphertext IS NOT NULL), wifi_index, ssid, (ssid_key_ciphertext IS NOT NULL),
		       wifi_enabled, periodic_inform_interval, auto_apply_on_boot, status,
		       last_task_id, last_error, last_applied_at, created_at, updated_at
		FROM provisioning_profiles
		WHERE tenant_id = $1 AND UPPER(serial_number) = $2
	`, tenantID, strings.ToUpper(strings.TrimSpace(serial))).Scan(
		&r.ID, &r.SerialNumber, &r.OUI, &r.Manufacturer, &r.WANIndex, &r.VLANID, &r.PPPoEUsername,
		&r.HasPPPoEPassword, &r.WiFiIndex, &r.SSID, &r.HasSSIDKey,
		&r.WiFiEnabled, &r.PeriodicInformInterval, &r.AutoApplyOnBoot, &r.Status,
		&r.LastTaskID, &r.LastError, &r.LastAppliedAt, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *Store) DeleteProvisioningProfile(ctx context.Context, tenantID uuid.UUID, serial string) error {
	_, err := s.pool.Exec(ctx, `
		DELETE FROM provisioning_profiles WHERE tenant_id = $1 AND UPPER(serial_number) = $2
	`, tenantID, strings.ToUpper(strings.TrimSpace(serial)))
	return err
}
