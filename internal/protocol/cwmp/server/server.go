package server

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nexaacs/nexaacs/internal/domain/device"
	"github.com/nexaacs/nexaacs/internal/domain/fault"
	"github.com/nexaacs/nexaacs/internal/domain/task"
	"github.com/nexaacs/nexaacs/internal/platform/config"
	"github.com/nexaacs/nexaacs/internal/platform/logger"
	"github.com/nexaacs/nexaacs/internal/platform/security"
	"github.com/nexaacs/nexaacs/internal/protocol/cwmp/session"
	"github.com/nexaacs/nexaacs/internal/protocol/cwmp/soap"
)

const sessionCookieName = "NEXAACS_CWMP_SID"

type Server struct {
	cfg     *config.CWMPConfig
	log     *slog.Logger
	mgr     *session.Manager
	store   session.Store
	httpCli *http.Client
}

func New(cfg *config.CWMPConfig, log *slog.Logger, store session.Store) *Server {
	timeout := 10 * time.Second
	if cfg.ConnectionRequestTimeoutSeconds > 0 {
		timeout = time.Duration(cfg.ConnectionRequestTimeoutSeconds) * time.Second
	}
	return &Server{
		cfg:   cfg,
		log:   log,
		mgr:   session.NewManager(cfg.SessionTimeoutSeconds),
		store: store,
		httpCli: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				DisableKeepAlives: true,
			},
		},
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	maxBytes := s.cfg.MaxBodyBytes
	if maxBytes <= 0 {
		maxBytes = 2 * 1024 * 1024
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBytes))
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	sourceIP := extractClientIP(r)
	env, err := soap.ParseEnvelope(body)
	if err != nil {
		s.log.Warn("invalid CWMP SOAP payload", slog.String("source_ip", sourceIP), slog.String("error", err.Error()))
		http.Error(w, "Invalid SOAP XML", http.StatusBadRequest)
		return
	}

	// Empty POST from CPE means "I have no more requests; send your next RPC or close session (204)".
	if env == nil {
		s.handleEmptyPost(w, r)
		return
	}

	cwmpID := ""
	if env.Header.ID != nil {
		cwmpID = env.Header.ID.Value
	}

	switch {
	case env.Body.Inform != nil:
		s.handleInform(w, r, sourceIP, cwmpID, env.Body.Inform)
	case env.Body.TransferComplete != nil:
		s.handleTransferComplete(w, r, cwmpID, env.Body.TransferComplete)
	case env.Body.Fault != nil:
		s.handleRPCFault(w, r, env.Body.Fault)
	default:
		s.handleRPCResponse(w, r, env)
	}
}

func (s *Server) applyDynamicCWMPSettings(ctx context.Context) (sessionTimeoutSec int, crTimeoutSec int, allowAutoEnroll bool) {
	sessionTimeoutSec = s.cfg.SessionTimeoutSeconds
	if sessionTimeoutSec <= 0 {
		sessionTimeoutSec = 60
	}
	crTimeoutSec = s.cfg.ConnectionRequestTimeoutSeconds
	if crTimeoutSec <= 0 {
		crTimeoutSec = 10
	}
	allowAutoEnroll = s.cfg.AllowAutoEnroll

	if hook, ok := s.store.(interface {
		LoadCWMPProtocolSettings(ctx context.Context) (int, int, bool)
	}); ok {
		dynSess, dynCR, dynEnroll := hook.LoadCWMPProtocolSettings(ctx)
		if dynSess > 0 {
			sessionTimeoutSec = dynSess
		}
		if dynCR > 0 {
			crTimeoutSec = dynCR
		}
		allowAutoEnroll = dynEnroll
	}

	s.mgr.SetTimeoutSeconds(sessionTimeoutSec)
	return sessionTimeoutSec, crTimeoutSec, allowAutoEnroll
}

func (s *Server) handleInform(w http.ResponseWriter, r *http.Request, sourceIP, cwmpID string, inf *soap.Inform) {
	_, _, allowAutoEnroll := s.applyDynamicCWMPSettings(r.Context())
	if !allowAutoEnroll {
		if hook, ok := s.store.(interface {
			IsDeviceEnrolled(ctx context.Context, tenantID uuid.UUID, serial string) (bool, error)
		}); ok {
			enrolled, err := hook.IsDeviceEnrolled(r.Context(), uuid.MustParse("00000000-0000-0000-0000-000000000001"), inf.DeviceId.SerialNumber)
			if err == nil && !enrolled {
				s.log.Warn("CWMP Inform rejected: auto-enrollment disabled in settings",
					slog.String("serial", inf.DeviceId.SerialNumber),
					slog.String("source_ip", sourceIP),
				)
				http.Error(w, "Auto-enrollment is disabled for unknown CPE devices", http.StatusForbidden)
				return
			}
		}
	}

	dev, err := s.store.UpsertDeviceOnInform(r.Context(), sourceIP, inf)
	if err != nil {
		s.log.Error("failed to upsert device on Inform", slog.String("serial", inf.DeviceId.SerialNumber), slog.String("error", err.Error()))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	sess := s.mgr.Create(dev.ID, dev.SerialNumber, dev.DataModelRoot, sourceIP)
	if err := s.store.SaveInformParameters(r.Context(), dev.ID, sess.ID, inf.ParameterList); err != nil {
		s.log.Warn("partial failure saving Inform parameters", slog.String("device_id", dev.ID.String()), slog.String("error", err.Error()))
	}

	// Zero-touch auto-provisioning on 0 BOOTSTRAP / pending provisioning profile
	if hook, ok := s.store.(interface {
		ApplyProvisioningOnInform(ctx context.Context, dev *device.Device, events []soap.EventStruct) error
	}); ok {
		if err := hook.ApplyProvisioningOnInform(r.Context(), dev, inf.Event); err != nil {
			s.log.Warn("auto-provisioning evaluation failed", slog.String("serial", dev.SerialNumber), slog.String("error", err.Error()))
		}
	}

	// Automatic Summon All on first detection / bootstrap so all Virtual Parameters receive values
	if hook, ok := s.store.(interface {
		QueueAutoSummonOnFirstDetect(ctx context.Context, dev *device.Device, events []soap.EventStruct) (bool, error)
	}); ok {
		if queued, err := hook.QueueAutoSummonOnFirstDetect(r.Context(), dev, inf.Event); err != nil {
			s.log.Warn("auto summon evaluation failed", slog.String("serial", dev.SerialNumber), slog.String("error", err.Error()))
		} else if queued {
			s.log.Info("queued automatic summon all on device detection",
				slog.String("device_id", dev.ID.String()),
				slog.String("serial", dev.SerialNumber),
			)
		}
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sess.ID.String(),
		Path:     "/",
		HttpOnly: true,
	})

	s.log.Info("CWMP Inform accepted",
		slog.String("device_id", dev.ID.String()),
		slog.String("serial", dev.SerialNumber),
		slog.String("source_ip", sourceIP),
		slog.String("session_id", sess.ID.String()),
	)

	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(soap.BuildInformResponse(cwmpID, 1)))
}

func (s *Server) handleTransferComplete(w http.ResponseWriter, r *http.Request, cwmpID string, tc *soap.TransferComplete) {
	var faultCode, faultString string
	if tc.FaultStruct != nil {
		faultCode = strings.TrimSpace(tc.FaultStruct.FaultCode)
		faultString = strings.TrimSpace(tc.FaultStruct.FaultString)
	}
	if err := s.store.CompleteTransfer(r.Context(), tc.CommandKey, faultCode, faultString); err != nil {
		s.log.Warn("failed to record TransferComplete", slog.String("command_key", tc.CommandKey), slog.String("error", err.Error()))
	} else {
		s.log.Info("CWMP TransferComplete recorded",
			slog.String("command_key", tc.CommandKey),
			slog.String("fault_code", faultCode),
		)
	}
	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(soap.BuildTransferCompleteResponse(cwmpID)))
}

func (s *Server) handleEmptyPost(w http.ResponseWriter, r *http.Request) {
	sess := s.resolveSession(r)
	if sess == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	nextTask, err := s.store.DequeueNextTask(r.Context(), sess.DeviceID)
	if err != nil || nextTask == nil {
		s.mgr.Close(sess.ID.String())
		w.WriteHeader(http.StatusNoContent)
		return
	}

	rpcID := uuid.NewString()[:8]
	xmlBody, setParams, gpvPaths, buildErr := buildRPCForTask(rpcID, sess.DataModelRoot, nextTask)
	if buildErr != nil {
		_ = s.store.FailTaskAndCreateFault(r.Context(), nextTask.ID, sess.DeviceID, fault.CatUnsupportedParamOrRPC, "9000", buildErr.Error(), "")
		s.mgr.Close(sess.ID.String())
		w.WriteHeader(http.StatusNoContent)
		return
	}

	sess.InFlightRPC = &session.PendingRPC{
		TaskID:     nextTask.ID,
		TaskType:   nextTask.TaskType,
		CWMPID:     rpcID,
		PayloadXML: xmlBody,
		SetParams:  setParams,
		GPVPaths:   gpvPaths,
	}

	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(xmlBody))
}

func (s *Server) dispatchNextGPVBatch(w http.ResponseWriter, sess *session.ActiveSession) bool {
	if sess == nil || sess.InFlightRPC == nil || len(sess.InFlightRPC.PendingBatches) == 0 {
		return false
	}
	nextPaths := sess.InFlightRPC.PendingBatches[0]
	sess.InFlightRPC.PendingBatches = sess.InFlightRPC.PendingBatches[1:]
	rpcID := uuid.NewString()[:8]
	xmlBody := soap.BuildGetParameterValues(rpcID, nextPaths)
	sess.InFlightRPC.CWMPID = rpcID
	sess.InFlightRPC.GPVPaths = nextPaths
	sess.InFlightRPC.PayloadXML = xmlBody
	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(xmlBody))
	return true
}

func (s *Server) handleRPCResponse(w http.ResponseWriter, r *http.Request, env *soap.Envelope) {
	sess := s.resolveSession(r)
	if sess != nil && sess.InFlightRPC != nil {
		res := map[string]interface{}{"completed_at": time.Now().UTC()}
		if env.Body.GetParameterValuesResp != nil {
			_ = s.store.SaveInformParameters(r.Context(), sess.DeviceID, sess.ID, env.Body.GetParameterValuesResp.ParameterList)
			sess.InFlightRPC.CollectedCount += len(env.Body.GetParameterValuesResp.ParameterList)
			res["parameter_count"] = sess.InFlightRPC.CollectedCount
		}
		if env.Body.SetParameterValuesResp != nil {
			res["status"] = env.Body.SetParameterValuesResp.Status
			if len(sess.InFlightRPC.SetParams) > 0 {
				_ = s.store.SaveInformParameters(r.Context(), sess.DeviceID, sess.ID, sess.InFlightRPC.SetParams)
			}
		}
		if env.Body.AddObjectResponse != nil {
			res["instance_number"] = env.Body.AddObjectResponse.InstanceNumber
			res["status"] = env.Body.AddObjectResponse.Status
		}
		if env.Body.DeleteObjectResponse != nil {
			res["status"] = env.Body.DeleteObjectResponse.Status
		}
		if env.Body.GetParameterNamesResp != nil {
			res["names_count"] = len(env.Body.GetParameterNamesResp.ParameterList)
			names := make([]string, 0, len(env.Body.GetParameterNamesResp.ParameterList))
			for _, pi := range env.Body.GetParameterNamesResp.ParameterList {
				names = append(names, pi.Name)
			}
			res["names"] = names
		}
		if env.Body.GetRPCMethodsResponse != nil {
			res["methods"] = env.Body.GetRPCMethodsResponse.MethodList
		}
		if env.Body.DownloadResponse != nil {
			res["status"] = env.Body.DownloadResponse.Status
		}
		if len(sess.InFlightRPC.PendingBatches) > 0 {
			if s.dispatchNextGPVBatch(w, sess) {
				return
			}
		}
		if sess.InFlightRPC.SkippedPaths > 0 {
			res["skipped_invalid_paths"] = sess.InFlightRPC.SkippedPaths
		}
		_ = s.store.CompleteTask(r.Context(), sess.InFlightRPC.TaskID, res)
		sess.InFlightRPC = nil
	}
	s.handleEmptyPost(w, r)
}

func isGPVTask(t task.Type) bool {
	return t == task.TypeSummon || t == task.TypeRefreshParams || t == task.TypeGetParamValues
}

func (s *Server) handleRPCFault(w http.ResponseWriter, r *http.Request, sf *soap.SOAPFault) {
	sess := s.resolveSession(r)
	if sess != nil && sess.InFlightRPC != nil {
		code := sf.FaultCode
		msg := sf.FaultString
		if sf.Detail.Fault != nil {
			code = sf.Detail.Fault.FaultCode
			msg = sf.Detail.Fault.FaultString
		}

		// Adaptive 9005/9003 recovery: TR-069 rejects an entire GetParameterValues RPC if any single
		// path is missing on the CPE firmware. Binary-split failed batches inside the same session
		// so all valid parameters still succeed without failing the whole Summon.
		inFlight := sess.InFlightRPC
		isParamFault := code == "9005" || code == "9003" || strings.Contains(strings.ToLower(msg), "invalid parameter")
		if isGPVTask(inFlight.TaskType) && isParamFault && len(inFlight.GPVPaths) > 0 {
			if len(inFlight.GPVPaths) > 1 {
				mid := len(inFlight.GPVPaths) / 2
				left := append([]string(nil), inFlight.GPVPaths[:mid]...)
				right := append([]string(nil), inFlight.GPVPaths[mid:]...)
				inFlight.PendingBatches = append([][]string{left, right}, inFlight.PendingBatches...)
				if s.dispatchNextGPVBatch(w, sess) {
					return
				}
			} else {
				// Single unsupported leaf/branch: skip it cleanly instead of aborting valid paths.
				inFlight.SkippedPaths++
				badPath := inFlight.GPVPaths[0]
				if !inFlight.FallbackTried && inFlight.TaskType == task.TypeSummon && strings.Contains(badPath, "X_") {
					root := sess.DataModelRoot
					if root == "" {
						root = "InternetGatewayDevice."
					}
					if root == "InternetGatewayDevice." {
						inFlight.FallbackTried = true
						inFlight.PendingBatches = append(inFlight.PendingBatches, []string{"InternetGatewayDevice.WANDevice.1."})
					}
				}
				if !inFlight.WlanFallbackTried && isGPVTask(inFlight.TaskType) &&
					(strings.HasSuffix(badPath, ".WLANConfiguration.") || strings.HasSuffix(badPath, ".WiFi.")) {
					inFlight.WlanFallbackTried = true
					if strings.HasSuffix(badPath, ".WLANConfiguration.") {
						wlanLeaves := []string{
							"Enable", "Status", "SSID", "BeaconType", "BasicEncryptionModes",
							"WPAEncryptionModes", "IEEE11iEncryptionModes", "Channel",
							"ChannelsInUse", "PossibleChannels", "AutoChannelEnable",
							"Standard", "TotalAssociations",
							"PreSharedKey.1.PreSharedKey", "PreSharedKey.1.KeyPassphrase", "KeyPassphrase",
						}
						for idx := 1; idx <= 8; idx++ {
							batch := make([]string, 0, len(wlanLeaves))
							for _, leaf := range wlanLeaves {
								batch = append(batch, fmt.Sprintf("%s%d.%s", badPath, idx, leaf))
							}
							inFlight.PendingBatches = append(inFlight.PendingBatches, batch)
						}
					}
				}
				if s.dispatchNextGPVBatch(w, sess) {
					return
				}
				if inFlight.CollectedCount > 0 {
					_ = s.store.CompleteTask(r.Context(), inFlight.TaskID, map[string]interface{}{
						"completed_at":          time.Now().UTC(),
						"parameter_count":       inFlight.CollectedCount,
						"skipped_invalid_paths": inFlight.SkippedPaths,
					})
					sess.InFlightRPC = nil
					s.handleEmptyPost(w, r)
					return
				}
			}
		}

		cat := fault.CatParameterReadFailed
		switch sess.InFlightRPC.TaskType {
		case task.TypeSetParamValues, task.TypeAddObject, task.TypeDeleteObject:
			cat = fault.CatParameterWriteFailed
		case task.TypeReboot:
			cat = fault.CatRebootFailed
		case task.TypeFactoryReset:
			cat = fault.CatFactoryResetFailed
		case task.TypeDownloadFirmware:
			cat = fault.CatFirmwareFailed
		}
		_ = s.store.FailTaskAndCreateFault(
			r.Context(),
			sess.InFlightRPC.TaskID,
			sess.DeviceID,
			cat,
			code,
			logger.SanitizeMessage(msg),
			"CWMP SOAP Fault received during active session",
		)
		sess.InFlightRPC = nil
	}
	s.handleEmptyPost(w, r)
}

// CRCredential holds a username/password candidate for HTTP Connection Request authentication.
type CRCredential struct {
	Username string
	Password string
}

// TriggerConnectionRequest sends an HTTP GET Connection Request to the CPE with Digest/Basic auth and SSRF validation.
func (s *Server) TriggerConnectionRequest(ctx context.Context, rawURL, username, password string) error {
	if username == "" {
		_, err := s.TriggerConnectionRequestWithFallbacks(ctx, rawURL)
		return err
	}
	_, err := s.TriggerConnectionRequestWithFallbacks(ctx, rawURL, CRCredential{Username: username, Password: password})
	return err
}

// TriggerConnectionRequestWithFallbacks sends an HTTP GET Connection Request to the CPE, trying
// the provided Digest/Basic credential candidates sequentially if the CPE replies 401 Unauthorized.
// It returns the credential that succeeded (if authentication was required).
func (s *Server) TriggerConnectionRequestWithFallbacks(ctx context.Context, rawURL string, candidates ...CRCredential) (CRCredential, error) {
	parsed, err := security.ValidateConnectionRequestURL(rawURL, s.cfg.BlockPrivateSSRFTargets)
	if err != nil {
		return CRCredential{}, err
	}
	_, crTimeoutSec, _ := s.applyDynamicCWMPSettings(ctx)
	cli := s.httpCli
	if crTimeoutSec > 0 && time.Duration(crTimeoutSec)*time.Second != s.httpCli.Timeout {
		cli = &http.Client{
			Timeout:   time.Duration(crTimeoutSec) * time.Second,
			Transport: s.httpCli.Transport,
		}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return CRCredential{}, err
	}
	resp, err := cli.Do(req)
	if err != nil {
		return CRCredential{}, fmt.Errorf("connection request failed: %w", err)
	}
	_ = resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		wwwAuth := resp.Header.Get("WWW-Authenticate")
		seen := make(map[string]struct{}, len(candidates))
		for _, cred := range candidates {
			if strings.TrimSpace(cred.Username) == "" {
				continue
			}
			key := cred.Username + "\x00" + cred.Password
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}

			req2, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
			if err != nil {
				return CRCredential{}, err
			}
			if strings.HasPrefix(strings.ToLower(strings.TrimSpace(wwwAuth)), "digest ") {
				digestHdr, derr := security.DigestAuthHeader(http.MethodGet, parsed.RequestURI(), cred.Username, cred.Password, wwwAuth)
				if derr == nil {
					req2.Header.Set("Authorization", digestHdr)
				} else {
					req2.SetBasicAuth(cred.Username, cred.Password)
				}
			} else {
				req2.SetBasicAuth(cred.Username, cred.Password)
			}
			resp2, err := cli.Do(req2)
			if err != nil {
				return CRCredential{}, fmt.Errorf("connection request auth retry failed: %w", err)
			}
			nextAuth := resp2.Header.Get("WWW-Authenticate")
			_ = resp2.Body.Close()
			if resp2.StatusCode < 400 {
				return cred, nil
			}
			if resp2.StatusCode != http.StatusUnauthorized {
				return CRCredential{}, fmt.Errorf("connection request returned HTTP %d", resp2.StatusCode)
			}
			if nextAuth != "" {
				wwwAuth = nextAuth
			}
		}
		return CRCredential{}, fmt.Errorf("connection request returned HTTP 401")
	}

	if resp.StatusCode >= 400 {
		return CRCredential{}, fmt.Errorf("connection request returned HTTP %d", resp.StatusCode)
	}
	return CRCredential{}, nil
}

func (s *Server) resolveSession(r *http.Request) *session.ActiveSession {
	s.applyDynamicCWMPSettings(r.Context())
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		if sess, ok := s.mgr.Get(cookie.Value); ok {
			return sess
		}
	}
	// Fallback by client IP when CPE omits session cookies across SOAP messages
	if sess, ok := s.mgr.FindBySourceIP(extractClientIP(r)); ok {
		return sess
	}
	return nil
}

func buildRPCForTask(rpcID, dataModelRoot string, t *task.Task) (string, []soap.ParameterValueStruct, []string, error) {
	if dataModelRoot == "" {
		dataModelRoot = "InternetGatewayDevice."
	}
	switch t.TaskType {
	case task.TypeReboot:
		return soap.BuildReboot(rpcID, t.ID.String()), nil, nil, nil
	case task.TypeFactoryReset:
		return soap.BuildFactoryReset(rpcID), nil, nil, nil
	case task.TypeGetParamValues, task.TypeSummon, task.TypeRefreshParams:
		paths := extractStringSlice(t.Payload["paths"])
		if len(paths) == 0 {
			paths = []string{dataModelRoot + "DeviceInfo.", dataModelRoot + "ManagementServer."}
		}
		return soap.BuildGetParameterValues(rpcID, paths), nil, paths, nil
	case task.TypeGetParamNames:
		path, _ := t.Payload["path"].(string)
		if path == "" {
			path = dataModelRoot
		}
		nextLevel, _ := t.Payload["next_level"].(bool)
		return soap.BuildGetParameterNames(rpcID, path, nextLevel), nil, nil, nil
	case task.TypeSetParamValues:
		rawList := extractSetParams(t.Payload["parameters"])
		if len(rawList) == 0 {
			// Also support single { path, value, value_type } payload from REST /parameters/set
			if path, _ := t.Payload["path"].(string); path != "" {
				valStr, _ := t.Payload["value"].(string)
				typ, _ := t.Payload["value_type"].(string)
				rawList = []soap.SetParamInput{{Name: path, Type: typ, Value: valStr}}
			}
		}
		if len(rawList) == 0 {
			return "", nil, nil, fmt.Errorf("missing parameters for SetParameterValues")
		}
		echoed := make([]soap.ParameterValueStruct, 0, len(rawList))
		for _, p := range rawList {
			echoed = append(echoed, soap.ParameterValueStruct{
				Name:  p.Name,
				Value: soap.ParameterValue{Type: p.Type, Value: p.Value},
			})
		}
		return soap.BuildSetParameterValues(rpcID, t.ID.String(), rawList), echoed, nil, nil
	case task.TypeAddObject:
		objName, _ := t.Payload["object_name"].(string)
		if objName == "" {
			return "", nil, nil, fmt.Errorf("missing object_name for AddObject")
		}
		return soap.BuildAddObject(rpcID, objName, t.ID.String()), nil, nil, nil
	case task.TypeDeleteObject:
		objName, _ := t.Payload["object_name"].(string)
		if objName == "" {
			return "", nil, nil, fmt.Errorf("missing object_name for DeleteObject")
		}
		return soap.BuildDeleteObject(rpcID, objName, t.ID.String()), nil, nil, nil
	case task.TypeDownloadFirmware:
		urlStr, _ := t.Payload["url"].(string)
		if urlStr == "" {
			return "", nil, nil, fmt.Errorf("missing url for Download RPC")
		}
		fileName, _ := t.Payload["file_name"].(string)
		fileType, _ := t.Payload["file_type"].(string)
		if fileType == "" {
			fileType = "1 Firmware Upgrade Image"
		}
		user, _ := t.Payload["username"].(string)
		pass, _ := t.Payload["password"].(string)
		var fileSize int64
		switch v := t.Payload["file_size"].(type) {
		case float64:
			fileSize = int64(v)
		case int64:
			fileSize = v
		}
		return soap.BuildDownload(rpcID, t.ID.String(), fileType, urlStr, user, pass, fileSize, fileName), nil, nil, nil
	default:
		return "", nil, nil, fmt.Errorf("unsupported CWMP task type: %s", t.TaskType)
	}
}

func extractStringSlice(raw interface{}) []string {
	switch v := raw.(type) {
	case []string:
		return v
	case []interface{}:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
		return out
	default:
		return nil
	}
}

func extractSetParams(raw interface{}) []soap.SetParamInput {
	switch v := raw.(type) {
	case []soap.SetParamInput:
		return v
	case []interface{}:
		out := make([]soap.SetParamInput, 0, len(v))
		for _, item := range v {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			name, _ := m["name"].(string)
			if name == "" {
				name, _ = m["path"].(string)
			}
			if name == "" {
				continue
			}
			typ, _ := m["type"].(string)
			val := fmt.Sprintf("%v", m["value"])
			out = append(out, soap.SetParamInput{Name: name, Type: typ, Value: val})
		}
		return out
	default:
		return nil
	}
}

func extractClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
