package device

import (
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusOnline         Status = "online"
	StatusOffline        Status = "offline"
	StatusNeverConnected Status = "never_connected"
	StatusUnknown        Status = "unknown"
	StatusDisabled       Status = "disabled"
)

type Protocol string

const (
	ProtocolTR069 Protocol = "TR-069"
	ProtocolTR369 Protocol = "TR-369"
)

type Technology string

const (
	TechEPON   Technology = "EPON"
	TechGPON   Technology = "GPON"
	TechRouter Technology = "Router"
	TechNA     Technology = "N/A"
)

type ThresholdPolicy struct {
	OnlineThresholdSeconds int
	TempWarningC           float64
	TempCriticalC          float64
	RXStrongMinDBM         float64
	RXGoodMinDBM           float64
	RXAttentionMinDBM      float64
	RXWeakMinDBM           float64
}

func DefaultThresholdPolicy() ThresholdPolicy {
	return ThresholdPolicy{
		OnlineThresholdSeconds: 1800, // 30 minutes
		TempWarningC:           45.0,
		TempCriticalC:          55.0,
		RXStrongMinDBM:         -12.0,
		RXGoodMinDBM:           -20.0,
		RXAttentionMinDBM:      -24.0,
		RXWeakMinDBM:           -27.0,
	}
}

type Device struct {
	ID                     uuid.UUID  `json:"id"`
	TenantID               uuid.UUID  `json:"tenant_id"`
	ModelID                *uuid.UUID `json:"model_id,omitempty"`
	SerialNumber           string     `json:"serial_number"`
	OUI                    string     `json:"oui"`
	ManufacturerRaw        string     `json:"manufacturer_raw"`
	ManufacturerCanonical  string     `json:"manufacturer_canonical"`
	ManufacturerSource     string     `json:"manufacturer_source"`
	ManufacturerConfidence string     `json:"manufacturer_confidence"`
	ProductClass           string     `json:"product_class"`
	ModelName              string     `json:"model_name"`
	HardwareVersion        string     `json:"hardware_version"`
	SoftwareVersion        string     `json:"software_version"`
	TechnologyRaw          string     `json:"technology_raw"`
	TechnologyNormalized   Technology `json:"technology_normalized"`
	Protocol               Protocol   `json:"protocol"`
	DataModelRoot          string     `json:"data_model_root"`
	TRSourceIP             string     `json:"tr_source_ip"`
	WANIP                  string     `json:"wan_ip"`
	PPPoEUsername          string     `json:"pppoe_username"`
	ConnectionRequestURL   string     `json:"connection_request_url,omitempty"`
	AdminDisabled          bool       `json:"admin_disabled"`
	DeviceGroup            string     `json:"device_group"`
	OnlineThresholdSeconds int        `json:"online_threshold_seconds"`
	PeriodicInformInterval *int       `json:"periodic_inform_interval,omitempty"`
	LastInformAt           *time.Time `json:"last_inform_at,omitempty"`
	LastEventCode          string     `json:"last_event_code,omitempty"`
	LastBootstrapAt        *time.Time `json:"last_bootstrap_at,omitempty"`
	LastBootAt             *time.Time `json:"last_boot_at,omitempty"`
	LastSeenSource         string     `json:"last_seen_source"`
	LastSummonAt           *time.Time `json:"last_summon_at,omitempty"`
	LastParamSyncAt        *time.Time `json:"last_param_sync_at,omitempty"`
	UptimeSeconds          *int64     `json:"uptime_seconds,omitempty"`
	UptimeFetchedAt        *time.Time `json:"uptime_fetched_at,omitempty"`
	RXPowerDBM             *float64   `json:"rx_power_dbm,omitempty"`
	RXPowerFetchedAt       *time.Time `json:"rx_power_fetched_at,omitempty"`
	TemperatureCelsius     *float64   `json:"temperature_celsius,omitempty"`
	TemperatureFetchedAt   *time.Time `json:"temperature_fetched_at,omitempty"`
	Tags                   []string   `json:"tags"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
	DeletedAt              *time.Time `json:"deleted_at,omitempty"`
}

// ComputeStatus calculates authoritative operational status dynamically from LastInformAt and threshold policy.
func (d *Device) ComputeStatus(now time.Time, globalThresholdSeconds int) Status {
	if d.DeletedAt != nil || d.AdminDisabled {
		return StatusDisabled
	}
	if d.LastInformAt == nil {
		return StatusNeverConnected
	}
	threshold := globalThresholdSeconds
	if threshold <= 0 {
		threshold = d.OnlineThresholdSeconds
	}
	if threshold <= 0 {
		threshold = 1800
	}
	if now.Sub(*d.LastInformAt) <= time.Duration(threshold)*time.Second {
		return StatusOnline
	}
	return StatusOffline
}

// ComputeAvailability implements Section 3.1: (Online / Total Eligible) * 100.
// Returns nil when Total Eligible is 0 so callers render "N/A" rather than 0% or dividing by zero.
func ComputeAvailability(devices []Device, now time.Time, thresholdSeconds int) *float64 {
	var eligible int
	var online int
	for i := range devices {
		if devices[i].DeletedAt != nil || devices[i].AdminDisabled {
			continue
		}
		eligible++
		if devices[i].ComputeStatus(now, thresholdSeconds) == StatusOnline {
			online++
		}
	}
	if eligible == 0 {
		return nil
	}
	pct := (float64(online) / float64(eligible)) * 100.0
	return &pct
}

// ClassifyStatusBucket categorizes devices into mutually exclusive aging buckets (Section 3.2).
func ClassifyStatusBucket(d *Device, now time.Time, thresholdSeconds int) string {
	status := d.ComputeStatus(now, thresholdSeconds)
	switch status {
	case StatusNeverConnected:
		return "Never Connected"
	case StatusDisabled:
		return "Disabled"
	case StatusOnline:
		return "Online"
	case StatusUnknown:
		return "Unknown"
	}

	age := now.Sub(*d.LastInformAt)
	switch {
	case age <= 2*time.Hour:
		return "Offline 30m–2h"
	case age <= 24*time.Hour:
		return "Offline 2–24h"
	case age <= 7*24*time.Hour:
		return "Offline 1–7d"
	case age <= 30*24*time.Hour:
		return "Offline 7–30d"
	default:
		return "Offline > 1 month"
	}
}

// ClassifyUptimeBucket categorizes reported DeviceInfo.UpTime into non-overlapping buckets (Section 3.3).
func ClassifyUptimeBucket(uptimeSeconds *int64) string {
	if uptimeSeconds == nil || *uptimeSeconds < 0 {
		return "N/A"
	}
	u := *uptimeSeconds
	switch {
	case u < 3600:
		return "< 1h"
	case u < 12*3600:
		return "1–12h"
	case u < 24*3600:
		return "12–24h"
	case u < 7*24*3600:
		return "1–7d"
	case u <= 30*24*3600:
		return "7–30d"
	default:
		return "> 1 month"
	}
}

// ClassifyTemperature categorizes temperature in Celsius using non-overlapping thresholds (Section 3.4).
func ClassifyTemperature(tempC *float64, policy ThresholdPolicy) string {
	if tempC == nil {
		return "N/A"
	}
	t := *tempC
	switch {
	case t < policy.TempWarningC:
		return "Normal"
	case t <= policy.TempCriticalC:
		return "Warning"
	default:
		return "Critical"
	}
}

// ClassifyRXPower categorizes optical RX power (dBm) into contiguous, gap-free intervals (Section 3.5).
func ClassifyRXPower(rxDBM *float64, policy ThresholdPolicy) string {
	if rxDBM == nil {
		return "N/A"
	}
	rx := *rxDBM
	switch {
	case rx >= policy.RXStrongMinDBM:
		return "Sangat Kuat"
	case rx >= policy.RXGoodMinDBM:
		return "Baik"
	case rx >= policy.RXAttentionMinDBM:
		return "Perlu Perhatian"
	case rx >= policy.RXWeakMinDBM:
		return "Lemah"
	default:
		return "Sangat Lemah"
	}
}
