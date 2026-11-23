package websocket

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type Event struct {
	Type      string                 `json:"type"`
	TenantID  string                 `json:"tenant_id"`
	DeviceID  string                 `json:"device_id,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
}

type Hub struct {
	log            *slog.Logger
	allowAnyOrigin bool
	originPatterns []string
	mu             sync.RWMutex
	clients        map[*websocket.Conn]struct{}
}

func NewHub(log *slog.Logger, allowedOrigins ...[]string) *Hub {
	var patterns []string
	allowAny := false
	if len(allowedOrigins) > 0 {
		for _, o := range allowedOrigins[0] {
			trimmed := strings.TrimSpace(o)
			if trimmed == "" {
				continue
			}
			if trimmed == "*" {
				allowAny = true
				continue
			}
			if u, err := url.Parse(trimmed); err == nil && u.Host != "" {
				patterns = append(patterns, u.Host)
			} else {
				patterns = append(patterns, trimmed)
			}
		}
	}
	return &Hub{
		log:            log,
		allowAnyOrigin: allowAny,
		originPatterns: patterns,
		clients:        make(map[*websocket.Conn]struct{}),
	}
}

func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	opts := &websocket.AcceptOptions{
		InsecureSkipVerify: h.allowAnyOrigin,
		OriginPatterns:     h.originPatterns,
	}
	conn, err := websocket.Accept(w, r, opts)
	if err != nil {
		h.log.Warn("websocket accept failed", slog.String("error", err.Error()))
		return
	}

	h.mu.Lock()
	h.clients[conn] = struct{}{}
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		delete(h.clients, conn)
		h.mu.Unlock()
		_ = conn.Close(websocket.StatusNormalClosure, "closed")
	}()

	ctx := r.Context()
	for {
		if _, _, err := conn.Read(ctx); err != nil {
			return
		}
	}
}

// Broadcast publishes sanitized real-time events (never includes secrets).
func (h *Hub) Broadcast(ev Event) {
	if ev.Timestamp.IsZero() {
		ev.Timestamp = time.Now().UTC()
	}
	payload, err := json.Marshal(ev)
	if err != nil {
		return
	}

	h.mu.RLock()
	conns := make([]*websocket.Conn, 0, len(h.clients))
	for c := range h.clients {
		conns = append(conns, c)
	}
	h.mu.RUnlock()

	for _, c := range conns {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		if err := c.Write(ctx, websocket.MessageText, payload); err != nil {
			h.mu.Lock()
			delete(h.clients, c)
			h.mu.Unlock()
			_ = c.Close(websocket.StatusGoingAway, "write timeout")
		}
		cancel()
	}
}
