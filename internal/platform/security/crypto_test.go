package security

import (
	"testing"
	"time"
)

func TestStatelessTokenRoundtrip(t *testing.T) {
	tok := SignStatelessToken("admin", "00000000-0000-0000-0000-000000000001", "Super Admin", time.Hour, "test-secret")
	claims, err := VerifyStatelessToken(tok, "test-secret")
	if err != nil {
		t.Fatalf("VerifyStatelessToken failed: %v", err)
	}
	if claims.Subject != "admin" || claims.Role != "Super Admin" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
	if _, err := VerifyStatelessToken(tok, "wrong-secret"); err == nil {
		t.Fatalf("expected signature verification failure")
	}
}

func TestDigestAuthHeader(t *testing.T) {
	hdr, err := DigestAuthHeader("GET", "/tr069", "acs_cr", "pass123", `Digest realm="Huawei", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", qop="auth", opaque="5ccc069c403ebaf9f0171e9517f40e41"`)
	if err != nil {
		t.Fatalf("DigestAuthHeader failed: %v", err)
	}
	if len(hdr) == 0 || hdr[:7] != "Digest " {
		t.Fatalf("unexpected digest header: %s", hdr)
	}
	hdrZTE, err := DigestAuthHeader("GET", "/", "admin", "admin", `Digest realm="cpe@zte.com", qop="auth,auth-int", nonce="03982148235011b87cb8db6fd45171e6", opaque="T3BhcXVl", Algorithm="MD5"`)
	if err != nil || len(hdrZTE) == 0 || hdrZTE[:7] != "Digest " {
		t.Fatalf("expected ZTE digest challenge with quoted qop list to parse cleanly, err=%v hdr=%q", err, hdrZTE)
	}
}
