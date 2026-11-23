package controller

import (
	"context"
	"errors"
	"log/slog"
	"time"
)

// MTPType defines supported TR-369 Message Transfer Protocols (Section 14).
type MTPType string

const (
	MTPMQTT      MTPType = "mqtt"
	MTPWebSocket MTPType = "websocket"
	MTPSTOMP     MTPType = "stomp"
	MTPCoAP      MTPType = "coap"
)

type USPOperation string

const (
	OpGet            USPOperation = "Get"
	OpSet            USPOperation = "Set"
	OpOperate        USPOperation = "Operate"
	OpAdd            USPOperation = "Add"
	OpDelete         USPOperation = "Delete"
	OpGetSupportedDM USPOperation = "GetSupportedDM"
	OpGetInstances   USPOperation = "GetInstances"
	OpNotify         USPOperation = "Notify"
)

type USPMessageEnvelope struct {
	MsgID          string
	FromEndpointID string
	ToEndpointID   string
	Operation      USPOperation
	Payload        []byte
	ExpiresAt      time.Time
}

// MTPTransport isolates USP transport encoding/delivery from the shared Device and Task services.
type MTPTransport interface {
	Type() MTPType
	Start(ctx context.Context) error
	SendRecord(ctx context.Context, targetEndpointID string, rawRecord []byte) error
	Close() error
}

type Controller struct {
	endpointID string
	log        *slog.Logger
	transports map[MTPType]MTPTransport
}

func New(endpointID string, log *slog.Logger) *Controller {
	return &Controller{
		endpointID: endpointID,
		log:        log,
		transports: make(map[MTPType]MTPTransport),
	}
}

func (c *Controller) RegisterTransport(t MTPTransport) {
	c.transports[t.Type()] = t
}

func (c *Controller) Dispatch(ctx context.Context, mtp MTPType, env USPMessageEnvelope) error {
	tr, ok := c.transports[mtp]
	if !ok {
		return errors.New("requested USP MTP transport is not registered")
	}
	c.log.Info("dispatching USP message",
		slog.String("controller_id", c.endpointID),
		slog.String("target_endpoint", env.ToEndpointID),
		slog.String("mtp", string(mtp)),
		slog.String("operation", string(env.Operation)),
		slog.String("msg_id", env.MsgID),
	)
	return tr.SendRecord(ctx, env.ToEndpointID, env.Payload)
}
