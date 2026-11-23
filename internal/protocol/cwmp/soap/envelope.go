package soap

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
)

const (
	NSSE     = "http://schemas.xmlsoap.org/soap/envelope/"
	NSCWMP10 = "urn:dslforum-org:cwmp-1-0"
	NSCWMP12 = "urn:dslforum-org:cwmp-1-2"
)

type Envelope struct {
	XMLName xml.Name `xml:"Envelope"`
	Header  Header   `xml:"Header"`
	Body    Body     `xml:"Body"`
}

type Header struct {
	ID           *HeaderID `xml:"ID"`
	HoldRequests *string   `xml:"HoldRequests"`
}

type HeaderID struct {
	MustUnderstand string `xml:"mustUnderstand,attr,omitempty"`
	Value          string `xml:",chardata"`
}

type Body struct {
	Inform                 *Inform                 `xml:"Inform"`
	GetRPCMethodsResponse  *GetRPCMethodsResponse  `xml:"GetRPCMethodsResponse"`
	GetParameterNamesResp  *GetParameterNamesResp  `xml:"GetParameterNamesResponse"`
	GetParameterValuesResp *GetParameterValuesResp `xml:"GetParameterValuesResponse"`
	SetParameterValuesResp *SetParameterValuesResp `xml:"SetParameterValuesResponse"`
	AddObjectResponse      *AddObjectResponse      `xml:"AddObjectResponse"`
	DeleteObjectResponse   *DeleteObjectResponse   `xml:"DeleteObjectResponse"`
	RebootResponse         *RebootResponse         `xml:"RebootResponse"`
	FactoryResetResponse   *FactoryResetResponse   `xml:"FactoryResetResponse"`
	DownloadResponse       *DownloadResponse       `xml:"DownloadResponse"`
	TransferComplete       *TransferComplete       `xml:"TransferComplete"`
	Fault                  *SOAPFault              `xml:"Fault"`
}

type DeviceID struct {
	Manufacturer string `xml:"Manufacturer"`
	OUI          string `xml:"OUI"`
	ProductClass string `xml:"ProductClass"`
	SerialNumber string `xml:"SerialNumber"`
}

type EventStruct struct {
	EventCode  string `xml:"EventCode"`
	CommandKey string `xml:"CommandKey"`
}

type ParameterValueStruct struct {
	Name  string         `xml:"Name"`
	Value ParameterValue `xml:"Value"`
}

type ParameterValue struct {
	Type  string `xml:"type,attr,omitempty"`
	Value string `xml:",chardata"`
}

type Inform struct {
	DeviceId      DeviceID               `xml:"DeviceId"`
	Event         []EventStruct          `xml:"Event>EventStruct"`
	MaxEnvelopes  int                    `xml:"MaxEnvelopes"`
	CurrentTime   string                 `xml:"CurrentTime"`
	RetryCount    int                    `xml:"RetryCount"`
	ParameterList []ParameterValueStruct `xml:"ParameterList>ParameterValueStruct"`
}

type GetRPCMethodsResponse struct {
	MethodList []string `xml:"MethodList>string"`
}

type ParameterInfoStruct struct {
	Name     string `xml:"Name"`
	Writable string `xml:"Writable"`
}

type GetParameterNamesResp struct {
	ParameterList []ParameterInfoStruct `xml:"ParameterList>ParameterInfoStruct"`
}

type GetParameterValuesResp struct {
	ParameterList []ParameterValueStruct `xml:"ParameterList>ParameterValueStruct"`
}

type SetParameterValuesResp struct {
	Status int `xml:"Status"`
}

type AddObjectResponse struct {
	InstanceNumber int `xml:"InstanceNumber"`
	Status         int `xml:"Status"`
}

type DeleteObjectResponse struct {
	Status int `xml:"Status"`
}

type RebootResponse struct{}
type FactoryResetResponse struct{}

type DownloadResponse struct {
	Status       int    `xml:"Status"`
	StartTime    string `xml:"StartTime"`
	CompleteTime string `xml:"CompleteTime"`
}

type TransferComplete struct {
	CommandKey   string     `xml:"CommandKey"`
	FaultStruct  *CWMPFault `xml:"FaultStruct"`
	StartTime    string     `xml:"StartTime"`
	CompleteTime string     `xml:"CompleteTime"`
}

type SOAPFault struct {
	FaultCode   string      `xml:"faultcode"`
	FaultString string      `xml:"faultstring"`
	Detail      FaultDetail `xml:"detail"`
}

type FaultDetail struct {
	Fault *CWMPFault `xml:"Fault"`
}

type CWMPFault struct {
	FaultCode               string                `xml:"FaultCode"`
	FaultString             string                `xml:"FaultString"`
	SetParameterValuesFault []SetParamFaultStruct `xml:"SetParameterValuesFault"`
}

type SetParamFaultStruct struct {
	ParameterName string `xml:"ParameterName"`
	FaultCode     string `xml:"FaultCode"`
	FaultString   string `xml:"FaultString"`
}

func ParseEnvelope(raw []byte) (*Envelope, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, nil // Empty HTTP POST signals CPE has no more requests
	}
	var env Envelope
	if err := xml.Unmarshal(raw, &env); err != nil {
		return nil, fmt.Errorf("unmarshal soap envelope: %w", err)
	}
	return &env, nil
}

func BuildInformResponse(cwmpID string, maxEnvelopes int) string {
	if maxEnvelopes <= 0 {
		maxEnvelopes = 1
	}
	return wrapSOAP(cwmpID, fmt.Sprintf(`<cwmp:InformResponse><MaxEnvelopes>%d</MaxEnvelopes></cwmp:InformResponse>`, maxEnvelopes))
}

func BuildTransferCompleteResponse(cwmpID string) string {
	return wrapSOAP(cwmpID, `<cwmp:TransferCompleteResponse/>`)
}

func BuildGetRPCMethods(cwmpID string) string {
	return wrapSOAP(cwmpID, `<cwmp:GetRPCMethods/>`)
}

func BuildGetParameterNames(cwmpID, path string, nextLevel bool) string {
	nl := "0"
	if nextLevel {
		nl = "1"
	}
	return wrapSOAP(cwmpID, fmt.Sprintf(
		`<cwmp:GetParameterNames><ParameterPath>%s</ParameterPath><NextLevel>%s</NextLevel></cwmp:GetParameterNames>`,
		escapeXML(path), nl,
	))
}

func BuildGetParameterValues(cwmpID string, paths []string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf(`<cwmp:GetParameterValues><ParameterNames soapenc:arrayType="xsd:string[%d]">`, len(paths)))
	for _, p := range paths {
		b.WriteString(fmt.Sprintf(`<string>%s</string>`, escapeXML(p)))
	}
	b.WriteString(`</ParameterNames></cwmp:GetParameterValues>`)
	return wrapSOAP(cwmpID, b.String())
}

type SetParamInput struct {
	Name  string
	Type  string
	Value string
}

func BuildSetParameterValues(cwmpID, parameterKey string, params []SetParamInput) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf(`<cwmp:SetParameterValues><ParameterList soapenc:arrayType="cwmp:ParameterValueStruct[%d]">`, len(params)))
	for _, p := range params {
		typ := p.Type
		if typ == "" {
			typ = "xsd:string"
		} else if !strings.Contains(typ, ":") {
			typ = "xsd:" + typ
		}
		b.WriteString(fmt.Sprintf(
			`<ParameterValueStruct><Name>%s</Name><Value xsi:type="%s">%s</Value></ParameterValueStruct>`,
			escapeXML(p.Name), escapeXML(typ), escapeXML(p.Value),
		))
	}
	b.WriteString(fmt.Sprintf(`</ParameterList><ParameterKey>%s</ParameterKey></cwmp:SetParameterValues>`, escapeXML(parameterKey)))
	return wrapSOAP(cwmpID, b.String())
}

func BuildReboot(cwmpID, commandKey string) string {
	return wrapSOAP(cwmpID, fmt.Sprintf(`<cwmp:Reboot><CommandKey>%s</CommandKey></cwmp:Reboot>`, escapeXML(commandKey)))
}

func BuildFactoryReset(cwmpID string) string {
	return wrapSOAP(cwmpID, `<cwmp:FactoryReset/>`)
}

func BuildAddObject(cwmpID, objectName, parameterKey string) string {
	return wrapSOAP(cwmpID, fmt.Sprintf(
		`<cwmp:AddObject><ObjectName>%s</ObjectName><ParameterKey>%s</ParameterKey></cwmp:AddObject>`,
		escapeXML(objectName), escapeXML(parameterKey),
	))
}

func BuildDeleteObject(cwmpID, objectName, parameterKey string) string {
	return wrapSOAP(cwmpID, fmt.Sprintf(
		`<cwmp:DeleteObject><ObjectName>%s</ObjectName><ParameterKey>%s</ParameterKey></cwmp:DeleteObject>`,
		escapeXML(objectName), escapeXML(parameterKey),
	))
}

func BuildDownload(cwmpID, commandKey, fileType, url, username, password string, fileSize int64, targetFileName string) string {
	return wrapSOAP(cwmpID, fmt.Sprintf(
		`<cwmp:Download><CommandKey>%s</CommandKey><FileType>%s</FileType><URL>%s</URL><Username>%s</Username><Password>%s</Password><FileSize>%d</FileSize><TargetFileName>%s</TargetFileName><DelaySeconds>0</DelaySeconds><SuccessURL></SuccessURL><FailureURL></FailureURL></cwmp:Download>`,
		escapeXML(commandKey), escapeXML(fileType), escapeXML(url), escapeXML(username), escapeXML(password), fileSize, escapeXML(targetFileName),
	))
}

func wrapSOAP(cwmpID, bodyContent string) string {
	header := ""
	if cwmpID != "" {
		header = fmt.Sprintf(`<soapenv:Header><cwmp:ID soapenv:mustUnderstand="1">%s</cwmp:ID></soapenv:Header>`, escapeXML(cwmpID))
	} else {
		header = `<soapenv:Header/>`
	}
	return fmt.Sprintf(
		`<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="%s" xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:cwmp="%s">%s<soapenv:Body>%s</soapenv:Body></soapenv:Envelope>`,
		NSSE, NSCWMP10, header, bodyContent,
	)
}

func escapeXML(s string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}
