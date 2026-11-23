package mapping

import "testing"

func TestResolveCanonicalKeyAndSummonPaths(t *testing.T) {
	vp := &VirtualParameterMapping{
		RXPower:            "Device.Optical.Interface.1.OpticalSignalLevel",
		Temperature:        "Device.DeviceInfo.TemperatureStatus.TemperatureSensor.1.Value",
		Uptime:             "Device.DeviceInfo.UpTime",
		WANRoot:            "Device.IP.Interface.{i}",
		WANExternalIP:      "Device.IP.Interface.{i}.IPv4Address.1.IPAddress",
		WANPPPoEUsername:   "Device.PPP.Interface.{i}.Username",
		WLANRoot:           "Device.WiFi.SSID.{i}",
		WLANSsid:           "Device.WiFi.SSID.{i}.SSID",
		WLANPassphrase:     "Device.WiFi.AccessPoint.{i}.Security.KeyPassphrase",
		ConnectedHostsRoot: "Device.Hosts.Host.{i}",
		HostName:           "Device.Hosts.Host.{i}.HostName",
	}

	cases := []struct {
		path string
		want string
	}{
		{"Device.Optical.Interface.1.OpticalSignalLevel", "optical.rx_power_dbm"},
		{"Device.IP.Interface.2.IPv4Address.1.IPAddress", "wan.external_ip"},
		{"Device.WiFi.SSID.2.SSID", "wifi.ssid"},
		{"Device.Hosts.Host.3.HostName", "hosts.hostname"},
		{"Device.Hosts.Host.3.Layer1Interface", "hosts.root"},
		{"Device.Unknown.Leaf", ""},
	}
	for _, c := range cases {
		if got := ResolveCanonicalKey(c.path, vp); got != c.want {
			t.Fatalf("ResolveCanonicalKey(%q) = %q, want %q", c.path, got, c.want)
		}
	}

	paths := ResolveSummonPaths("Device.", vp, []string{"wan", "wifi"})
	if len(paths) != 2 {
		t.Fatalf("expected 2 prefix paths, got %v", paths)
	}

	vpAll := &VirtualParameterMapping{
		RXPower:          vp.RXPower,
		Temperature:      vp.Temperature,
		Uptime:           vp.Uptime,
		WANRoot:          vp.WANRoot,
		WANPPPoEUsername: vp.WANPPPoEUsername,
		WLANRoot:         vp.WLANRoot,
		AdminUsername:    "Device.Users.User.1.Username",
	}
	allPaths := ResolveSummonPaths("Device.", vpAll, AllSummonGroups)
	wantPresent := []string{
		"Device.IP.Interface.",
		"Device.PPP.Interface.",
		"Device.WiFi.SSID.",
		"Device.Users.User.1.Username",
		"Device.Optical.Interface.1.OpticalSignalLevel",
	}
	pathSet := make(map[string]bool, len(allPaths))
	for _, p := range allPaths {
		pathSet[p] = true
	}
	if pathSet["Device."] {
		t.Fatalf("expected full root Device. scan to be excluded from AllSummonPaths, got %v", allPaths)
	}
	for _, w := range wantPresent {
		if !pathSet[w] {
			t.Fatalf("expected %q in AllSummonPaths, got %v", w, allPaths)
		}
	}
}

func TestBuildProvisioningSetParams(t *testing.T) {
	vpZTE := &VirtualParameterMapping{
		WANVlanID:        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_ZTE-COM_VLANID",
		WANPPPoEUsername: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Username",
		WANPPPoEPassword: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Password",
		WLANSsid:         "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID",
		WLANPassphrase:   "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase",
		WLANEnabled:      "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable",
	}
	vlan := 120
	enabled := true
	specs := BuildProvisioningSetParams("InternetGatewayDevice.", vpZTE, ProvisioningInput{
		WANIndex:      2,
		VLANID:        &vlan,
		PPPoEUsername: "cust-jkt-001@nexanet.id",
		PPPoEPassword: "PppPassword!",
		WiFiIndex:     2,
		SSID:          "NexaHome-5G",
		SSIDKey:       "WifiSecret2026",
		WiFiEnabled:   &enabled,
	})
	if len(specs) != 6 {
		t.Fatalf("expected 6 provisioned params, got %d: %+v", len(specs), specs)
	}
	if specs[0].Name != "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.X_ZTE-COM_VLANID" || specs[0].Value != "120" {
		t.Fatalf("unexpected VLAN spec: %+v", specs[0])
	}
	if specs[3].Name != "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID" || specs[3].Value != "NexaHome-5G" {
		t.Fatalf("unexpected SSID spec: %+v", specs[3])
	}

	// Verify TR-181 fallback when vendor has no alias
	tr181Specs := BuildProvisioningSetParams("Device.", nil, ProvisioningInput{
		WANIndex:      1,
		PPPoEUsername: "nokia@nexanet.id",
		SSID:          "Nokia-USP",
	})
	if len(tr181Specs) != 2 || tr181Specs[0].Name != "Device.PPP.Interface.1.Username" {
		t.Fatalf("unexpected TR-181 fallback specs: %+v", tr181Specs)
	}
}

func TestResolveManufacturerWithModel(t *testing.T) {
	if got := ResolveManufacturerWithModel("CIOT", "1C25E1", "GM220-S", "GM220-S", nil); got.Canonical != "China Telecom" {
		t.Fatalf("expected China Telecom for GM220-S, got %+v", got)
	}
	if got := ResolveManufacturerWithModel("CIOT", "64F88A", "GM219-S", "GM219-S", nil); got.Canonical != "China Telecom" {
		t.Fatalf("expected China Telecom for GM219-S, got %+v", got)
	}
	if got := ResolveManufacturerWithModel("ZICG", "09559C", "XST99", "XST99", nil); got.Canonical != "China Telecom" {
		t.Fatalf("expected China Telecom for XST99, got %+v", got)
	}
	if got := ResolveManufacturerWithModel("ZICG", "092984", "XT99", "XT99", nil); got.Canonical != "China Telecom" {
		t.Fatalf("expected China Telecom for XT99, got %+v", got)
	}
	if got := ResolveManufacturerWithModel("CIOT", "B05365", "F663NV3a", "F663NV3a", nil); got.Canonical != "Lainnya" {
		t.Fatalf("expected Lainnya for unmapped F663NV3a before vparam_detect, got %+v", got)
	}
}

func TestOpticalTransceiverFallbackPaths(t *testing.T) {
	vpZTE := &VirtualParameterMapping{
		RXPower:     "InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower",
		Temperature: "InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature",
	}

	if got := ResolveCanonicalKey("InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.Temperature", vpZTE); got != "device.temperature_celsius" {
		t.Fatalf("expected device.temperature_celsius for X_CU OpticalTransceiver.Temperature, got %q", got)
	}
	if got := ResolveCanonicalKey("InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.RXPower", vpZTE); got != "optical.rx_power_dbm" {
		t.Fatalf("expected optical.rx_power_dbm for X_CU OpticalTransceiver.RXPower, got %q", got)
	}
	if got := ResolveCanonicalKey("InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature", nil); got != "device.temperature_celsius" {
		t.Fatalf("expected device.temperature_celsius for Huawei TransceiverTemperature, got %q", got)
	}

	paths := ResolveSummonPaths("InternetGatewayDevice.", vpZTE, []string{"vparams"})
	foundCU := false
	for _, p := range paths {
		if p == "InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver." {
			foundCU = true
			break
		}
	}
	if !foundCU {
		t.Fatalf("expected ZTE vparams summon to include X_CU_WANEPONInterfaceConfig.OpticalTransceiver., got %v", paths)
	}
}

func TestDetectVParamVendorFamily(t *testing.T) {
	if got := DetectVParamVendorFamily([]string{
		"InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.Enable",
		"InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_CT-COM_WANGponLinkConfig.VLANIDMark",
	}); got != "China Telecom" {
		t.Fatalf("expected China Telecom for X_CT-COM_ paths, got %q", got)
	}
	if got := DetectVParamVendorFamily([]string{
		"InternetGatewayDevice.DeviceInfo.X_CMCC_TeleComAccount.Username",
		"InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_CMCC_VLANIDMark",
	}); got != "China Mobile" {
		t.Fatalf("expected China Mobile for X_CMCC_ paths, got %q", got)
	}
	if got := DetectVParamVendorFamily([]string{
		"InternetGatewayDevice.DeviceInfo.SoftwareVersion",
	}); got != "" {
		t.Fatalf("expected empty vendor family for neutral paths, got %q", got)
	}

	if got := ResolveCanonicalKey("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_CT-COM_WANGponLinkConfig.VLANIDMark", nil); got != "wan.vlan_id" {
		t.Fatalf("expected wan.vlan_id for CT-COM VLANIDMark, got %q", got)
	}
	if got := ResolveCanonicalKey("InternetGatewayDevice.DeviceInfo.X_CMCC_TeleComAccount.Username", nil); got != "credentials.admin_username" {
		t.Fatalf("expected credentials.admin_username for CMCC TeleComAccount.Username, got %q", got)
	}
	if got := ResolveCanonicalKey("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress", nil); got != "lan.ip_address" {
		t.Fatalf("expected lan.ip_address, got %q", got)
	}
	if got := ResolveCanonicalKey("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_HW_Option125Enable", nil); got != "lan.dhcp_option125_enabled" {
		t.Fatalf("expected lan.dhcp_option125_enabled, got %q", got)
	}
	if got := ResolveCanonicalKey("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers", nil); got != "lan.dhcp_dns_servers" {
		t.Fatalf("expected lan.dhcp_dns_servers, got %q", got)
	}

	lanPaths := ResolveSummonPaths("InternetGatewayDevice.", &VirtualParameterMapping{
		RXPower:                "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower",
		LANDHCPServerEnable:    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable",
		LANDHCPOption125Enable: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_HW_Option125Enable",
	}, []string{"vparams"})
	foundLanRoot := false
	for _, p := range lanPaths {
		if p == "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement." {
			foundLanRoot = true
		}
		if p == "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_HW_Option125Enable" {
			t.Fatalf("expected LANHostConfigManagement leaves to be deduplicated into subtree prefix, got %v", lanPaths)
		}
	}
	if !foundLanRoot {
		t.Fatalf("expected LANHostConfigManagement. in vparams summon paths, got %v", lanPaths)
	}
}

func TestUnifiedAliasCommaMatchingAndVendorFamily(t *testing.T) {
	unified := []AliasRule{
		{
			RawName:       "CT-COM, China Telecom, GM, Xtetch, ZICG, CIOT, CMDC",
			CanonicalName: "China Telecom",
			Confidence:    "high",
		},
		{
			RawName:       "CMCC, China Mobile, CMHI",
			CanonicalName: "China Mobile",
			Confidence:    "high",
		},
		{
			RawName:       "Huawei, Huawei Technologies Co., Ltd",
			CanonicalName: "Huawei",
			OUI:           "00259E, 00E0FC",
			Confidence:    "high",
		},
	}

	if got := ResolveManufacturerWithModel("ZICG", "14007D", "XST99", "XST99", unified); got.Canonical != "China Telecom" {
		t.Fatalf("expected China Telecom via unified CSV RawName, got %+v", got)
	}
	if got := ResolveManufacturerWithModel("CMHI", "8C1850", "", "", unified); got.Canonical != "China Mobile" {
		t.Fatalf("expected China Mobile via unified CSV RawName, got %+v", got)
	}
	if got := ResolveManufacturerWithModel("", "00E0FC", "HG8245H", "HG8245H", unified); got.Canonical != "Huawei" {
		t.Fatalf("expected Huawei via unified CSV OUI, got %+v", got)
	}
	if got := DetectVParamVendorFamily([]string{"InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower"}); got != "Huawei" {
		t.Fatalf("expected Huawei vendor family, got %q", got)
	}
	if got := DetectVParamVendorFamily([]string{"InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower"}); got != "ZTE" {
		t.Fatalf("expected ZTE vendor family, got %q", got)
	}
	if got := DetectVParamVendorFamily([]string{"InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower"}); got != "Fiberhome" {
		t.Fatalf("expected Fiberhome vendor family, got %q", got)
	}
}
