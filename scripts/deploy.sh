#!/usr/bin/env bash
set -euo pipefail

# Universal One-Command Ubuntu Server Deployment for NexaACS
# Works on any server IP/hostname without manual pre-configuration.
export PATH="/usr/local/go/bin:$HOME/go/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

APP_ROOT="/opt/nexaacs"
ETC_DIR="/etc/nexaacs"
VAR_DIR="/var/lib/nexaacs"
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

echo "[1/9] Checking OS prerequisites (PostgreSQL, Redis, Nginx, OpenSSL, Go, Node.js)..."
if command -v apt-get >/dev/null 2>&1; then
  MISSING_PKGS=()
  for pkg in postgresql redis-server nginx curl openssl ca-certificates build-essential; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      MISSING_PKGS+=("$pkg")
    fi
  done
  if [ "${#MISSING_PKGS[@]}" -gt 0 ]; then
    $SUDO apt-get update -qq
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y "${MISSING_PKGS[@]}"
  fi
fi

if ! command -v go >/dev/null 2>&1; then
  echo "ERROR: Go compiler is not installed (or not in PATH / /usr/local/go/bin). Install Go 1.22+ and re-run." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: Node.js / npm is not installed. Install Node.js 18+ and re-run." >&2
  exit 1
fi

echo "[2/9] Ensuring PostgreSQL & Redis services are running..."
if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl enable --now postgresql >/dev/null 2>&1 || true
  $SUDO systemctl enable --now redis-server >/dev/null 2>&1 || true
fi

echo "[3/9] Creating system user & NexaACS directories..."
if ! id -u nexaacs >/dev/null 2>&1; then
  $SUDO useradd --system --no-create-home --shell /usr/sbin/nologin nexaacs
fi
$SUDO install -d -o root -g root -m 0755 "$APP_ROOT" "$APP_ROOT/frontend" "$APP_ROOT/frontend/dist"
$SUDO install -d -o nexaacs -g nexaacs -m 0750 "$APP_ROOT/backend" "$APP_ROOT/backend/bin" "$APP_ROOT/backend/data-models"
$SUDO install -d -o nexaacs -g nexaacs -m 0750 "$VAR_DIR/firmware" "$VAR_DIR/uploads" "$VAR_DIR/backups" "/var/log/nexaacs"
$SUDO install -d -o root -g nexaacs -m 0750 "$ETC_DIR"

echo "[4/9] Bootstrapping PostgreSQL database & production secrets..."
if [ ! -f "$ETC_DIR/config.yaml" ]; then
  $SUDO install -o root -g nexaacs -m 0640 configs/config.yaml "$ETC_DIR/config.yaml"
fi

if [ ! -f "$ETC_DIR/secrets.env" ]; then
  DB_PASS="$(openssl rand -hex 16)"
  MASTER_KEY="$(openssl rand -hex 32)"
  JWT_KEY="$(openssl rand -hex 32)"
  CWMP_PASS="$(openssl rand -hex 12)"

  $SUDO -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexaacs') THEN
    CREATE ROLE nexaacs WITH LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE nexaacs WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE nexaacs OWNER nexaacs'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'nexaacs')\gexec
GRANT ALL PRIVILEGES ON DATABASE nexaacs TO nexaacs;
SQL

  TMP_ENV="$(mktemp)"
  cat > "$TMP_ENV" <<EOF
NEXAACS_DB_DSN=postgres://nexaacs:${DB_PASS}@127.0.0.1:5432/nexaacs?sslmode=disable
NEXAACS_REDIS_ADDR=127.0.0.1:6379
NEXAACS_REDIS_PASSWORD=
NEXAACS_SECRET_MASTER_KEY=${MASTER_KEY}
NEXAACS_JWT_SIGNING_KEY=${JWT_KEY}
NEXAACS_CWMP_SHARED_USERNAME=acs_cpe
NEXAACS_CWMP_SHARED_PASSWORD=${CWMP_PASS}
EOF
  $SUDO install -o root -g nexaacs -m 0600 "$TMP_ENV" "$ETC_DIR/secrets.env"
  rm -f "$TMP_ENV"
  echo "Generated fresh PostgreSQL database 'nexaacs' and cryptographic keys in $ETC_DIR/secrets.env."
fi

echo "[5/9] Building Go backend binaries..."
make build

echo "[6/9] Building React frontend production bundle..."
(
  cd nexaacs-web
  npm ci
  npm run build
)

echo "[7/9] Installing binaries, data-models, and frontend dist..."
$SUDO install -o nexaacs -g nexaacs -m 0755 bin/nexaacs-* "$APP_ROOT/backend/bin/"
$SUDO cp -r data-models/. "$APP_ROOT/backend/data-models/"
$SUDO chown -R nexaacs:nexaacs "$APP_ROOT/backend/data-models"
$SUDO rm -rf "${APP_ROOT}/frontend/dist/"*
$SUDO cp -r nexaacs-web/dist/. "$APP_ROOT/frontend/dist/"
$SUDO chmod -R a+rX "$APP_ROOT/frontend/dist"

echo "[8/9] Configuring systemd services & Nginx..."
$SUDO cp deployments/systemd/nexaacs-*.service /etc/systemd/system/
$SUDO systemctl daemon-reload

if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then
  $SUDO cp deployments/nginx/nexaacs.conf /etc/nginx/sites-available/nexaacs.conf
  $SUDO ln -sf /etc/nginx/sites-available/nexaacs.conf /etc/nginx/sites-enabled/nexaacs.conf
elif [ -d /etc/nginx/conf.d ]; then
  $SUDO cp deployments/nginx/nexaacs.conf /etc/nginx/conf.d/nexaacs.conf
fi
$SUDO nginx -t
$SUDO systemctl enable --now nginx
$SUDO systemctl reload nginx

# Start API first so embedded SQL migrations run cleanly before worker/cwmp/usp connect
$SUDO systemctl enable nexaacs-api nexaacs-cwmp nexaacs-usp nexaacs-worker
$SUDO systemctl restart nexaacs-api
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:7557/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
$SUDO systemctl restart nexaacs-cwmp nexaacs-usp nexaacs-worker

echo "[9/9] Verifying health checks..."
curl -fsS http://127.0.0.1:7557/healthz >/dev/null
curl -fsS http://127.0.0.1:7567/healthz >/dev/null
curl -fsS http://127.0.0.1:7547/healthz >/dev/null

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "${SERVER_IP}" ]; then
  SERVER_IP="<SERVER_IP>"
fi

echo ""
echo "=================================================================="
echo " NexaACS deployed and running!"
echo "=================================================================="
echo " Web Dashboard UI : http://${SERVER_IP}:8000"
echo " REST API (Direct): http://${SERVER_IP}:7557/api/v1"
echo " ONT ACS URL      : http://${SERVER_IP}:7547/cwmp"
echo " File Server      : http://${SERVER_IP}:7567"
echo " Default Login    : admin@nexanet.local / NexaACS#2026"
echo " Secrets File     : ${ETC_DIR}/secrets.env"
echo "=================================================================="
