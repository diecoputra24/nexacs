package task

import (
	"math"
	"time"

	"github.com/google/uuid"
)

type State string

const (
	StatePending          State = "pending"
	StateQueued           State = "queued"
	StateWaitingForDevice State = "waiting_for_device"
	StateExecuting        State = "executing"
	StateCompleted        State = "completed"
	StateFailed           State = "failed"
	StateTimeout          State = "timeout"
	StateCancelled        State = "cancelled"
)

type Type string

const (
	TypeSummon           Type = "summon"
	TypeRefreshParams    Type = "refresh_params"
	TypeGetParamValues   Type = "get_parameter_values"
	TypeGetParamNames    Type = "get_parameter_names"
	TypeSetParamValues   Type = "set_parameter_values"
	TypeAddObject        Type = "add_object"
	TypeDeleteObject     Type = "delete_object"
	TypeReboot           Type = "reboot"
	TypeFactoryReset     Type = "factory_reset"
	TypeDownloadFirmware Type = "download_firmware"
)

type SummonGroup string

const (
	GroupDeviceInfo     SummonGroup = "device_info"
	GroupDeviceHealth   SummonGroup = "device_health"
	GroupWAN            SummonGroup = "wan"
	GroupWiFi           SummonGroup = "wifi"
	GroupConnectedHosts SummonGroup = "connected_hosts"
	GroupParameters     SummonGroup = "parameters"
)

type SummonJob struct {
	ID              uuid.UUID     `json:"id"`
	TenantID        uuid.UUID     `json:"tenant_id"`
	DeviceID        uuid.UUID     `json:"device_id"`
	RequestedBy     *uuid.UUID    `json:"requested_by,omitempty"`
	Protocol        string        `json:"protocol"`
	Status          State         `json:"status"`
	RequestedGroups []SummonGroup `json:"requested_groups"`
	ProgressPercent int           `json:"progress_percent"`
	SummaryMessage  string        `json:"summary_message"`
	StartedAt       *time.Time    `json:"started_at,omitempty"`
	CompletedAt     *time.Time    `json:"completed_at,omitempty"`
	CreatedAt       time.Time     `json:"created_at"`
}

type Task struct {
	ID             uuid.UUID              `json:"id"`
	TenantID       uuid.UUID              `json:"tenant_id"`
	DeviceID       uuid.UUID              `json:"device_id"`
	SummonJobID    *uuid.UUID             `json:"summon_job_id,omitempty"`
	RequestedBy    *uuid.UUID             `json:"requested_by,omitempty"`
	Protocol       string                 `json:"protocol"`
	TaskType       Type                   `json:"task_type"`
	Status         State                  `json:"status"`
	IdempotencyKey string                 `json:"idempotency_key,omitempty"`
	CorrelationID  string                 `json:"correlation_id"`
	Payload        map[string]interface{} `json:"payload"`
	Result         map[string]interface{} `json:"result"`
	RetryCount     int                    `json:"retry_count"`
	MaxRetries     int                    `json:"max_retries"`
	LeaseOwner     string                 `json:"lease_owner,omitempty"`
	LeaseExpiresAt *time.Time             `json:"lease_expires_at,omitempty"`
	ScheduledAt    time.Time              `json:"scheduled_at"`
	StartedAt      *time.Time             `json:"started_at,omitempty"`
	CompletedAt    *time.Time             `json:"completed_at,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
}

// CanAutoRetry enforces Section 6.4: destructive operations like FactoryReset must never auto-retry.
func (t *Task) CanAutoRetry() bool {
	if t.TaskType == TypeFactoryReset {
		return false
	}
	return t.RetryCount < t.MaxRetries
}

// NextBackoff calculates bounded exponential backoff for transient retryable task errors.
func NextBackoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	seconds := math.Min(300, math.Pow(2, float64(attempt))*5)
	return time.Duration(seconds) * time.Second
}
