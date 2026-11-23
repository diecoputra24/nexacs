package server

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/nexaacs/nexaacs/internal/domain/device"
	"github.com/nexaacs/nexaacs/internal/domain/fault"
	"github.com/nexaacs/nexaacs/internal/domain/task"
	"github.com/nexaacs/nexaacs/internal/platform/config"
	"github.com/nexaacs/nexaacs/internal/protocol/cwmp/soap"
)

type mockCWMPStore struct {
	dev              *device.Device
	queuedTask       *task.Task
	savedParams      []soap.ParameterValueStruct
	completedTaskID  uuid.UUID
	completedResult  map[string]interface{}
	transferKey      string
	transferFault    string
	transferFaultStr string
}

func (m *mockCWMPStore) UpsertDeviceOnInform(_ context.Context, sourceIP string, inform *soap.Inform) (*device.Device, error) {
	if m.dev == nil {
		m.dev = &device.Device{
			ID:            uuid.New(),
			SerialNumber:  inform.DeviceId.SerialNumber,
			DataModelRoot: "InternetGatewayDevice.",
			TRSourceIP:    sourceIP,
		}
	}
	return m.dev, nil
}

func (m *mockCWMPStore) SaveInformParameters(_ context.Context, _ uuid.UUID, _ uuid.UUID, params []soap.ParameterValueStruct) error {
	m.savedParams = append(m.savedParams, params...)
	return nil
}

func (m *mockCWMPStore) DequeueNextTask(_ context.Context, _ uuid.UUID) (*task.Task, error) {
	t := m.queuedTask
	m.queuedTask = nil
	return t, nil
}

func (m *mockCWMPStore) CompleteTask(_ context.Context, taskID uuid.UUID, result map[string]interface{}) error {
	m.completedTaskID = taskID
	m.completedResult = result
	return nil
}

func (m *mockCWMPStore) FailTaskAndCreateFault(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ fault.Category, _, _, _ string) error {
	return nil
}

func (m *mockCWMPStore) CompleteTransfer(_ context.Context, commandKey, faultCode, faultString string) error {
	m.transferKey = commandKey
	m.transferFault = faultCode
	m.transferFaultStr = faultString
	return nil
}

func TestCWMPInformTaskAndTransferComplete(t *testing.T) {
	devID := uuid.New()
	taskID := uuid.New()
	store := &mockCWMPStore{
		dev: &device.Device{
			ID:            devID,
			SerialNumber:  "ZTEGC1234567",
			DataModelRoot: "InternetGatewayDevice.",
		},
		queuedTask: &task.Task{
			ID:       taskID,
			DeviceID: devID,
			TaskType: task.TypeSummon,
			Payload:  map[string]interface{}{"paths": []interface{}{"InternetGatewayDevice.DeviceInfo.UpTime"}},
		},
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := New(&config.CWMPConfig{SessionTimeoutSeconds: 60, MaxBodyBytes: 1024 * 1024, AllowAutoEnroll: true}, log, store)

	// 1. Inform
	informXML := `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Header><cwmp:ID soapenv:mustUnderstand="1">1</cwmp:ID></soapenv:Header>
  <soapenv:Body><cwmp:Inform>
    <DeviceId><Manufacturer>ZTE</Manufacturer><OUI>001122</OUI><ProductClass>F670L</ProductClass><SerialNumber>ZTEGC1234567</SerialNumber></DeviceId>
    <Event><EventStruct><EventCode>2 PERIODIC</EventCode><CommandKey></CommandKey></EventStruct></Event>
    <MaxEnvelopes>1</MaxEnvelopes><CurrentTime>2026-11-18T10:00:00Z</CurrentTime><RetryCount>0</RetryCount>
    <ParameterList><ParameterValueStruct><Name>InternetGatewayDevice.DeviceInfo.SoftwareVersion</Name><Value>V1.0</Value></ParameterValueStruct></ParameterList>
  </cwmp:Inform></soapenv:Body>
</soapenv:Envelope>`

	req := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(informXML))
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "InformResponse") {
		t.Fatalf("expected InformResponse 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
	cookies := rec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatalf("expected session cookie after Inform")
	}

	// 2. Empty POST -> should dequeue Summon GetParameterValues
	req2 := httptest.NewRequest(http.MethodPost, "/cwmp", nil)
	req2.AddCookie(cookies[0])
	rec2 := httptest.NewRecorder()
	srv.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK || !strings.Contains(rec2.Body.String(), "GetParameterValues") {
		t.Fatalf("expected GetParameterValues RPC, got %d: %s", rec2.Code, rec2.Body.String())
	}

	// 3. GetParameterValuesResponse -> completes task and returns 204 No Content
	gpvXML := `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Header><cwmp:ID soapenv:mustUnderstand="1">1</cwmp:ID></soapenv:Header>
  <soapenv:Body><cwmp:GetParameterValuesResponse>
    <ParameterList><ParameterValueStruct><Name>InternetGatewayDevice.DeviceInfo.UpTime</Name><Value>12345</Value></ParameterValueStruct></ParameterList>
  </cwmp:GetParameterValuesResponse></soapenv:Body>
</soapenv:Envelope>`
	req3 := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(gpvXML))
	req3.AddCookie(cookies[0])
	rec3 := httptest.NewRecorder()
	srv.ServeHTTP(rec3, req3)
	if rec3.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content when queue empty, got %d", rec3.Code)
	}
	if store.completedTaskID != taskID {
		t.Fatalf("expected task %s to be marked completed, got %s", taskID, store.completedTaskID)
	}

	// 4. TransferComplete
	tcXML := `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Header><cwmp:ID soapenv:mustUnderstand="1">tc1</cwmp:ID></soapenv:Header>
  <soapenv:Body><cwmp:TransferComplete><CommandKey>` + taskID.String() + `</CommandKey><FaultStruct><FaultCode>0</FaultCode><FaultString></FaultString></FaultStruct></cwmp:TransferComplete></soapenv:Body>
</soapenv:Envelope>`
	req4 := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(tcXML))
	rec4 := httptest.NewRecorder()
	srv.ServeHTTP(rec4, req4)
	if rec4.Code != http.StatusOK || !strings.Contains(rec4.Body.String(), "TransferCompleteResponse") {
		t.Fatalf("expected TransferCompleteResponse 200 OK, got %d", rec4.Code)
	}
	if store.transferKey != taskID.String() {
		t.Fatalf("expected CompleteTransfer commandKey %s, got %s", taskID, store.transferKey)
	}
}

func TestTriggerConnectionRequestWithFallbacks(t *testing.T) {
	attempts := 0
	cpeSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(auth, "Digest ") && strings.Contains(auth, `username="admin"`) {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("WWW-Authenticate", `Digest realm="HuaweiHomeGateway", nonce="abc123def456", qop="auth", algorithm="MD5"`)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer cpeSrv.Close()

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := New(&config.CWMPConfig{
		ConnectionRequestTimeoutSeconds: 5,
		BlockPrivateSSRFTargets:         false,
	}, log, &mockCWMPStore{})
	srv.httpCli.Transport = &http.Transport{
		DisableKeepAlives: true,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, cpeSrv.Listener.Addr().String())
		},
	}

	matched, err := srv.TriggerConnectionRequestWithFallbacks(
		context.Background(),
		"http://10.99.0.93:7547/cr",
		CRCredential{Username: "wrong", Password: "bad"},
		CRCredential{Username: "admin", Password: "admin"},
	)
	if err != nil {
		t.Fatalf("expected fallback credential to succeed, got error: %v", err)
	}
	if matched.Username != "admin" || matched.Password != "admin" {
		t.Fatalf("expected matched credential admin/admin, got %+v", matched)
	}
	if attempts < 3 {
		t.Fatalf("expected initial 401 + wrong cred 401 + admin cred 200 (>=3 attempts), got %d", attempts)
	}
}

func TestCWMPSummonBinarySplit9005Recovery(t *testing.T) {
	devID := uuid.New()
	taskID := uuid.New()
	store := &mockCWMPStore{
		dev: &device.Device{
			ID:            devID,
			SerialNumber:  "48575443315A909B",
			DataModelRoot: "InternetGatewayDevice.",
		},
		queuedTask: &task.Task{
			ID:       taskID,
			DeviceID: devID,
			TaskType: task.TypeSummon,
			Payload: map[string]interface{}{
				"paths": []interface{}{
					"InternetGatewayDevice.DeviceInfo.UpTime",
					"InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower",
				},
			},
		},
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := New(&config.CWMPConfig{SessionTimeoutSeconds: 60, MaxBodyBytes: 1024 * 1024, AllowAutoEnroll: true}, log, store)

	// 1. Inform
	informXML := `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Header><cwmp:ID soapenv:mustUnderstand="1">1</cwmp:ID></soapenv:Header>
  <soapenv:Body><cwmp:Inform>
    <DeviceId><Manufacturer>Huawei</Manufacturer><OUI>00259E</OUI><ProductClass>HG8546M</ProductClass><SerialNumber>48575443315A909B</SerialNumber></DeviceId>
    <Event><EventStruct><EventCode>2 PERIODIC</EventCode><CommandKey></CommandKey></EventStruct></Event>
    <MaxEnvelopes>1</MaxEnvelopes><CurrentTime>2026-11-19T06:00:00Z</CurrentTime><RetryCount>0</RetryCount>
    <ParameterList><ParameterValueStruct><Name>InternetGatewayDevice.DeviceInfo.SoftwareVersion</Name><Value>V5</Value></ParameterValueStruct></ParameterList>
  </cwmp:Inform></soapenv:Body>
</soapenv:Envelope>`
	req := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(informXML))
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	cookies := rec.Result().Cookies()

	// 2. Empty POST -> gets 2-path GetParameterValues
	req2 := httptest.NewRequest(http.MethodPost, "/cwmp", nil)
	req2.AddCookie(cookies[0])
	rec2 := httptest.NewRecorder()
	srv.ServeHTTP(rec2, req2)
	if !strings.Contains(rec2.Body.String(), "X_ZTE-COM_WANPONInterfaceConfig.RXPower") {
		t.Fatalf("expected combined GPV batch, got %s", rec2.Body.String())
	}

	// 3. CPE replies 9005 Fault -> server splits and sends left half (DeviceInfo.UpTime)
	fault9005 := `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Body><soapenv:Fault><faultcode>Client</faultcode><faultstring>CWMP fault</faultstring><detail><cwmp:Fault><FaultCode>9005</FaultCode><FaultString>Invalid parameter name</FaultString></cwmp:Fault></detail></soapenv:Fault></soapenv:Body>
</soapenv:Envelope>`
	req3 := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(fault9005))
	req3.AddCookie(cookies[0])
	rec3 := httptest.NewRecorder()
	srv.ServeHTTP(rec3, req3)
	if !strings.Contains(rec3.Body.String(), "DeviceInfo.UpTime") || strings.Contains(rec3.Body.String(), "X_ZTE-COM") {
		t.Fatalf("expected split left batch with DeviceInfo.UpTime only, got %s", rec3.Body.String())
	}

	// 4. CPE succeeds on DeviceInfo.UpTime -> server sends right half (X_ZTE-COM...)
	gpvOK := `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Body><cwmp:GetParameterValuesResponse>
    <ParameterList><ParameterValueStruct><Name>InternetGatewayDevice.DeviceInfo.UpTime</Name><Value>999</Value></ParameterValueStruct></ParameterList>
  </cwmp:GetParameterValuesResponse></soapenv:Body>
</soapenv:Envelope>`
	req4 := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(gpvOK))
	req4.AddCookie(cookies[0])
	rec4 := httptest.NewRecorder()
	srv.ServeHTTP(rec4, req4)
	if !strings.Contains(rec4.Body.String(), "X_ZTE-COM") {
		t.Fatalf("expected right batch after left succeeded, got %s", rec4.Body.String())
	}

	// 5. CPE sends 9005 on single X_ZTE-COM path -> server queues WANDevice.1. fallback
	req5 := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(fault9005))
	req5.AddCookie(cookies[0])
	rec5 := httptest.NewRecorder()
	srv.ServeHTTP(rec5, req5)
	if !strings.Contains(rec5.Body.String(), "InternetGatewayDevice.WANDevice.1.") {
		t.Fatalf("expected WANDevice.1. fallback after proprietary X_ path 9005, got %s", rec5.Body.String())
	}

	// 6. CPE returns WANDevice.1. params -> task completes cleanly!
	gpvWan := `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Body><cwmp:GetParameterValuesResponse>
    <ParameterList><ParameterValueStruct><Name>InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower</Name><Value>-21.4</Value></ParameterValueStruct></ParameterList>
  </cwmp:GetParameterValuesResponse></soapenv:Body>
</soapenv:Envelope>`
	req6 := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(gpvWan))
	req6.AddCookie(cookies[0])
	rec6 := httptest.NewRecorder()
	srv.ServeHTTP(rec6, req6)
	if rec6.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content on session completion, got %d", rec6.Code)
	}
	if store.completedTaskID != taskID {
		t.Fatalf("expected task %s to complete after binary-split recovery, got %s", taskID, store.completedTaskID)
	}
}

func TestCWMPSummonWLANFallback9005(t *testing.T) {
	devID := uuid.New()
	taskID := uuid.New()
	store := &mockCWMPStore{
		dev: &device.Device{
			ID:            devID,
			SerialNumber:  "ZICGCEE2E712",
			DataModelRoot: "InternetGatewayDevice.",
		},
		queuedTask: &task.Task{
			ID:       taskID,
			DeviceID: devID,
			TaskType: task.TypeSummon,
			Payload: map[string]interface{}{
				"paths": []interface{}{"InternetGatewayDevice.LANDevice.1.WLANConfiguration."},
			},
		},
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := New(&config.CWMPConfig{SessionTimeoutSeconds: 60, MaxBodyBytes: 1024 * 1024, AllowAutoEnroll: true}, log, store)

	informXML := `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Header><cwmp:ID soapenv:mustUnderstand="1">1</cwmp:ID></soapenv:Header>
  <soapenv:Body><cwmp:Inform>
    <DeviceId><Manufacturer>ZICG</Manufacturer><OUI>601888</OUI><ProductClass>XST99</ProductClass><SerialNumber>ZICGCEE2E712</SerialNumber></DeviceId>
    <Event><EventStruct><EventCode>2 PERIODIC</EventCode><CommandKey></CommandKey></EventStruct></Event>
    <MaxEnvelopes>1</MaxEnvelopes><CurrentTime>2026-11-19T06:00:00Z</CurrentTime><RetryCount>0</RetryCount>
    <ParameterList><ParameterValueStruct><Name>InternetGatewayDevice.DeviceInfo.SoftwareVersion</Name><Value>V9.0.0P2T12</Value></ParameterValueStruct></ParameterList>
  </cwmp:Inform></soapenv:Body>
</soapenv:Envelope>`
	req1 := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(informXML))
	rec1 := httptest.NewRecorder()
	srv.ServeHTTP(rec1, req1)
	cookies := rec1.Result().Cookies()

	// Empty POST -> server sends GetParameterValues for .WLANConfiguration.
	req2 := httptest.NewRequest(http.MethodPost, "/cwmp", nil)
	req2.AddCookie(cookies[0])
	rec2 := httptest.NewRecorder()
	srv.ServeHTTP(rec2, req2)
	if !strings.Contains(rec2.Body.String(), "InternetGatewayDevice.LANDevice.1.WLANConfiguration.") {
		t.Fatalf("expected WLANConfiguration. in initial GPV, got %s", rec2.Body.String())
	}

	// CPE replies 9005 on .WLANConfiguration. -> server falls back to explicit leaf batch for WLANConfiguration.1.*
	fault9005 := `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Body><soapenv:Fault><faultcode>Client</faultcode><faultstring>CWMP fault</faultstring><detail><cwmp:Fault><FaultCode>9005</FaultCode><FaultString>Invalid parameter name</FaultString></cwmp:Fault></detail></soapenv:Fault></soapenv:Body>
</soapenv:Envelope>`
	req3 := httptest.NewRequest(http.MethodPost, "/cwmp", strings.NewReader(fault9005))
	req3.AddCookie(cookies[0])
	rec3 := httptest.NewRecorder()
	srv.ServeHTTP(rec3, req3)
	if !strings.Contains(rec3.Body.String(), "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID") {
		t.Fatalf("expected explicit WLANConfiguration.1.SSID fallback batch after 9005, got %s", rec3.Body.String())
	}
}
