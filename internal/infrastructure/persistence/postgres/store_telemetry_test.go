package postgres

import (
	"math"
	"testing"
)

func TestParseTemperatureCelsius(t *testing.T) {
	cases := []struct {
		raw    string
		want   float64
		wantOK bool
	}{
		{"35", 35.0, true},
		{"48.5", 48.5, true},
		{"12705", 49.6, true},
		{"11417", 44.6, true},
		{"256.000000", 0, false},
		{"256", 0, false},
		{"0", 0, false},
		{"", 0, false},
		{"N/A", 0, false},
	}
	for _, tc := range cases {
		got, ok := parseTemperatureCelsius(tc.raw)
		if ok != tc.wantOK || (ok && math.Abs(got-tc.want) > 0.05) {
			t.Fatalf("parseTemperatureCelsius(%q) = (%v, %v), want (%v, %v)", tc.raw, got, ok, tc.want, tc.wantOK)
		}
	}
}

func TestIsTransceiverTempPath(t *testing.T) {
	yes := []string{
		"InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature",
		"InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature",
		"InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.Temperature",
		"InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.TransceiverTemperature",
	}
	for _, p := range yes {
		if !isTransceiverTempPath(p) {
			t.Fatalf("expected isTransceiverTempPath(%q) = true", p)
		}
	}
	no := []string{
		"InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Temperature",
		"InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower",
	}
	for _, p := range no {
		if isTransceiverTempPath(p) {
			t.Fatalf("expected isTransceiverTempPath(%q) = false", p)
		}
	}
}
