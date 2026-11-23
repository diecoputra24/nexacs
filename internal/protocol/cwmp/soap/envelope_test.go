package soap

import (
	"strings"
	"testing"
)

func TestParseInformEnvelope(t *testing.T) {
	sample := `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soap:Header>
    <cwmp:ID soap:mustUnderstand="1">1001</cwmp:ID>
  </soap:Header>
  <soap:Body>
    <cwmp:Inform>
      <DeviceId>
        <Manufacturer>ZTE</Manufacturer>
        <OUI>00259E</OUI>
        <ProductClass>F670L</ProductClass>
        <SerialNumber>ZTEGC819204A</SerialNumber>
      </DeviceId>
      <Event>
        <EventStruct>
          <EventCode>1 BOOT</EventCode>
          <CommandKey></CommandKey>
        </EventStruct>
      </Event>
      <MaxEnvelopes>1</MaxEnvelopes>
      <CurrentTime>2026-11-17T07:00:00Z</CurrentTime>
      <RetryCount>0</RetryCount>
      <ParameterList>
        <ParameterValueStruct>
          <Name>InternetGatewayDevice.DeviceInfo.SoftwareVersion</Name>
          <Value>V1.0.10P1N1</Value>
        </ParameterValueStruct>
      </ParameterList>
    </cwmp:Inform>
  </soap:Body>
</soap:Envelope>`

	env, err := ParseEnvelope([]byte(sample))
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	if env == nil || env.Body.Inform == nil {
		t.Fatal("expected Inform body")
	}
	if env.Header.ID == nil || env.Header.ID.Value != "1001" {
		t.Fatalf("expected cwmp:ID 1001, got %+v", env.Header.ID)
	}
	if env.Body.Inform.DeviceId.SerialNumber != "ZTEGC819204A" {
		t.Fatalf("unexpected serial: %s", env.Body.Inform.DeviceId.SerialNumber)
	}
	if len(env.Body.Inform.Event) != 1 || env.Body.Inform.Event[0].EventCode != "1 BOOT" {
		t.Fatalf("unexpected events: %+v", env.Body.Inform.Event)
	}

	resp := BuildInformResponse("1001", 1)
	if !strings.Contains(resp, "<cwmp:InformResponse>") || !strings.Contains(resp, ">1001<") {
		t.Fatalf("invalid InformResponse: %s", resp)
	}
}
