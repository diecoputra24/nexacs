package device

import (
	"testing"
	"time"
)

func TestComputeStatusAndAvailability(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	recent := now.Add(-10 * time.Minute)
	stale := now.Add(-45 * time.Minute)
	deletedAt := now.Add(-1 * time.Hour)

	devices := []Device{
		{SerialNumber: "SN1", LastInformAt: &recent},
		{SerialNumber: "SN2", LastInformAt: &stale},
		{SerialNumber: "SN3", LastInformAt: nil},                            // Never Connected
		{SerialNumber: "SN4", LastInformAt: &recent, DeletedAt: &deletedAt}, // Excluded from eligible
	}

	if got := devices[0].ComputeStatus(now, 1800); got != StatusOnline {
		t.Fatalf("expected SN1 online, got %s", got)
	}
	if got := devices[1].ComputeStatus(now, 1800); got != StatusOffline {
		t.Fatalf("expected SN2 offline, got %s", got)
	}
	if got := devices[2].ComputeStatus(now, 1800); got != StatusNeverConnected {
		t.Fatalf("expected SN3 never_connected, got %s", got)
	}

	avail := ComputeAvailability(devices, now, 1800)
	if avail == nil {
		t.Fatal("expected non-nil availability")
	}
	// 1 online out of 3 eligible = 33.333...%
	if *avail < 33.3 || *avail > 33.4 {
		t.Fatalf("expected ~33.33%% availability, got %.2f%%", *avail)
	}

	if empty := ComputeAvailability(nil, now, 1800); empty != nil {
		t.Fatalf("expected nil availability for 0 eligible devices, got %.2f", *empty)
	}

	// Global Settings onlineThresholdSeconds (e.g. 3900) must override the DB column default (1800).
	legacyDefaultDev := Device{
		SerialNumber:           "SN-LEGACY",
		LastInformAt:           &stale, // 45 minutes ago (> 1800s, <= 3900s)
		OnlineThresholdSeconds: 1800,
	}
	if got := legacyDefaultDev.ComputeStatus(now, 3900); got != StatusOnline {
		t.Fatalf("expected global threshold 3900 to override legacy default 1800, got %s", got)
	}
}

func TestClassifications(t *testing.T) {
	policy := DefaultThresholdPolicy()

	rxStrong := -11.5
	rxGood := -18.2
	rxWarn := -22.5
	rxWeak := -25.8
	rxCrit := -28.4

	if got := ClassifyRXPower(nil, policy); got != "N/A" {
		t.Fatalf("expected N/A for nil RX, got %s", got)
	}
	if got := ClassifyRXPower(&rxStrong, policy); got != "Sangat Kuat" {
		t.Fatalf("expected Sangat Kuat, got %s", got)
	}
	if got := ClassifyRXPower(&rxGood, policy); got != "Baik" {
		t.Fatalf("expected Baik, got %s", got)
	}
	if got := ClassifyRXPower(&rxWarn, policy); got != "Perlu Perhatian" {
		t.Fatalf("expected Perlu Perhatian, got %s", got)
	}
	if got := ClassifyRXPower(&rxWeak, policy); got != "Lemah" {
		t.Fatalf("expected Lemah, got %s", got)
	}
	if got := ClassifyRXPower(&rxCrit, policy); got != "Sangat Lemah" {
		t.Fatalf("expected Sangat Lemah, got %s", got)
	}

	tNormal := 42.0
	tWarn := 50.0
	tCrit := 56.0
	if got := ClassifyTemperature(&tNormal, policy); got != "Normal" {
		t.Fatalf("expected Normal, got %s", got)
	}
	if got := ClassifyTemperature(&tWarn, policy); got != "Warning" {
		t.Fatalf("expected Warning, got %s", got)
	}
	if got := ClassifyTemperature(&tCrit, policy); got != "Critical" {
		t.Fatalf("expected Critical, got %s", got)
	}
}
