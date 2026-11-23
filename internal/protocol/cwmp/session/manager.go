package session

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nexaacs/nexaacs/internal/domain/device"
	"github.com/nexaacs/nexaacs/internal/domain/fault"
	"github.com/nexaacs/nexaacs/internal/domain/task"
	"github.com/nexaacs/nexaacs/internal/protocol/cwmp/soap"
)

type PendingRPC struct {
	TaskID            uuid.UUID
	TaskType          task.Type
	CWMPID            string
	PayloadXML        string
	SetParams         []soap.ParameterValueStruct
	GPVPaths          []string
	PendingBatches    [][]string
	CollectedCount    int
	SkippedPaths      int
	FallbackTried     bool
	WlanFallbackTried bool
}

type ActiveSession struct {
	ID            uuid.UUID
	DeviceID      uuid.UUID
	SerialNumber  string
	DataModelRoot string
	SourceIP      string
	HoldRequests  bool
	InFlightRPC   *PendingRPC
	StartedAt     time.Time
	LastActivity  time.Time
}

type Store interface {
	UpsertDeviceOnInform(ctx context.Context, sourceIP string, inform *soap.Inform) (*device.Device, error)
	SaveInformParameters(ctx context.Context, deviceID uuid.UUID, sessionID uuid.UUID, params []soap.ParameterValueStruct) error
	DequeueNextTask(ctx context.Context, deviceID uuid.UUID) (*task.Task, error)
	CompleteTask(ctx context.Context, taskID uuid.UUID, result map[string]interface{}) error
	FailTaskAndCreateFault(ctx context.Context, taskID uuid.UUID, deviceID uuid.UUID, cat fault.Category, code, msg, logs string) error
	CompleteTransfer(ctx context.Context, commandKey, faultCode, faultString string) error
}

type Manager struct {
	mu       sync.Mutex
	sessions map[string]*ActiveSession
	timeout  time.Duration
}

func NewManager(timeoutSeconds int) *Manager {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 60
	}
	return &Manager{
		sessions: make(map[string]*ActiveSession),
		timeout:  time.Duration(timeoutSeconds) * time.Second,
	}
}

func (m *Manager) SetTimeoutSeconds(timeoutSeconds int) {
	if timeoutSeconds <= 0 {
		return
	}
	next := time.Duration(timeoutSeconds) * time.Second
	m.mu.Lock()
	if m.timeout != next {
		m.timeout = next
	}
	m.mu.Unlock()
}

func (m *Manager) Create(deviceID uuid.UUID, serial, dataModelRoot, sourceIP string) *ActiveSession {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now().UTC()
	sess := &ActiveSession{
		ID:            uuid.New(),
		DeviceID:      deviceID,
		SerialNumber:  serial,
		DataModelRoot: dataModelRoot,
		SourceIP:      sourceIP,
		StartedAt:     now,
		LastActivity:  now,
	}
	m.sessions[sess.ID.String()] = sess
	return sess
}

func (m *Manager) FindBySourceIP(sourceIP string) (*ActiveSession, bool) {
	if sourceIP == "" {
		return nil, false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	var latest *ActiveSession
	for k, s := range m.sessions {
		if time.Since(s.LastActivity) > m.timeout {
			delete(m.sessions, k)
			continue
		}
		if s.SourceIP == sourceIP {
			if latest == nil || s.LastActivity.After(latest.LastActivity) {
				latest = s
			}
		}
	}
	if latest == nil {
		return nil, false
	}
	latest.LastActivity = time.Now().UTC()
	return latest, true
}

func (m *Manager) Get(sessionID string) (*ActiveSession, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[sessionID]
	if !ok {
		return nil, false
	}
	if time.Since(sess.LastActivity) > m.timeout {
		delete(m.sessions, sessionID)
		return nil, false
	}
	sess.LastActivity = time.Now().UTC()
	return sess, true
}

func (m *Manager) Close(sessionID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, sessionID)
}
