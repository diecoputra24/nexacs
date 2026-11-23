package parameter

import (
	"time"

	"github.com/google/uuid"
)

// ReadState distinguishes missing/unsupported/failed/redacted values from literal zero (Section 1.2 & 10.3).
type ReadState string

const (
	StateAvailable   ReadState = "available"
	StateUnsupported ReadState = "unsupported"
	StateNotFetched  ReadState = "not_fetched"
	StateReadFailed  ReadState = "read_failed"
	StateStale       ReadState = "stale"
	StateRedacted    ReadState = "redacted"
)

type DeviceParameter struct {
	ID              uuid.UUID  `json:"id"`
	TenantID        uuid.UUID  `json:"tenant_id"`
	DeviceID        uuid.UUID  `json:"device_id"`
	ParameterPath   string     `json:"parameter_path"`
	CanonicalKey    string     `json:"canonical_key,omitempty"`
	Value           *string    `json:"value"`
	ValueType       string     `json:"value_type"`
	ReadState       ReadState  `json:"read_state"`
	IsWritable      bool       `json:"is_writable"`
	IsSecret        bool       `json:"is_secret"`
	SourceProtocol  string     `json:"source_protocol"`
	SourceSessionID *uuid.UUID `json:"source_session_id,omitempty"`
	LastAttemptAt   *time.Time `json:"last_attempt_at,omitempty"`
	LastSuccessAt   *time.Time `json:"last_success_at,omitempty"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// MaskIfSecret enforces Section 5.5/10.3 redaction unless explicitly revealed by an authorized caller.
func (p *DeviceParameter) MaskIfSecret(allowReveal bool) {
	if !p.IsSecret || allowReveal {
		return
	}
	masked := "••••••••"
	p.Value = &masked
	p.ReadState = StateRedacted
}

type WANConnection struct {
	InstanceIndex  int    `json:"instance_index"`
	Name           string `json:"name"`
	ConnectionType string `json:"connection_type"` // PPPoE, IPoE, Bridge
	Enabled        bool   `json:"enabled"`
	Status         string `json:"status"`
	WANIP          string `json:"wan_ip"`
	Gateway        string `json:"gateway"`
	DNS            string `json:"dns"`
	PPPoEUsername  string `json:"pppoe_username,omitempty"`
	VLANID         *int   `json:"vlan_id,omitempty"`
	NATEnabled     *bool  `json:"nat_enabled,omitempty"`
}

type WiFiRadio struct {
	Index           int    `json:"index"`
	SSID            string `json:"ssid"`
	Enabled         bool   `json:"enabled"`
	Band            string `json:"band"` // 2.4 GHz, 5 GHz
	SecurityMode    string `json:"security_mode"`
	Channel         string `json:"channel"`
	ChannelWidth    string `json:"channel_width"`
	BroadcastSSID   bool   `json:"broadcast_ssid"`
	AssociatedCount *int   `json:"associated_count,omitempty"`
	PassphraseMask  string `json:"passphrase_mask"`
}

type ConnectedHost struct {
	Hostname       string     `json:"hostname"`
	MACAddress     string     `json:"mac_address"`
	IPAddress      string     `json:"ip_address"`
	InterfaceName  string     `json:"interface_name"`
	ConnectionType string     `json:"connection_type"` // Ethernet, WiFi
	Active         bool       `json:"active"`
	LastSeenAt     *time.Time `json:"last_seen_at,omitempty"`
}
