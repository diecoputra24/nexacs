package session

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestManagerLifecycle(t *testing.T) {
	mgr := NewManager(30)
	devID := uuid.New()
	sess := mgr.Create(devID, "ZTEG12345678", "InternetGatewayDevice.", "10.10.0.55")
	if sess == nil || sess.ID == uuid.Nil {
		t.Fatalf("expected non-nil active session")
	}

	got, ok := mgr.Get(sess.ID.String())
	if !ok || got.DeviceID != devID {
		t.Fatalf("expected Get to find created session")
	}

	byIP, ok := mgr.FindBySourceIP("10.10.0.55")
	if !ok || byIP.ID != sess.ID {
		t.Fatalf("expected FindBySourceIP to find active session")
	}

	mgr.Close(sess.ID.String())
	if _, ok := mgr.Get(sess.ID.String()); ok {
		t.Fatalf("expected closed session to be removed")
	}
}

func TestManagerExpiration(t *testing.T) {
	mgr := NewManager(1)
	sess := mgr.Create(uuid.New(), "EXPIRE01", "Device.", "10.10.0.99")
	mgr.mu.Lock()
	sess.LastActivity = time.Now().Add(-5 * time.Second)
	mgr.mu.Unlock()

	if _, ok := mgr.Get(sess.ID.String()); ok {
		t.Fatalf("expected expired session to fail Get")
	}
	if _, ok := mgr.FindBySourceIP("10.10.0.99"); ok {
		t.Fatalf("expected expired session to be evicted in FindBySourceIP")
	}
}
