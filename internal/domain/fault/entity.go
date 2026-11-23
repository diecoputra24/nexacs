package fault

import (
	"time"

	"github.com/google/uuid"
)

type Category string

const (
	CatSummonFailed            Category = "summon_failed"
	CatInformSessionFailure    Category = "inform_session_failure"
	CatConnectionRequestFailed Category = "connection_request_failed"
	CatParameterReadFailed     Category = "parameter_read_failed"
	CatParameterWriteFailed    Category = "parameter_write_failed"
	CatRebootFailed            Category = "reboot_failed"
	CatFactoryResetFailed      Category = "factory_reset_failed"
	CatFirmwareFailed          Category = "firmware_failed"
	CatUSPTransportFailure     Category = "usp_transport_failure"
	CatTimeout                 Category = "timeout"
	CatAuthFailure             Category = "auth_failure"
	CatDeviceNotReachable      Category = "device_not_reachable"
	CatUnsupportedParamOrRPC   Category = "unsupported_parameter_rpc"
)

type Status string

const (
	StatusOpen         Status = "open"
	StatusAcknowledged Status = "acknowledged"
	StatusResolved     Status = "resolved"
	StatusIgnored      Status = "ignored"
)

type Fault struct {
	ID               uuid.UUID  `json:"id"`
	TenantID         uuid.UUID  `json:"tenant_id"`
	DeviceID         uuid.UUID  `json:"device_id"`
	TaskID           *uuid.UUID `json:"task_id,omitempty"`
	SummonJobID      *uuid.UUID `json:"summon_job_id,omitempty"`
	Protocol         string     `json:"protocol"`
	Category         Category   `json:"category"`
	Operation        string     `json:"operation"`
	CorrelationID    string     `json:"correlation_id"`
	FailedParameters []string   `json:"failed_parameters"`
	ErrorCode        string     `json:"error_code"`
	Message          string     `json:"message"`
	SanitizedLogs    string     `json:"sanitized_logs"`
	Status           Status     `json:"status"`
	RetryCount       int        `json:"retry_count"`
	LastAttemptAt    *time.Time `json:"last_attempt_at,omitempty"`
	AcknowledgedBy   *uuid.UUID `json:"acknowledged_by,omitempty"`
	AcknowledgedAt   *time.Time `json:"acknowledged_at,omitempty"`
	ResolvedBy       *uuid.UUID `json:"resolved_by,omitempty"`
	ResolvedAt       *time.Time `json:"resolved_at,omitempty"`
	ResolutionNote   string     `json:"resolution_note,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// IsSafeToRetry blocks automatic or one-click unsafe retries on destructive operations (Section 6.3 & 6.4).
func (f *Fault) IsSafeToRetry() bool {
	return f.Category != CatFactoryResetFailed && f.Status != StatusResolved
}
