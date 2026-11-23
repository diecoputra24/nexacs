package postgres

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nexaacs/nexaacs/internal/domain/device"
	"github.com/nexaacs/nexaacs/internal/platform/database"
	"github.com/nexaacs/nexaacs/internal/protocol/cwmp/soap"
)

func openIntegrationStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("NEXAACS_DB_DSN")
	if dsn == "" {
		t.Skip("NEXAACS_DB_DSN not configured for integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := database.Connect(ctx, dsn, 5, 1)
	if err != nil {
		t.Skipf("PostgreSQL unavailable for integration test: %v", err)
	}
	if err := database.RunMigrations(ctx, pool); err != nil {
		pool.Close()
		t.Fatalf("RunMigrations failed: %v", err)
	}
	t.Cleanup(pool.Close)
	return NewStore(pool)
}

func TestPostgresIntegrationLifecycle(t *testing.T) {
	store := openIntegrationStore(t)
	ctx := context.Background()

	serial := "ITEST" + time.Now().UTC().Format("150405.000")
	inf := &soap.Inform{
		DeviceId: soap.DeviceID{
			Manufacturer: "ZTE",
			OUI:          "001122",
			ProductClass: "F670L",
			SerialNumber: serial,
		},
		Event: []soap.EventStruct{{EventCode: "0 BOOTSTRAP"}},
		ParameterList: []soap.ParameterValueStruct{
			{Name: "InternetGatewayDevice.DeviceInfo.UpTime", Value: soap.ParameterValue{Type: "xsd:unsignedInt", Value: "1200"}},
			{Name: "InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower", Value: soap.ParameterValue{Type: "xsd:string", Value: "-19.4"}},
		},
	}

	dev, err := store.UpsertDeviceOnInform(ctx, "10.99.0.10", inf)
	if err != nil {
		t.Fatalf("UpsertDeviceOnInform failed: %v", err)
	}
	t.Cleanup(func() {
		_, _ = store.pool.Exec(context.Background(), `DELETE FROM devices WHERE id = $1`, dev.ID)
	})

	if err := store.SaveInformParameters(ctx, dev.ID, uuid.New(), inf.ParameterList); err != nil {
		t.Fatalf("SaveInformParameters failed: %v", err)
	}
	var histCount int
	if err := store.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM parameter_history WHERE device_id = $1`, dev.ID).Scan(&histCount); err != nil || histCount < 1 {
		t.Fatalf("expected parameter_history sample recorded, got count=%d err=%v", histCount, err)
	}

	// Verify filtered search + deviceGroup filter + overview stats
	list, total, err := store.ListDevicesFiltered(ctx, DefaultTenantID, DeviceListQuery{
		Limit:              10,
		Offset:             0,
		Search:             serial,
		DeviceGroup:        "Default-ACS",
		OnlineThresholdSec: 1800,
		Thresholds:         device.DefaultThresholdPolicy(),
	})
	if err != nil {
		t.Fatalf("ListDevicesFiltered failed: %v", err)
	}
	if total < 1 || len(list) == 0 || list[0].SerialNumber != serial {
		t.Fatalf("expected ListDevicesFiltered to return %s (total=%d)", serial, total)
	}

	stats, err := store.GetOverviewStats(ctx, DefaultTenantID, 1800, device.DefaultThresholdPolicy(), OverviewFilter{
		DeviceGroup: "Default-ACS",
	})
	if err != nil || stats.Total < 1 {
		t.Fatalf("GetOverviewStats failed: err=%v total=%v", err, stats)
	}

	// Queue auto-summon -> stale timeout reaper -> cleanup
	queued, err := store.QueueAutoSummonOnFirstDetect(ctx, dev, inf.Event)
	if err != nil {
		t.Fatalf("QueueAutoSummonOnFirstDetect failed: %v", err)
	}
	if !queued {
		t.Fatalf("expected auto-summon to queue on 0 BOOTSTRAP")
	}

	// Age the newly queued task back 10m and verify Reap + Prune
	_, _ = store.pool.Exec(ctx, `UPDATE tasks SET created_at = NOW() - INTERVAL '10 minutes', scheduled_at = NOW() - INTERVAL '10 minutes' WHERE device_id = $1`, dev.ID)
	if reaped := store.ReapStaleSummonTasks(ctx, DefaultTenantID, 5*time.Minute); reaped < 1 {
		t.Fatalf("expected ReapStaleSummonTasks to reap at least 1 stale task")
	}
	_, _ = store.pool.Exec(ctx, `UPDATE tasks SET completed_at = NOW() - INTERVAL '2 hours' WHERE device_id = $1`, dev.ID)
	if pruned := store.PruneFinishedSummonTasks(ctx, DefaultTenantID, time.Hour); pruned < 1 {
		t.Fatalf("expected PruneFinishedSummonTasks to delete at least 1 old summon task")
	}
	_, _ = store.pool.Exec(ctx, `
		INSERT INTO faults (tenant_id, device_id, protocol, category, operation, message, created_at)
		VALUES ($1, $2, 'TR-069', 'parameter_read_failed', 'Summon', 'old test fault', NOW() - INTERVAL '25 hours')
	`, DefaultTenantID, dev.ID)
	if prunedFaults := store.PruneOldFaults(ctx, DefaultTenantID, 24*time.Hour); prunedFaults < 1 {
		t.Fatalf("expected PruneOldFaults to delete at least 1 old fault")
	}
}
