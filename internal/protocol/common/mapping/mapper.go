package mapping

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/nexaacs/nexaacs/internal/domain/device"
)

// VirtualParameterMapping mirrors the 31 standardized Virtual Parameter slots managed by the UI.
type VirtualParameterMapping struct {
	SerialNumber           string `json:"serialNumber"`
	Manufacturer           string `json:"manufacturer"`
	OUI                    string `json:"oui"`
	ProductClass           string `json:"productClass"`
	ModelName              string `json:"modelName"`
	HardwareVersion        string `json:"hardwareVersion"`
	SoftwareVersion        string `json:"softwareVersion"`
	RXPower                string `json:"rxPower"`
	Temperature            string `json:"temperature"`
	Uptime                 string `json:"uptime"`
	ConnectionRequestURL   string `json:"connectionRequestUrl"`
	PeriodicInformInterval string `json:"periodicInformInterval"`
	WANRoot                string `json:"wanRoot"`
	WANExternalIP          string `json:"wanExternalIp"`
	WANPPPoEUsername       string `json:"wanPppoeUsername"`
	WANPPPoEPassword       string `json:"wanPppoePassword"`
	WANVlanID              string `json:"wanVlanId"`
	WANStatus              string `json:"wanStatus"`
	WANAddressingType      string `json:"wanAddressingType,omitempty"`
	WANSubnetMask          string `json:"wanSubnetMask,omitempty"`
	WANGateway             string `json:"wanGateway,omitempty"`
	WANDNSServers          string `json:"wanDnsServers,omitempty"`
	WANConnectionType      string `json:"wanConnectionType,omitempty"`
	WANServiceList         string `json:"wanServiceList,omitempty"`
	WANNATEnabled          string `json:"wanNatEnabled,omitempty"`
	WANPortBindings        string `json:"wanPortBindings,omitempty"`
	WLANRoot               string `json:"wlanRoot"`
	WLANSsid               string `json:"wlanSsid"`
	WLANPassphrase         string `json:"wlanPassphrase"`
	WLANEnabled            string `json:"wlanEnabled"`
	WLANChannel            string `json:"wlanChannel"`
	WLANSecurityMode       string `json:"wlanSecurityMode,omitempty"`
	WLANBand               string `json:"wlanBand,omitempty"`
	WLANAutoChannel        string `json:"wlanAutoChannel,omitempty"`
	ConnectedHostsRoot     string `json:"connectedHostsRoot"`
	HostName               string `json:"hostName"`
	HostMac                string `json:"hostMac"`
	HostIP                 string `json:"hostIp"`
	LANIP                  string `json:"lanIp,omitempty"`
	LANSubnetMask          string `json:"lanSubnetMask,omitempty"`
	LANDHCPServerEnable    string `json:"lanDhcpEnable,omitempty"`
	LANDHCPOption125Enable string `json:"lanDhcpOption125Enable,omitempty"`
	LANDHCPLeaseTime       string `json:"lanDhcpLeaseTime,omitempty"`
	LANDHCPMinAddress      string `json:"lanDhcpStartIp,omitempty"`
	LANDHCPMaxAddress      string `json:"lanDhcpEndIp,omitempty"`
	LANDHCPAssignISPDNS    string `json:"lanDhcpAssignIspDns,omitempty"`
	LANDHCPDNSServers      string `json:"lanDhcpDnsServers,omitempty"`
	AdminUsername          string `json:"adminUsername"`
	AdminPassword          string `json:"adminPassword"`
	UserUsername           string `json:"userUsername"`
	UserPassword           string `json:"userPassword"`
}

type AliasRule struct {
	ID                string                  `json:"id,omitempty"`
	RawName           string                  `json:"rawName"`
	CanonicalName     string                  `json:"canonicalName"`
	OUI               string                  `json:"oui"`
	Source            string                  `json:"source,omitempty"`
	Confidence        string                  `json:"confidence"`
	VirtualParameters VirtualParameterMapping `json:"virtualParameters"`
}

var DefaultManufacturerAliases = []AliasRule{
	{RawName: "ZTE", CanonicalName: "ZTE", Confidence: "high"},
	{RawName: "ZTE Corporation", CanonicalName: "ZTE", Confidence: "high"},
	{RawName: "Bnetfit", CanonicalName: "ZTE", Confidence: "medium"},
	{RawName: "Dual Band", CanonicalName: "ZTE", Confidence: "low"},
	{RawName: "D-Link", CanonicalName: "ZTE", OUI: "1C7EE5", Confidence: "high"},
	{RawName: "TP-Link", CanonicalName: "ZTE", OUI: "50C7BF", Confidence: "high"},
	{RawName: "TP-LINK Technologies", CanonicalName: "ZTE", OUI: "50C7BF", Confidence: "high"},
	{RawName: "Huawei", CanonicalName: "Huawei", OUI: "00259E", Confidence: "high"},
	{RawName: "Huawei Technologies Co., Ltd", CanonicalName: "Huawei", OUI: "00259E", Confidence: "high"},
	{RawName: "Huawei Technologies Co., Ltd", CanonicalName: "Huawei", OUI: "00E0FC", Confidence: "high"},
	{RawName: "Technologies Co., Ltd", CanonicalName: "Huawei", Confidence: "high"},
	{RawName: "Fiberhome", CanonicalName: "Fiberhome", OUI: "000AC2", Confidence: "high"},
	{RawName: "FiberHome Telecommunication Technologies", CanonicalName: "Fiberhome", OUI: "000AC2", Confidence: "high"},
	{RawName: "China Mobile", CanonicalName: "China Mobile", Confidence: "high"},
	{RawName: "CMCC", CanonicalName: "China Mobile", Confidence: "high"},
	{RawName: "CMHI", CanonicalName: "China Mobile", Confidence: "high"},
	{RawName: "China Telecom", CanonicalName: "China Telecom", Confidence: "high"},
	{RawName: "CT-COM", CanonicalName: "China Telecom", Confidence: "high"},
	{RawName: "GM", CanonicalName: "China Telecom", Confidence: "high"},
	{RawName: "GlobalMedia", CanonicalName: "China Telecom", Confidence: "high"},
	{RawName: "Xtetch", CanonicalName: "China Telecom", Confidence: "high"},
	{RawName: "ZICG", CanonicalName: "China Telecom", Confidence: "high"},
	{RawName: "CMDC", CanonicalName: "China Telecom", Confidence: "high"},
	{RawName: "ZTEG", CanonicalName: "China Telecom", Confidence: "high"},
	{RawName: "XSFG", CanonicalName: "China Telecom", Confidence: "high"},
	{RawName: "Zimlink", CanonicalName: "China Telecom", Confidence: "high"},
}

// MatchAliasToken checks whether candidate equals a single token or any comma-separated token in pattern.
func MatchAliasToken(candidate, pattern string) bool {
	c := strings.TrimSpace(candidate)
	if c == "" {
		return false
	}
	for _, part := range strings.Split(pattern, ",") {
		if strings.EqualFold(c, strings.TrimSpace(part)) {
			return true
		}
	}
	return false
}

type ManufacturerResolution struct {
	Canonical  string
	Source     string
	Confidence string
}

// ResolveManufacturer maps raw Inform manufacturer/OUI to a canonical manufacturer without guessing unsupported names.
func ResolveManufacturer(rawName string, oui string, custom []AliasRule) ManufacturerResolution {
	cleanRaw := strings.TrimSpace(rawName)
	cleanOUI := strings.ToUpper(strings.TrimSpace(oui))

	rules := append(custom, DefaultManufacturerAliases...)
	for _, r := range rules {
		if MatchAliasToken(cleanRaw, r.RawName) {
			return ManufacturerResolution{
				Canonical:  r.CanonicalName,
				Source:     "alias_map",
				Confidence: r.Confidence,
			}
		}
	}
	for _, r := range rules {
		if cleanOUI != "" && MatchAliasToken(cleanOUI, r.OUI) {
			return ManufacturerResolution{
				Canonical:  r.CanonicalName,
				Source:     "oui_map",
				Confidence: r.Confidence,
			}
		}
	}
	if cleanRaw == "" {
		return ManufacturerResolution{
			Canonical:  "N/A",
			Source:     "missing",
			Confidence: "low",
		}
	}
	return ManufacturerResolution{
		Canonical:  "Lainnya",
		Source:     "unmapped_raw",
		Confidence: "low",
	}
}

// ResolveManufacturerWithModel resolves canonical manufacturer using raw/OUI aliases first,
// then model/productClass prefix rules (GM* / XST99 / XT99 -> China Telecom CT-COM) for generic OEM OUIs.
func ResolveManufacturerWithModel(rawName, oui, modelName, productClass string, custom []AliasRule) ManufacturerResolution {
	res := ResolveManufacturer(rawName, oui, custom)
	if res.Canonical != "Lainnya" && res.Canonical != "N/A" {
		return res
	}
	for _, candidate := range []string{modelName, productClass} {
		upper := strings.ToUpper(strings.TrimSpace(candidate))
		if upper == "" {
			continue
		}
		if strings.HasPrefix(upper, "GM") || strings.Contains(upper, "XST99") || strings.Contains(upper, "XT99") {
			return ManufacturerResolution{
				Canonical:  "China Telecom",
				Source:     "model_map",
				Confidence: "high",
			}
		}
	}
	return res
}

// DetectVParamVendorFamily infers China Mobile (X_CMCC_), China Telecom (X_CT-COM_),
// Huawei (X_HW_ / X_GponInterafceConfig), ZTE (X_ZTE-COM_), or Fiberhome (X_FH_)
// from TR-069 parameter paths reported by generic/mixed ONTs.
func DetectVParamVendorFamily(paths []string) string {
	hasCTCOM, hasHW, hasZTE, hasFH := false, false, false, false
	for _, p := range paths {
		switch {
		case strings.Contains(p, "X_CMCC_"):
			return "China Mobile"
		case strings.Contains(p, "X_CT-COM_"):
			hasCTCOM = true
		case strings.Contains(p, "X_HW_"), strings.Contains(p, "X_GponInterafceConfig"):
			hasHW = true
		case strings.Contains(p, "X_ZTE-COM_"):
			hasZTE = true
		case strings.Contains(p, "X_FH_"):
			hasFH = true
		}
	}
	switch {
	case hasCTCOM:
		return "China Telecom"
	case hasHW:
		return "Huawei"
	case hasZTE:
		return "ZTE"
	case hasFH:
		return "Fiberhome"
	default:
		return ""
	}
}

// DetectDataModelRoot identifies TR-098 vs TR-181 from parameter path prefixes.
func DetectDataModelRoot(paramPaths []string) string {
	for _, p := range paramPaths {
		if strings.HasPrefix(p, "Device.") {
			return "Device."
		}
		if strings.HasPrefix(p, "InternetGatewayDevice.") {
			return "InternetGatewayDevice."
		}
	}
	return "InternetGatewayDevice."
}

// NormalizeTechnology strictly validates GPON/EPON/Router from reported technology or verified model data (Section 3.6).
func NormalizeTechnology(rawTech string, modelTech string) device.Technology {
	upper := strings.ToUpper(strings.TrimSpace(rawTech))
	if upper == "" {
		upper = strings.ToUpper(strings.TrimSpace(modelTech))
	}
	switch {
	case strings.Contains(upper, "GPON"):
		return device.TechGPON
	case strings.Contains(upper, "EPON"):
		return device.TechEPON
	case strings.Contains(upper, "ROUTER") || strings.Contains(upper, "ETH"):
		return device.TechRouter
	default:
		return device.TechNA
	}
}

// MatchVirtualPathTemplate checks exact or `{i}` wildcard parameter path template matching.
func MatchVirtualPathTemplate(actualPath, template string, asPrefix bool) bool {
	t := strings.TrimSpace(template)
	if t == "" {
		return false
	}
	norm := strings.TrimSpace(actualPath)
	if !strings.Contains(t, "{i}") {
		if asPrefix {
			return norm == t || strings.HasPrefix(norm, t+".")
		}
		return norm == t
	}
	escaped := regexp.QuoteMeta(t)
	escaped = strings.ReplaceAll(escaped, `\{i\}`, `\d+`)
	pattern := "^" + escaped + "$"
	if asPrefix {
		pattern = "^" + escaped + `(?:\.|$)`
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false
	}
	return re.MatchString(norm)
}

// ResolveCanonicalKey maps a CPE parameter path to a standardized canonical key using Virtual Parameters.
func ResolveCanonicalKey(path string, vp *VirtualParameterMapping) string {
	if vp != nil {
		leafPairs := [][2]string{
			{vp.SerialNumber, "device.serial_number"},
			{vp.Manufacturer, "device.manufacturer"},
			{vp.OUI, "device.oui"},
			{vp.ProductClass, "device.product_class"},
			{vp.ModelName, "device.model_name"},
			{vp.HardwareVersion, "device.hardware_version"},
			{vp.SoftwareVersion, "device.software_version"},
			{vp.RXPower, "optical.rx_power_dbm"},
			{vp.Temperature, "device.temperature_celsius"},
			{vp.Uptime, "device.uptime_seconds"},
			{vp.ConnectionRequestURL, "management.connection_request_url"},
			{vp.PeriodicInformInterval, "management.periodic_inform_interval"},
			{vp.WANExternalIP, "wan.external_ip"},
			{vp.WANPPPoEUsername, "wan.pppoe_username"},
			{vp.WANPPPoEPassword, "wan.pppoe_password"},
			{vp.WANVlanID, "wan.vlan_id"},
			{vp.WANStatus, "wan.status"},
			{vp.WANAddressingType, "wan.addressing_type"},
			{vp.WANSubnetMask, "wan.subnet_mask"},
			{vp.WANGateway, "wan.gateway"},
			{vp.WANDNSServers, "wan.dns_servers"},
			{vp.WANConnectionType, "wan.connection_type"},
			{vp.WANServiceList, "wan.service_list"},
			{vp.WANNATEnabled, "wan.nat_enabled"},
			{vp.WANPortBindings, "wan.port_bindings"},
			{vp.WLANSsid, "wifi.ssid"},
			{vp.WLANPassphrase, "wifi.security_key"},
			{vp.WLANEnabled, "wifi.enabled"},
			{vp.WLANChannel, "wifi.channel"},
			{vp.WLANSecurityMode, "wifi.security_mode"},
			{vp.WLANBand, "wifi.band"},
			{vp.WLANAutoChannel, "wifi.auto_channel"},
			{vp.HostName, "hosts.hostname"},
			{vp.HostMac, "hosts.mac_address"},
			{vp.HostIP, "hosts.ip_address"},
			{vp.LANIP, "lan.ip_address"},
			{vp.LANSubnetMask, "lan.subnet_mask"},
			{vp.LANDHCPServerEnable, "lan.dhcp_enabled"},
			{vp.LANDHCPOption125Enable, "lan.dhcp_option125_enabled"},
			{vp.LANDHCPLeaseTime, "lan.dhcp_lease_time"},
			{vp.LANDHCPMinAddress, "lan.dhcp_start_ip"},
			{vp.LANDHCPMaxAddress, "lan.dhcp_end_ip"},
			{vp.LANDHCPAssignISPDNS, "lan.dhcp_assign_isp_dns"},
			{vp.LANDHCPDNSServers, "lan.dhcp_dns_servers"},
			{vp.AdminUsername, "credentials.admin_username"},
			{vp.AdminPassword, "credentials.admin_password"},
			{vp.UserUsername, "credentials.user_username"},
			{vp.UserPassword, "credentials.user_password"},
		}
		for _, pair := range leafPairs {
			if MatchVirtualPathTemplate(path, pair[0], false) {
				return pair[1]
			}
		}
		rootPairs := [][2]string{
			{vp.WANRoot, "wan.root"},
			{vp.WLANRoot, "wifi.root"},
			{vp.ConnectedHostsRoot, "hosts.root"},
		}
		for _, pair := range rootPairs {
			if MatchVirtualPathTemplate(path, pair[0], true) {
				return pair[1]
			}
		}
	}
	// Multi-vendor optical/WLAN/credential fallback for mixed EPON/GPON models under 'Lainnya' (CIOT, ZICG, CMHI).
	switch {
	case strings.HasSuffix(path, ".RXPower") && !strings.HasSuffix(path, ".CATVRXPower"):
		return "optical.rx_power_dbm"
	case strings.HasSuffix(path, ".TransceiverTemperature"),
		strings.HasSuffix(path, ".OpticalTransceiver.Temperature"),
		strings.HasSuffix(path, ".Temperature") && (strings.Contains(path, "Optical") || strings.Contains(path, "PONInterfaceConfig") || strings.Contains(path, "GponInterafceConfig") || strings.Contains(path, "EponInterfaceConfig") || strings.Contains(path, "EponInterafceConfig")):
		return "device.temperature_celsius"
	case strings.Contains(path, ".WLANConfiguration.") && strings.HasSuffix(path, ".KeyPassphrase"):
		return "wifi.security_key"
	case strings.Contains(path, ".WLANConfiguration.") && strings.HasSuffix(path, ".PreSharedKey"):
		return "wifi.security_key"
	case strings.HasSuffix(path, ".X_CT-COM_VLANID"),
		strings.HasSuffix(path, ".X_CMCC_VLANID"),
		strings.HasSuffix(path, ".X_CMCC_VLANIDMark"),
		strings.HasSuffix(path, ".X_CT-COM_WANGponLinkConfig.VLANIDMark"),
		strings.HasSuffix(path, ".X_CT-COM_WANEponLinkConfig.VLANIDMark"):
		return "wan.vlan_id"
	case strings.HasSuffix(path, ".X_CT-COM_TeleComAccount.UserName"),
		strings.HasSuffix(path, ".X_CT-COM_TeleComAccount.Username"),
		strings.HasSuffix(path, ".X_CMCC_TeleComAccount.UserName"),
		strings.HasSuffix(path, ".X_CMCC_TeleComAccount.Username"):
		return "credentials.admin_username"
	case strings.HasSuffix(path, ".X_CT-COM_TeleComAccount.Password"),
		strings.HasSuffix(path, ".X_CMCC_TeleComAccount.Password"):
		return "credentials.admin_password"
	case strings.HasSuffix(path, ".X_CT-COM_UserInfo.UserName"),
		strings.HasSuffix(path, ".X_CT-COM_UserInfo.Username"),
		strings.HasSuffix(path, ".X_CMCC_UserInfo.UserName"),
		strings.HasSuffix(path, ".X_CMCC_UserInfo.Username"):
		return "credentials.user_username"
	case strings.HasSuffix(path, ".X_CT-COM_UserInfo.UserPassword"),
		strings.HasSuffix(path, ".X_CT-COM_UserInfo.Password"),
		strings.HasSuffix(path, ".X_CMCC_UserInfo.UserPassword"),
		strings.HasSuffix(path, ".X_CMCC_UserInfo.Password"):
		return "credentials.user_password"
	case strings.Contains(path, ".LANHostConfigManagement.") && strings.HasSuffix(path, ".IPInterfaceIPAddress"):
		return "lan.ip_address"
	case strings.Contains(path, ".LANHostConfigManagement.") && (strings.HasSuffix(path, ".IPInterfaceSubnetMask") || strings.HasSuffix(path, ".SubnetMask")):
		return "lan.subnet_mask"
	case strings.Contains(path, ".LANHostConfigManagement.") && strings.HasSuffix(path, ".DHCPServerEnable"):
		return "lan.dhcp_enabled"
	case strings.Contains(path, ".LANHostConfigManagement.") && strings.HasSuffix(path, ".DHCPLeaseTime"):
		return "lan.dhcp_lease_time"
	case strings.Contains(path, ".LANHostConfigManagement.") && strings.HasSuffix(path, ".MinAddress"):
		return "lan.dhcp_start_ip"
	case strings.Contains(path, ".LANHostConfigManagement.") && strings.HasSuffix(path, ".MaxAddress"):
		return "lan.dhcp_end_ip"
	case strings.Contains(path, ".LANHostConfigManagement.") && strings.HasSuffix(path, ".DNSServers"):
		return "lan.dhcp_dns_servers"
	case strings.Contains(path, ".LANHostConfigManagement.") && strings.Contains(strings.ToLower(path), "option125"):
		return "lan.dhcp_option125_enabled"
	}
	return ""
}

// DefaultAutoSummonGroups fetches only the mapped Virtual Parameter paths configured in Settings > Aliases VParams.
var DefaultAutoSummonGroups = []string{
	"vparams",
}

// AllSummonGroups fetches only the mapped Virtual Parameter paths (never full root tree scans).
var AllSummonGroups = []string{
	"vparams",
}

func allVirtualParamPaths(vp *VirtualParameterMapping) []string {
	if vp == nil {
		return nil
	}
	return []string{
		vp.SerialNumber, vp.Manufacturer, vp.OUI, vp.ProductClass, vp.ModelName,
		vp.HardwareVersion, vp.SoftwareVersion, vp.RXPower, vp.Temperature, vp.Uptime,
		vp.ConnectionRequestURL, vp.PeriodicInformInterval,
		vp.WANRoot, vp.WANExternalIP, vp.WANPPPoEUsername, vp.WANPPPoEPassword,
		vp.WANVlanID, vp.WANStatus, vp.WANAddressingType, vp.WANSubnetMask,
		vp.WANGateway, vp.WANDNSServers, vp.WANConnectionType, vp.WANServiceList,
		vp.WANNATEnabled, vp.WANPortBindings,
		vp.WLANRoot, vp.WLANSsid, vp.WLANPassphrase, vp.WLANEnabled,
		vp.WLANChannel, vp.WLANSecurityMode, vp.WLANBand, vp.WLANAutoChannel,
		vp.ConnectedHostsRoot, vp.HostName, vp.HostMac, vp.HostIP,
		vp.LANIP, vp.LANSubnetMask, vp.LANDHCPServerEnable, vp.LANDHCPOption125Enable,
		vp.LANDHCPLeaseTime, vp.LANDHCPMinAddress, vp.LANDHCPMaxAddress,
		vp.LANDHCPAssignISPDNS, vp.LANDHCPDNSServers,
		vp.AdminUsername, vp.AdminPassword, vp.UserUsername, vp.UserPassword,
	}
}

// ResolveSummonPaths builds CWMP GetParameterValues path prefixes/leaves for the given summon groups.
func ResolveSummonPaths(dataModelRoot string, vp *VirtualParameterMapping, groups []string) []string {
	if dataModelRoot == "" {
		dataModelRoot = "InternetGatewayDevice."
	}
	set := make(map[string]struct{})
	add := func(p string) {
		p = strings.TrimSpace(p)
		if p == "" {
			return
		}
		// Strip trailing .{i}... into prefix object for CWMP partial-tree GetParameterValues
		if idx := strings.Index(p, ".{i}"); idx > 0 {
			p = p[:idx+1]
		}
		set[p] = struct{}{}
	}
	addGroup := func(g string) {
		switch g {
		case "device_info", "management":
			add(dataModelRoot + "DeviceInfo.")
			add(dataModelRoot + "ManagementServer.")
		case "optical_health", "device_health":
			add(dataModelRoot + "DeviceInfo.UpTime")
			if vp != nil {
				add(vp.Uptime)
				add(vp.RXPower)
				add(vp.Temperature)
			}
		case "wan_summary":
			if vp != nil && (vp.WANExternalIP != "" || vp.WANPPPoEUsername != "" || vp.WANStatus != "") {
				add(vp.WANExternalIP)
				add(vp.WANPPPoEUsername)
				add(vp.WANStatus)
			} else if vp != nil && vp.WANRoot != "" {
				add(vp.WANRoot)
			} else if dataModelRoot == "Device." {
				add("Device.IP.")
				add("Device.PPP.")
			} else {
				add("InternetGatewayDevice.WANDevice.")
			}
		case "wan":
			if vp != nil && vp.WANRoot != "" {
				add(vp.WANRoot)
			} else if dataModelRoot == "Device." {
				add("Device.IP.")
				add("Device.PPP.")
			} else {
				add("InternetGatewayDevice.WANDevice.")
			}
		case "wifi":
			if vp != nil && vp.WLANRoot != "" {
				add(vp.WLANRoot)
			} else if dataModelRoot == "Device." {
				add("Device.WiFi.")
			} else {
				add("InternetGatewayDevice.LANDevice.1.WLANConfiguration.")
			}
		case "connected_hosts":
			if vp != nil && vp.ConnectedHostsRoot != "" {
				add(vp.ConnectedHostsRoot)
			} else if dataModelRoot == "Device." {
				add("Device.Hosts.")
			} else {
				add("InternetGatewayDevice.LANDevice.1.Hosts.")
			}
		case "credentials":
			if vp != nil {
				add(vp.AdminUsername)
				add(vp.AdminPassword)
				add(vp.UserUsername)
				add(vp.UserPassword)
			}
		case "lan", "dhcp":
			if dataModelRoot == "Device." {
				add("Device.DHCPv4.Server.")
				add("Device.IP.Interface.1.")
			} else {
				add("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.")
			}
		case "vparams", "parameters":
			if vp != nil {
				for _, p := range allVirtualParamPaths(vp) {
					// LANHostConfigManagement is always summoned as a subtree below so missing vendor-specific leaves (e.g. Option125) never trigger 9005 faults.
					if dataModelRoot != "Device." && strings.HasPrefix(strings.TrimSpace(p), "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.") {
						continue
					}
					add(p)
				}
			}
			if dataModelRoot == "Device." {
				add("Device.DHCPv4.Server.")
				add("Device.IP.Interface.1.")
			} else {
				add("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.")
			}
			// ZTE fleet includes EPON/CT-COM/CMCC variants (F477V2 CU EPON, F663NV9 CMCC, F477 CT-COM).
			if vp != nil && strings.Contains(vp.RXPower, "X_ZTE-COM_") && dataModelRoot != "Device." {
				add("InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.")
				add("InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.")
				add("InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.")
				add("InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.")
				add("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.")
			}
			if vp != nil && strings.Contains(vp.RXPower, "X_CMCC_") && dataModelRoot != "Device." {
				add("InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.")
				add("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.")
				add("InternetGatewayDevice.DeviceInfo.X_CMCC_TeleComAccount.")
				add("InternetGatewayDevice.X_CMCC_UserInfo.")
			}
			// Include EPON/GPON/CT-COM/CMCC optical & credential fallbacks when unmapped ('Lainnya') or CT-COM generic.
			if len(set) == 0 || (vp != nil && strings.Contains(vp.RXPower, "X_CT-COM_")) {
				if dataModelRoot == "Device." {
					add("Device.DeviceInfo.")
					add("Device.ManagementServer.")
					add("Device.Optical.")
					add("Device.IP.Interface.")
					add("Device.PPP.Interface.")
					add("Device.WiFi.")
					add("Device.Hosts.Host.")
				} else {
					add("InternetGatewayDevice.DeviceInfo.")
					add("InternetGatewayDevice.ManagementServer.")
					add("InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.")
					add("InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.")
					add("InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterafceConfig.")
					add("InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.")
					add("InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.")
					add("InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.")
					add("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.")
					add("InternetGatewayDevice.LANDevice.1.WLANConfiguration.")
					add("InternetGatewayDevice.LANDevice.1.Hosts.Host.")
					add("InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.")
					add("InternetGatewayDevice.X_CT-COM_UserInfo.")
					if len(set) == 0 {
						add("InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.")
						add("InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.")
						add("InternetGatewayDevice.DeviceInfo.X_CMCC_TeleComAccount.")
						add("InternetGatewayDevice.X_CMCC_UserInfo.")
					}
				}
			}
		}
	}
	if len(groups) == 0 {
		for _, g := range AllSummonGroups {
			addGroup(g)
		}
	} else {
		for _, g := range groups {
			addGroup(g)
		}
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	return out
}

type ProvisioningInput struct {
	WANIndex               int
	VLANID                 *int
	PPPoEUsername          string
	PPPoEPassword          string
	WiFiIndex              int
	SSID                   string
	SSIDKey                string
	WiFiEnabled            *bool
	PeriodicInformInterval *int
}

type ProvisionParamSpec struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Value string `json:"value"`
}

func instantiateTemplate(tmpl string, idx int) string {
	if idx <= 0 {
		idx = 1
	}
	return strings.ReplaceAll(strings.TrimSpace(tmpl), "{i}", strconv.Itoa(idx))
}

// BuildProvisioningSetParams maps high-level ISP provisioning fields (PPPoE, VLAN, SSID, SSID Key)
// into vendor-specific TR-069/TR-369 parameter paths via Virtual Parameters.
func BuildProvisioningSetParams(dataModelRoot string, vp *VirtualParameterMapping, in ProvisioningInput) []ProvisionParamSpec {
	isTR181 := strings.TrimSpace(dataModelRoot) == "Device."
	wanIdx := in.WANIndex
	if wanIdx <= 0 {
		wanIdx = 1
	}
	wifiIdx := in.WiFiIndex
	if wifiIdx <= 0 {
		wifiIdx = 1
	}

	pick := func(vpPath, tr098Fallback, tr181Fallback string, idx int) string {
		if strings.TrimSpace(vpPath) != "" {
			return instantiateTemplate(vpPath, idx)
		}
		if isTR181 {
			return instantiateTemplate(tr181Fallback, idx)
		}
		return instantiateTemplate(tr098Fallback, idx)
	}

	var vpSafe VirtualParameterMapping
	if vp != nil {
		vpSafe = *vp
	}

	var out []ProvisionParamSpec
	add := func(name, typ, val string) {
		if name == "" {
			return
		}
		out = append(out, ProvisionParamSpec{Name: name, Type: typ, Value: val})
	}

	if in.VLANID != nil && *in.VLANID > 0 {
		vlanPath := pick(
			vpSafe.WANVlanID,
			"InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_ZTE-COM_VLANID",
			"Device.Ethernet.VLANTermination.{i}.VLANID",
			wanIdx,
		)
		add(vlanPath, "xsd:unsignedInt", strconv.Itoa(*in.VLANID))
	}
	if strings.TrimSpace(in.PPPoEUsername) != "" {
		userPath := pick(
			vpSafe.WANPPPoEUsername,
			"InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Username",
			"Device.PPP.Interface.{i}.Username",
			wanIdx,
		)
		add(userPath, "xsd:string", strings.TrimSpace(in.PPPoEUsername))
	}
	if in.PPPoEPassword != "" {
		passPath := pick(
			vpSafe.WANPPPoEPassword,
			"InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Password",
			"Device.PPP.Interface.{i}.Password",
			wanIdx,
		)
		add(passPath, "xsd:string", in.PPPoEPassword)
	}
	if strings.TrimSpace(in.SSID) != "" {
		ssidPath := pick(
			vpSafe.WLANSsid,
			"InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID",
			"Device.WiFi.SSID.{i}.SSID",
			wifiIdx,
		)
		add(ssidPath, "xsd:string", strings.TrimSpace(in.SSID))
	}
	if in.SSIDKey != "" {
		keyPath := pick(
			vpSafe.WLANPassphrase,
			"InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase",
			"Device.WiFi.AccessPoint.{i}.Security.KeyPassphrase",
			wifiIdx,
		)
		add(keyPath, "xsd:string", in.SSIDKey)
	}
	if in.WiFiEnabled != nil {
		enPath := pick(
			vpSafe.WLANEnabled,
			"InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable",
			"Device.WiFi.SSID.{i}.Enable",
			wifiIdx,
		)
		val := "false"
		if *in.WiFiEnabled {
			val = "true"
		}
		add(enPath, "xsd:boolean", val)
	}
	if in.PeriodicInformInterval != nil && *in.PeriodicInformInterval > 0 {
		piPath := pick(
			vpSafe.PeriodicInformInterval,
			fmt.Sprintf("%sManagementServer.PeriodicInformInterval", "InternetGatewayDevice."),
			"Device.ManagementServer.PeriodicInformInterval",
			1,
		)
		add(piPath, "xsd:unsignedInt", strconv.Itoa(*in.PeriodicInformInterval))
	}
	return out
}

var (
	reTR098WanConnSubObj = regexp.MustCompile(`^(InternetGatewayDevice\.WANDevice\.(\d+)\.WANConnectionDevice\.(\d+)\.)((?:WANPPPConnection|WANIPConnection)\.\d+)\.?$`)
	reTR098WanConnDevObj = regexp.MustCompile(`^(InternetGatewayDevice\.WANDevice\.(\d+)\.WANConnectionDevice\.(\d+))\.?$`)
	reTR181WanIfaceObj   = regexp.MustCompile(`^(Device\.(PPP|IP)\.Interface\.(\d+))\.?$`)
)

func ensureTrailingDot(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return ""
	}
	if !strings.HasSuffix(trimmed, ".") {
		return trimmed + "."
	}
	return trimmed
}

func instantiateWanRootFromVParams(vp *VirtualParameterMapping, instanceIndex int) string {
	if vp == nil || instanceIndex <= 0 {
		return ""
	}
	if tmpl := strings.TrimSpace(vp.WANRoot); tmpl != "" {
		return ensureTrailingDot(strings.ReplaceAll(tmpl, "{i}", strconv.Itoa(instanceIndex)))
	}
	for _, tmpl := range []string{vp.WANPPPoEUsername, vp.WANExternalIP, vp.WANVlanID, vp.WANStatus} {
		t := strings.ReplaceAll(strings.TrimSpace(tmpl), "{i}", strconv.Itoa(instanceIndex))
		if idx := strings.Index(t, ".WANConnectionDevice."); idx >= 0 {
			rest := t[idx+len(".WANConnectionDevice."):]
			if dot := strings.Index(rest, "."); dot > 0 {
				return ensureTrailingDot(t[:idx+len(".WANConnectionDevice.")+dot])
			}
		}
		if strings.HasPrefix(t, "Device.PPP.Interface.") || strings.HasPrefix(t, "Device.IP.Interface.") {
			parts := strings.SplitN(t, ".", 5)
			if len(parts) >= 4 {
				return ensureTrailingDot(strings.Join(parts[:4], "."))
			}
		}
	}
	return ""
}

// ResolveWanDeleteObjectPath determines the exact TR-069/TR-181 DeleteObject target
// using the device's Virtual Parameters (vp.WANRoot / WAN* templates) and known parameter paths.
// When multiple WANPPPConnection/WANIPConnection instances share the same WANConnectionDevice,
// it targets only the specific child connection instance so sibling WAN services stay intact.
func ResolveWanDeleteObjectPath(
	dataModelRoot string,
	vp *VirtualParameterMapping,
	paramPaths []string,
	reqObjectPath string,
	instanceIndex int,
	connectionType string,
) string {
	childPrefixCount := func(connDevPrefix string) (pppPrefixes []string, ipPrefixes []string) {
		pppSeen := make(map[string]struct{})
		ipSeen := make(map[string]struct{})
		for _, p := range paramPaths {
			if !strings.HasPrefix(p, connDevPrefix) {
				continue
			}
			rem := strings.TrimPrefix(p, connDevPrefix)
			parts := strings.SplitN(rem, ".", 3)
			if len(parts) < 2 {
				continue
			}
			subPrefix := connDevPrefix + parts[0] + "." + parts[1] + "."
			switch parts[0] {
			case "WANPPPConnection":
				if _, ok := pppSeen[subPrefix]; !ok {
					pppSeen[subPrefix] = struct{}{}
					pppPrefixes = append(pppPrefixes, subPrefix)
				}
			case "WANIPConnection":
				if _, ok := ipSeen[subPrefix]; !ok {
					ipSeen[subPrefix] = struct{}{}
					ipPrefixes = append(ipPrefixes, subPrefix)
				}
			}
		}
		return pppPrefixes, ipPrefixes
	}

	reqTrim := strings.TrimSpace(reqObjectPath)
	if m := reTR098WanConnSubObj.FindStringSubmatch(reqTrim); len(m) == 5 {
		connDevPrefix := m[1]
		devIdx, _ := strconv.Atoi(m[3])
		subObjPrefix := connDevPrefix + m[4] + "."
		pppList, ipList := childPrefixCount(connDevPrefix)
		if len(pppList)+len(ipList) > 1 {
			return subObjPrefix
		}
		if vpRoot := instantiateWanRootFromVParams(vp, devIdx); vpRoot != "" && reTR098WanConnDevObj.MatchString(vpRoot) && (!strings.Contains(vpRoot, ".WANConnectionDevice.") || strings.HasPrefix(vpRoot, connDevPrefix)) {
			return vpRoot
		}
		return connDevPrefix
	}
	if m := reTR098WanConnDevObj.FindStringSubmatch(reqTrim); len(m) == 4 {
		devIdx, _ := strconv.Atoi(m[3])
		reqDevPrefix := ensureTrailingDot(m[1])
		if vpRoot := instantiateWanRootFromVParams(vp, devIdx); vpRoot != "" && reTR098WanConnDevObj.MatchString(vpRoot) && (!strings.Contains(vpRoot, ".WANConnectionDevice.") || strings.HasPrefix(vpRoot, reqDevPrefix)) {
			return vpRoot
		}
		return reqDevPrefix
	}
	if m := reTR181WanIfaceObj.FindStringSubmatch(reqTrim); len(m) == 4 {
		return ensureTrailingDot(m[1])
	}

	if instanceIndex <= 0 {
		return ""
	}

	if dataModelRoot == "Device." {
		if strings.EqualFold(strings.TrimSpace(connectionType), "PPPoE") {
			return fmt.Sprintf("Device.PPP.Interface.%d.", instanceIndex)
		}
		if vpRoot := instantiateWanRootFromVParams(vp, instanceIndex); vpRoot != "" && strings.HasPrefix(vpRoot, "Device.") {
			return vpRoot
		}
		return fmt.Sprintf("Device.IP.Interface.%d.", instanceIndex)
	}

	connDevPrefix := fmt.Sprintf("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.%d.", instanceIndex)
	if vpRoot := instantiateWanRootFromVParams(vp, instanceIndex); vpRoot != "" && strings.HasPrefix(vpRoot, "InternetGatewayDevice.") {
		if reTR098WanConnDevObj.MatchString(vpRoot) {
			connDevPrefix = vpRoot
		} else {
			return vpRoot
		}
	}
	pppList, ipList := childPrefixCount(connDevPrefix)
	if len(pppList)+len(ipList) > 1 {
		if strings.EqualFold(strings.TrimSpace(connectionType), "PPPoE") && len(pppList) == 1 {
			return pppList[0]
		}
		if !strings.EqualFold(strings.TrimSpace(connectionType), "PPPoE") && len(ipList) == 1 {
			return ipList[0]
		}
	}
	return connDevPrefix
}

