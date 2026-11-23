package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var (
	ErrInvalidMasterKey = errors.New("master key must be 32 bytes (64 hex characters)")
	ErrInvalidURL       = errors.New("invalid connection request url")
	ErrSSRFBlocked      = errors.New("connection request target blocked by SSRF policy")
)

type SecretCipher struct {
	key []byte
}

func NewSecretCipherFromHex(hexKey string) (*SecretCipher, error) {
	key, err := hex.DecodeString(strings.TrimSpace(hexKey))
	if err != nil || len(key) != 32 {
		return nil, ErrInvalidMasterKey
	}
	return &SecretCipher{key: key}, nil
}

func (c *SecretCipher) Encrypt(plaintext string) ([]byte, error) {
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, []byte(plaintext), nil), nil
}

func (c *SecretCipher) Decrypt(ciphertext []byte) (string, error) {
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	nonce, body := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plain, err := gcm.Open(nil, nonce, body, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// ValidateConnectionRequestURL verifies scheme, host, port, and guards against SSRF into localhost/link-local metadata endpoints.
func ValidateConnectionRequestURL(rawURL string, blockPrivate bool) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, ErrInvalidURL
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, fmt.Errorf("%w: unsupported scheme %s", ErrInvalidURL, scheme)
	}
	host := parsed.Hostname()
	if host == "" {
		return nil, ErrInvalidURL
	}
	lowerHost := strings.ToLower(host)
	if lowerHost == "localhost" || strings.HasSuffix(lowerHost, ".local") {
		return nil, fmt.Errorf("%w: localhost target rejected", ErrSSRFBlocked)
	}

	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return nil, fmt.Errorf("%w: loopback or link-local IP rejected", ErrSSRFBlocked)
		}
		if blockPrivate && ip.IsPrivate() {
			return nil, fmt.Errorf("%w: private IP target rejected by policy", ErrSSRFBlocked)
		}
	}
	return parsed, nil
}

// SignStatelessToken signs a minimal HMAC-SHA256 bearer token payload for internal API verification.
func SignStatelessToken(subject string, tenantID string, role string, ttl time.Duration, signingKey string) string {
	exp := time.Now().UTC().Add(ttl).Unix()
	payload := fmt.Sprintf("%s|%s|%s|%d", subject, tenantID, role, exp)
	encoded := base64.RawURLEncoding.EncodeToString([]byte(payload))
	mac := hmac.New(sha256.New, []byte(signingKey))
	mac.Write([]byte(encoded))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return encoded + "." + sig
}

type TokenClaims struct {
	Subject   string
	TenantID  string
	Role      string
	ExpiresAt int64
}

// VerifyStatelessToken validates signature and expiration on an HMAC-SHA256 bearer token.
func VerifyStatelessToken(token string, signingKey string) (*TokenClaims, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 2 {
		return nil, errors.New("invalid token format")
	}
	mac := hmac.New(sha256.New, []byte(signingKey))
	mac.Write([]byte(parts[0]))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(parts[1]), []byte(expectedSig)) {
		return nil, errors.New("invalid token signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("corrupt token payload")
	}
	fields := strings.Split(string(raw), "|")
	if len(fields) != 4 {
		return nil, errors.New("malformed token claims")
	}
	exp, err := strconv.ParseInt(fields[3], 10, 64)
	if err != nil || time.Now().UTC().Unix() > exp {
		return nil, errors.New("token expired")
	}
	return &TokenClaims{
		Subject:   fields[0],
		TenantID:  fields[1],
		Role:      fields[2],
		ExpiresAt: exp,
	}, nil
}

// DigestAuthHeader computes an RFC 2617 HTTP Digest Authorization header from a 401 WWW-Authenticate challenge.
func DigestAuthHeader(method, uri, username, password, wwwAuthenticate string) (string, error) {
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(wwwAuthenticate)), "digest ") {
		return "", errors.New("not a digest challenge")
	}
	params := parseAuthKV(strings.TrimSpace(wwwAuthenticate)[len("Digest "):])
	realm := params["realm"]
	nonce := params["nonce"]
	if nonce == "" {
		return "", errors.New("digest challenge missing nonce")
	}
	qop := params["qop"]
	opaque := params["opaque"]

	ha1 := md5Hex(fmt.Sprintf("%s:%s:%s", username, realm, password))
	ha2 := md5Hex(fmt.Sprintf("%s:%s", method, uri))

	var nc, cnonce, selectedQop, resp string
	if strings.Contains(qop, "auth") {
		selectedQop = "auth"
		nc = "00000001"
		buf := make([]byte, 8)
		_, _ = io.ReadFull(rand.Reader, buf)
		cnonce = hex.EncodeToString(buf)
		resp = md5Hex(fmt.Sprintf("%s:%s:%s:%s:%s:%s", ha1, nonce, nc, cnonce, selectedQop, ha2))
	} else {
		resp = md5Hex(fmt.Sprintf("%s:%s:%s", ha1, nonce, ha2))
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf(`Digest username="%s", realm="%s", nonce="%s", uri="%s", response="%s"`,
		username, realm, nonce, uri, resp))
	if selectedQop != "" {
		b.WriteString(fmt.Sprintf(`, qop=%s, nc=%s, cnonce="%s"`, selectedQop, nc, cnonce))
	}
	if opaque != "" {
		b.WriteString(fmt.Sprintf(`, opaque="%s"`, opaque))
	}
	return b.String(), nil
}

func md5Hex(s string) string {
	sum := md5.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

func parseAuthKV(header string) map[string]string {
	out := make(map[string]string)
	var parts []string
	var cur strings.Builder
	inQuotes := false
	for i := 0; i < len(header); i++ {
		ch := header[i]
		if ch == '"' {
			inQuotes = !inQuotes
			cur.WriteByte(ch)
			continue
		}
		if ch == ',' && !inQuotes {
			parts = append(parts, cur.String())
			cur.Reset()
			continue
		}
		cur.WriteByte(ch)
	}
	if cur.Len() > 0 {
		parts = append(parts, cur.String())
	}
	for _, part := range parts {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		k := strings.ToLower(strings.TrimSpace(kv[0]))
		v := strings.Trim(strings.TrimSpace(kv[1]), `"`)
		out[k] = v
	}
	return out
}
