package httpdelivery

import (
	"encoding/json"
	"testing"
)

func TestValidateUsername(t *testing.T) {
	if err := validateUsername("admin"); err != nil {
		t.Fatalf("expected valid username, got %v", err)
	}
	if err := validateUsername("noc.op_01-a"); err != nil {
		t.Fatalf("expected valid username, got %v", err)
	}
	for _, bad := range []string{"a", "bad user", "user@domain"} {
		if err := validateUsername(bad); err == nil {
			t.Fatalf("expected error for invalid username %q", bad)
		}
	}
}

func TestValidateProvisioningFields(t *testing.T) {
	vlan := 100
	periodic := 300
	if err := validateProvisioningFields("ZTEGC1234567", "00E0FC", "Huawei", 1, 1, &vlan, "user@isp", "secret", "HomeWiFi", "12345678", &periodic); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	badVlan := 5000
	if err := validateProvisioningFields("ZTEGC1234567", "", "", 1, 1, &badVlan, "", "", "", "", nil); err == nil {
		t.Fatal("expected error for out-of-range vlanId")
	}
	if err := validateProvisioningFields("ZTEGC1234567", "ZZZZZZ", "", 1, 1, nil, "", "", "", "", nil); err == nil {
		t.Fatal("expected error for non-hex OUI")
	}
	if err := validateProvisioningFields("ZTEGC1234567", "", "", 1, 1, nil, "", "", "Test", "short", nil); err == nil {
		t.Fatal("expected error for short ssidKey")
	}
}

func TestValidateSettingPayload(t *testing.T) {
	validCls := json.RawMessage(`{"tempWarningC":45,"tempCriticalC":55,"rxStrongMinDbm":-12,"rxGoodMinDbm":-20,"rxAttentionMinDbm":-24,"rxWeakMinDbm":-27}`)
	if err := validateSettingPayload("classification", validCls); err != nil {
		t.Fatalf("expected valid classification, got %v", err)
	}
	badCls := json.RawMessage(`{"tempWarningC":60,"tempCriticalC":55,"rxStrongMinDbm":-12,"rxGoodMinDbm":-20,"rxAttentionMinDbm":-24,"rxWeakMinDbm":-27}`)
	if err := validateSettingPayload("classification", badCls); err == nil {
		t.Fatal("expected error when tempWarningC >= tempCriticalC")
	}
}

func TestValidateDeviceTaskPayload(t *testing.T) {
	validSet := json.RawMessage(`{"params":[{"path":"InternetGatewayDevice.ManagementServer.PeriodicInformInterval","value":"300"}]}`)
	if err := validateDeviceTaskPayload("set_parameter_values", validSet); err != nil {
		t.Fatalf("expected valid set_parameter_values, got %v", err)
	}
	badSet := json.RawMessage(`{"params":[{"path":"InvalidRoot.Foo","value":"bar"}]}`)
	if err := validateDeviceTaskPayload("set_parameter_values", badSet); err == nil {
		t.Fatal("expected error for invalid TR-069/TR-181 root prefix")
	}
}

func TestValidateAliasFieldsCommaSeparated(t *testing.T) {
	if err := validateAliasFields("CT-COM, GM, Xtetch, ZICG, CMDC", "China Telecom", "", "high", true); err != nil {
		t.Fatalf("expected valid unified rawName, got %v", err)
	}
	if err := validateAliasFields("Huawei, Huawei Technologies Co., Ltd", "Huawei", "00259E, 00E0FC", "high", true); err != nil {
		t.Fatalf("expected valid multi-OUI alias, got %v", err)
	}
	if err := validateAliasFields("Huawei", "Huawei", "00259E, INVALID", "high", true); err == nil {
		t.Fatal("expected error for invalid OUI in comma-separated list")
	}
}

func TestSecurityHelpers(t *testing.T) {
	// API key least-privilege enforcement
	readOnly := []string{"devices:read"}
	if !apiKeyHasPermission(readOnly, "devices.view") {
		t.Fatal("expected devices:read scope to allow devices.view")
	}
	if apiKeyHasPermission(readOnly, "devices.secrets.view") {
		t.Fatal("expected devices:read scope NOT to allow devices.secrets.view")
	}
	if apiKeyHasPermission(readOnly, "security.users.manage") {
		t.Fatal("expected devices:read scope NOT to allow security.users.manage")
	}
	provKey := []string{"provisioning:write", "devices:read"}
	if !apiKeyHasPermission(provKey, "devices.parameters.write") {
		t.Fatal("expected provisioning:write to allow devices.parameters.write")
	}
	if apiKeyHasPermission(provKey, "devices.factory_reset") {
		t.Fatal("expected provisioning:write NOT to allow devices.factory_reset")
	}
	if !apiKeyHasPermission([]string{"*"}, "security.users.manage") {
		t.Fatal("expected wildcard scope to allow admin permissions")
	}

	// Firmware filename sanitization
	if got := sanitizeFirmwareFilename("../evil/fw_v1.2-rc1.bin"); got != "fw_v1.2-rc1.bin" {
		t.Fatalf("unexpected sanitized firmware filename: %q", got)
	}
	for _, bad := range []string{"", ".", "..", "a b.bin", "bad;rm.bin"} {
		if got := sanitizeFirmwareFilename(bad); got != "" {
			t.Fatalf("expected rejected filename for %q, got %q", bad, got)
		}
	}

	// Host header validation against URL injection
	if got := validateHTTPRequestHost("acs.example.com:8000"); got != "acs.example.com" {
		t.Fatalf("unexpected sanitized host: %q", got)
	}
	for _, badHost := range []string{"evil.com/path", "evil.com@good.com", "host with space"} {
		if got := validateHTTPRequestHost(badHost); got != "" {
			t.Fatalf("expected invalid host %q to be rejected, got %q", badHost, got)
		}
	}
}
