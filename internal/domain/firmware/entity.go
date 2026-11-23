package firmware

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrIncompatibleFirmware = errors.New("device does not match firmware compatibility criteria")

type File struct {
	ID               uuid.UUID  `json:"id"`
	TenantID         uuid.UUID  `json:"tenant_id"`
	Manufacturer     string     `json:"manufacturer"`
	ModelName        string     `json:"model_name"`
	ProductClass     string     `json:"product_class"`
	HardwareRevision string     `json:"hardware_revision"`
	Version          string     `json:"version"`
	FileName         string     `json:"file_name"`
	FileSize         int64      `json:"file_size"`
	ChecksumSHA256   string     `json:"checksum_sha256"`
	SignatureStatus  string     `json:"signature_status"`
	ReleaseNotes     string     `json:"release_notes"`
	StoragePath      string     `json:"-"`
	UploadedBy       *uuid.UUID `json:"uploaded_by,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// ValidateCompatibility enforces Section 7: never deploy firmware solely by manufacturer.
func (f *File) ValidateCompatibility(manufacturer, modelName, productClass, hardwareRevision string) error {
	if !strings.EqualFold(strings.TrimSpace(f.Manufacturer), strings.TrimSpace(manufacturer)) {
		return ErrIncompatibleFirmware
	}
	if !strings.EqualFold(strings.TrimSpace(f.ModelName), strings.TrimSpace(modelName)) {
		return ErrIncompatibleFirmware
	}
	if f.ProductClass != "" && !strings.EqualFold(strings.TrimSpace(f.ProductClass), strings.TrimSpace(productClass)) {
		return ErrIncompatibleFirmware
	}
	if f.HardwareRevision != "" && f.HardwareRevision != "*" &&
		!strings.EqualFold(strings.TrimSpace(f.HardwareRevision), strings.TrimSpace(hardwareRevision)) {
		return ErrIncompatibleFirmware
	}
	return nil
}
