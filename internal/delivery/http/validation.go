package httpdelivery

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strings"
)

var (
	reUsername = regexp.MustCompile(`^[a-zA-Z0-9._-]{2,64}$`)
	reSerial   = regexp.MustCompile(`^[A-Za-z0-9._-]{3,64}$`)
	reOUIHex   = regexp.MustCompile(`^[0-9A-Fa-f]{6}$`)
)

func validateUsername(raw string) error {
	if !reUsername.MatchString(raw) {
		return errors.New("username must be 2–64 characters (letters, digits, '.', '_', '-')")
	}
	return nil
}

func validateRoleName(role string) error {
	switch role {
	case "Super Admin", "NOC Engineer", "Technician", "Viewer":
		return nil
	default:
		return errors.New("role must be one of Super Admin, NOC Engineer, Technician, Viewer")
	}
}

func validateUserStatus(status string) error {
	switch status {
	case "", "active", "disabled":
		return nil
	default:
		return errors.New("status must be 'active' or 'disabled'")
	}
}

func validateProvisioningFields(serial, oui, manufacturer string, wanIdx, wifiIdx int, vlan *int, pppoeUser, pppoePass, ssid, ssidKey string, periodic *int) error {
	if !reSerial.MatchString(serial) {
		return errors.New("serialNumber must be 3–64 alphanumeric/._- characters")
	}
	if o := strings.TrimSpace(oui); o != "" && !reOUIHex.MatchString(o) {
		return errors.New("oui must be exactly 6 hex characters")
	}
	if len(strings.TrimSpace(manufacturer)) > 64 {
		return errors.New("manufacturer must be <= 64 characters")
	}
	if wanIdx < 0 || wanIdx > 64 {
		return errors.New("wanIndex must be between 1 and 64")
	}
	if wifiIdx < 0 || wifiIdx > 64 {
		return errors.New("wifiIndex must be between 1 and 64")
	}
	if vlan != nil && (*vlan < 1 || *vlan > 4094) {
		return errors.New("vlanId must be between 1 and 4094")
	}
	if len(strings.TrimSpace(pppoeUser)) > 128 || len(pppoePass) > 128 {
		return errors.New("pppoe credentials must be <= 128 characters")
	}
	if len(strings.TrimSpace(ssid)) > 32 {
		return errors.New("ssid must be <= 32 characters")
	}
	if ssidKey != "" && (len(ssidKey) < 8 || len(ssidKey) > 63) {
		return errors.New("ssidKey must be 8–63 characters")
	}
	if periodic != nil && (*periodic < 10 || *periodic > 86400) {
		return errors.New("periodicInformInterval must be between 10 and 86400 seconds")
	}
	return nil
}

func validateAliasFields(rawName, canonicalName, oui, confidence string, requireRaw bool) error {
	cn := strings.TrimSpace(canonicalName)
	rn := strings.TrimSpace(rawName)
	if cn == "" || len(cn) > 64 {
		return errors.New("canonicalName is required and must be <= 64 characters")
	}
	if requireRaw && rn == "" {
		return errors.New("rawName is required")
	}
	if len(rn) > 255 {
		return errors.New("rawName must be <= 255 characters")
	}
	if o := strings.TrimSpace(oui); o != "" {
		if len(o) > 64 {
			return errors.New("oui must be <= 64 characters")
		}
		for _, tok := range strings.Split(o, ",") {
			t := strings.TrimSpace(tok)
			if t == "" || !reOUIHex.MatchString(t) {
				return errors.New("oui must be 6 hex characters (or comma-separated 6-hex OUIs)")
			}
		}
	}
	if confidence != "" && confidence != "high" && confidence != "medium" && confidence != "low" {
		return errors.New("confidence must be 'high', 'medium', or 'low'")
	}
	return nil
}

func validateSettingPayload(category string, raw json.RawMessage) error {
	switch category {
	case "general":
		var g struct {
			SystemName      string `json:"systemName"`
			Timezone        string `json:"timezone"`
			DefaultPageSize int    `json:"defaultPageSize"`
			RetentionDays   int    `json:"retentionDays"`
		}
		if err := json.Unmarshal(raw, &g); err != nil {
			return errors.New("invalid general settings JSON")
		}
		if len(strings.TrimSpace(g.SystemName)) < 2 || len(strings.TrimSpace(g.SystemName)) > 64 {
			return errors.New("general.systemName must be 2–64 characters")
		}
		if len(strings.TrimSpace(g.Timezone)) < 2 || len(strings.TrimSpace(g.Timezone)) > 64 {
			return errors.New("general.timezone must be 2–64 characters")
		}
		if g.DefaultPageSize != 0 && (g.DefaultPageSize < 5 || g.DefaultPageSize > 200) {
			return errors.New("general.defaultPageSize must be between 5 and 200")
		}
		if g.RetentionDays != 0 && (g.RetentionDays < 1 || g.RetentionDays > 3650) {
			return errors.New("general.retentionDays must be between 1 and 3650")
		}
	case "device_status":
		var d struct {
			OnlineThresholdSeconds           int    `json:"onlineThresholdSeconds"`
			PeriodicInformExpectationSeconds int    `json:"periodicInformExpectationSeconds"`
			NeverConnectedPolicy             string `json:"neverConnectedPolicy"`
			RecalculationIntervalSeconds     int    `json:"recalculationIntervalSeconds"`
		}
		if err := json.Unmarshal(raw, &d); err != nil {
			return errors.New("invalid device_status settings JSON")
		}
		if d.OnlineThresholdSeconds != 0 && (d.OnlineThresholdSeconds < 30 || d.OnlineThresholdSeconds > 86400) {
			return errors.New("onlineThresholdSeconds must be between 30 and 86400")
		}
		if d.PeriodicInformExpectationSeconds != 0 && (d.PeriodicInformExpectationSeconds < 30 || d.PeriodicInformExpectationSeconds > 86400) {
			return errors.New("periodicInformExpectationSeconds must be between 30 and 86400")
		}
		if d.NeverConnectedPolicy != "" && d.NeverConnectedPolicy != "separate_bucket" && d.NeverConnectedPolicy != "treat_unknown" {
			return errors.New("neverConnectedPolicy must be 'separate_bucket' or 'treat_unknown'")
		}
	case "classification":
		var c struct {
			TempWarningC      float64 `json:"tempWarningC"`
			TempCriticalC     float64 `json:"tempCriticalC"`
			RXStrongMinDBM    float64 `json:"rxStrongMinDbm"`
			RXGoodMinDBM      float64 `json:"rxGoodMinDbm"`
			RXAttentionMinDBM float64 `json:"rxAttentionMinDbm"`
			RXWeakMinDBM      float64 `json:"rxWeakMinDbm"`
		}
		if err := json.Unmarshal(raw, &c); err != nil {
			return errors.New("invalid classification settings JSON")
		}
		if c.TempWarningC >= c.TempCriticalC {
			return errors.New("tempWarningC must be strictly less than tempCriticalC")
		}
		if !(c.RXStrongMinDBM > c.RXGoodMinDBM && c.RXGoodMinDBM > c.RXAttentionMinDBM && c.RXAttentionMinDBM > c.RXWeakMinDBM) {
			return errors.New("RX power thresholds must descend strictly: rxStrongMinDbm > rxGoodMinDbm > rxAttentionMinDbm > rxWeakMinDbm")
		}
	case "protocol":
		var p struct {
			CWMPEndpoint          string `json:"cwmpEndpoint"`
			SessionTimeoutSeconds int    `json:"sessionTimeoutSeconds"`
			USPControllerID       string `json:"uspControllerId"`
			USPMTP                string `json:"uspMtp"`
		}
		if err := json.Unmarshal(raw, &p); err != nil {
			return errors.New("invalid protocol settings JSON")
		}
		if ep := strings.TrimSpace(p.CWMPEndpoint); ep != "" {
			u, err := url.Parse(ep)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
				return errors.New("protocol.cwmpEndpoint must be a valid http:// or https:// URL")
			}
		}
		if p.SessionTimeoutSeconds != 0 && (p.SessionTimeoutSeconds < 10 || p.SessionTimeoutSeconds > 600) {
			return errors.New("protocol.sessionTimeoutSeconds must be between 10 and 600")
		}
		if cid := strings.TrimSpace(p.USPControllerID); cid != "" && (len(cid) < 2 || len(cid) > 128) {
			return errors.New("protocol.uspControllerId must be 2–128 characters")
		}
		if p.USPMTP != "" && p.USPMTP != "mqtt" && p.USPMTP != "websocket" && p.USPMTP != "stomp" && p.USPMTP != "coap" {
			return errors.New("protocol.uspMtp must be one of mqtt, websocket, stomp, coap")
		}
	case "auto_summon":
		var a struct {
			Groups                  []string `json:"groups"`
			Events                  []string `json:"events"`
			PeriodicCooldownSeconds int      `json:"periodicCooldownSeconds"`
			WorkerSyncMode          string   `json:"workerSyncMode"`
			WorkerCooldownSeconds   int      `json:"workerCooldownSeconds"`
		}
		if err := json.Unmarshal(raw, &a); err != nil {
			return errors.New("invalid auto_summon settings JSON")
		}
		for _, g := range a.Groups {
			switch g {
			case "optical_health", "wan_summary", "device_info", "device_health", "wan", "wifi", "connected_hosts", "credentials", "vparams", "parameters":
			default:
				return fmt.Errorf("unsupported auto_summon group: %s", g)
			}
		}
		for _, ev := range a.Events {
			switch ev {
			case "0 BOOTSTRAP", "1 BOOT", "2 PERIODIC", "4 VALUE CHANGE":
			default:
				return fmt.Errorf("unsupported auto_summon event trigger: %s", ev)
			}
		}
		if a.PeriodicCooldownSeconds != 0 && (a.PeriodicCooldownSeconds < 10 || a.PeriodicCooldownSeconds > 86400) {
			return errors.New("auto_summon.periodicCooldownSeconds must be between 10 and 86400")
		}
		if a.WorkerSyncMode != "" && a.WorkerSyncMode != "first_detect_only" && a.WorkerSyncMode != "realtime_loop" && a.WorkerSyncMode != "off" {
			return errors.New("auto_summon.workerSyncMode must be 'first_detect_only', 'realtime_loop', or 'off'")
		}
		if a.WorkerCooldownSeconds != 0 && (a.WorkerCooldownSeconds < 30 || a.WorkerCooldownSeconds > 86400) {
			return errors.New("auto_summon.workerCooldownSeconds must be between 30 and 86400")
		}
	default:
		return fmt.Errorf("unsupported settings category: %s", category)
	}
	return nil
}

func validateDeviceTaskPayload(taskType string, raw json.RawMessage) error {
	if len(raw) == 0 || string(raw) == "{}" {
		return nil
	}
	if !json.Valid(raw) {
		return errors.New("task payload must be valid JSON")
	}
	if taskType == "set_parameter_values" {
		var body struct {
			Params []struct {
				Path  string `json:"path"`
				Value string `json:"value"`
			} `json:"params"`
		}
		if err := json.Unmarshal(raw, &body); err == nil && len(body.Params) > 0 {
			for _, p := range body.Params {
				trimmed := strings.TrimSpace(p.Path)
				if len(trimmed) < 3 || len(trimmed) > 512 {
					return errors.New("parameter path must be 3–512 characters")
				}
				if !strings.HasPrefix(trimmed, "InternetGatewayDevice.") && !strings.HasPrefix(trimmed, "Device.") {
					return errors.New("parameter path must start with InternetGatewayDevice. or Device.")
				}
				if len(p.Value) > 2048 {
					return errors.New("parameter value must be <= 2048 characters")
				}
			}
		}
	}
	if taskType == "wan_config" {
		var w struct {
			ConnectionType string `json:"connectionType"`
			AddressingMode string `json:"addressingMode"`
			VLANID         *int   `json:"vlanId"`
			PPPoEUsername  string `json:"pppoeUsername"`
			WANIP          string `json:"wanIp"`
			SubnetMask     string `json:"subnetMask"`
			Gateway        string `json:"gateway"`
		}
		if err := json.Unmarshal(raw, &w); err == nil && w.ConnectionType != "" {
			if w.VLANID != nil && (*w.VLANID < 1 || *w.VLANID > 4094) {
				return errors.New("vlanId must be between 1 and 4094")
			}
			if w.ConnectionType == "PPPoE" && strings.TrimSpace(w.PPPoEUsername) == "" {
				return errors.New("pppoeUsername is required for PPPoE connection")
			}
			if w.ConnectionType == "IPoE" && w.AddressingMode == "Static" {
				if ip := net.ParseIP(strings.TrimSpace(w.WANIP)); ip == nil || ip.To4() == nil {
					return errors.New("valid IPv4 wanIp is required for Static IPoE")
				}
				if mask := net.ParseIP(strings.TrimSpace(w.SubnetMask)); mask == nil || mask.To4() == nil {
					return errors.New("valid IPv4 subnetMask is required for Static IPoE")
				}
				if gw := strings.TrimSpace(w.Gateway); gw != "" {
					if gip := net.ParseIP(gw); gip == nil || gip.To4() == nil {
						return errors.New("gateway must be a valid IPv4 address")
					}
				}
			}
		}
	}
	if taskType == "wifi_config" {
		var w struct {
			SSID         string `json:"ssid"`
			SecurityMode string `json:"securityMode"`
			Passphrase   string `json:"passphrase"`
		}
		if err := json.Unmarshal(raw, &w); err == nil && (w.SSID != "" || w.Passphrase != "") {
			if trimmed := strings.TrimSpace(w.SSID); trimmed == "" || len(trimmed) > 32 {
				return errors.New("ssid must be 1–32 characters")
			}
			if w.SecurityMode != "Open" && w.Passphrase != "" && (len(w.Passphrase) < 8 || len(w.Passphrase) > 63) {
				return errors.New("passphrase must be 8–63 characters")
			}
		}
	}
	return nil
}
