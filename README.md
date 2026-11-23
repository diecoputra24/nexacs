# NexACS — Lightweight TR-069 / TR-369 Auto Configuration Server

**NexACS** adalah platform **Auto Configuration Server (ACS)** berbasis **TR-069 (CWMP)** dan fondasi **TR-369 (USP)** untuk manajemen CPE/ONT perangkat jaringan ISP/RT-RW Net (ZTE, Huawei, Fiberhome, Nokia, VSOL, Raisecom, TP-Link, D-Link, GM/Xtetch/China Telecom, dan perangkat generic TR-098 / TR-181).

> **Mengapa NexACS dibuat?**
> NexACS dibangun dari nol menggunakan **Backend Go (Golang)** dan **Frontend React (TypeScript)** agar pengelola jaringan tidak bergantung pada stack GenieACS/MongoDB yang berat. Dengan arsitektur biner Go yang ringan dan konsumsi memori minimal, NexACS dirancang agar berjalan lancar bahkan pada server VPS spesifikasi minimal (1–2 vCPU, RAM 1–2 GB).

---

## Referensi & Orisinalitas

Secara konsep antarmuka NOC dan alur protokol TR-069/CWMP, NexACS mengambil inspirasi dari:
- [SkyACS](https://github.com/skydashnet/SKYACS) — referensi konsep UI dashboard telemetri & alur operasional NOC.
- [GenieACS](https://github.com/genieacs/genieacs) — referensi standar kerja TR-069 CWMP Inform, RPC session, dan virtual parameters.

Seluruh kode backend Go, skema database PostgreSQL, worker antrean, engine pemetaan parameter, serta frontend React ditulis secara **mandiri dari nol (original codebase)**.

---

## Arsitektur Sistem

```text
                    +-------------------------------------+
   Browser / NOC -->|  Web + Nginx Proxy (:8000)          |
                    |  - React + MUI + Apache ECharts     |
                    +------------------+------------------+
                                       | /api/v1 & /ws/v1
                    +------------------v------------------+
   Billing / Apps ->|  nexaacs-api (Go :7557 / FS :7567)  |
   (X-API-Key/JWT)  +--------+-----------------+----------+
                             |                 |
         +-------------------+     +-----------+-----------+
         v                         v                       v
  +--------------+        +----------------+      +----------------+
  | PostgreSQL   |        | nexaacs-worker |      |     Redis      |
  | (State+Queue)|        | (CR Dispatch)  |      | (PubSub/Cache) |
  +------+-------+        +--------+-------+      +----------------+
         ^                         | Connection Request (Digest/Basic)
         |                         v
  +------+-------------------------+------+
  | nexaacs-cwmp (Go :7547/cwmp)          |<--- TR-069 SOAP/HTTP --- ONT / CPE
  | nexaacs-usp  (Go :8085/usp)           |<--- TR-369 MTP      --- USP Agent
  +---------------------------------------+
```

### Komponen Backend (Golang)
| Layanan | Sumber | Port Default | Fungsi |
| :--- | :--- | :--- | :--- |
| `nexaacs-api` | `cmd/api` | `7557` (API), `7567` (File Server) | REST API `/api/v1`, RBAC, API Key scopes, WebSocket `/ws/v1/events`, auto-migration SQL, firmware server |
| `nexaacs-cwmp` | `cmd/cwmp` | `7547` (`/cwmp` & `/`) | Server SOAP/HTTP TR-069, manajemen sesi CWMP, adaptive `9005/9003` parameter batch split |
| `nexaacs-worker` | `cmd/worker` | — | Dispatcher HTTP Connection Request (Digest/Basic + fallback), pembersih tugas stale/fault |
| `nexaacs-usp` | `cmd/usp` | `8085` | Pondasi Controller TR-369 USP & abstraksi MTP |

### Komponen Frontend (React)
- Lokasi: `nexaacs-web/`
- Stack: React 18, TypeScript, Vite, Material UI, Apache ECharts, TanStack Query, Zustand, Zod.
- Dilengkapi **Stateful Dev/Simulator Engine** sehingga tampilan UI dan simulasi Inform dapat dijalankan secara lokal meski belum terhubung ke server Go/PostgreSQL.

---

## Fitur Utama

- **Ringan untuk VPS Minimal:** Backend dikompilasi menjadi static binary Go (~25–40 MB image Alpine), agregasi dashboard langsung di PostgreSQL sehingga ribuan perangkat tidak membebani memori browser.
- **Multi-Vendor & Virtual Parameters:** Deteksi vendor otomatis via OUI, Raw Manufacturer, Model Map, maupun inspeksi parameter vendor (`X_ZTE-COM`, `X_HW`, `X_CT-COM`, `X_CMCC`, `X_FH`, `TR-181`), plus manajemen Alias dari UI/API.
- **Adaptive Summon Engine:** Jika perangkat mengembalikan `9005 Invalid Parameter Name` atau `9003`, engine otomatis memecah batch path secara biner di dalam sesi CWMP yang sama sehingga parameter valid tetap terekam.
- **Manajemen WAN, WiFi, & Diagnostik:** Buat WAN (PPPoE / IPoE DHCP-Static / Bridge dengan mode VLAN Tag/Untag/Transparent), ubah SSID & passphrase WiFi, pantau connected hosts, IPPingDiagnostics, reboot, factory reset, dan rollout firmware SHA-256.
- **Zero-Touch Auto Provisioning API:** Endpoint `/api/v1/provisioning` untuk integrasi langsung dengan aplikasi Billing/CRM ISP. Saat ONT melakukan `0 BOOTSTRAP`, profil langsung diterapkan otomatis.
- **Keamanan Siap Produksi:**
  - Enkripsi kata sandi perangkat & WiFi di database menggunakan **AES-256-GCM**.
  - Autentikasi **JWT/HMAC-SHA256 stateless token** dan **RBAC granular** (`Super Admin`, `NOC Engineer`, `Technician`, `Viewer`).
  - **Scoped API Key** (`X-API-Key`) dengan prinsip *least privilege*.
  - Perlindungan SSRF pada Connection Request URL, sanitasi nama berkas upload, pencegahan directory listing pada file server firmware, dan rate limiting login berbasis IP.

---

## Cara Menjalankan dengan Docker (Direkomendasikan)

### 1. Siapkan Konfigurasi `.env`
Salin berkas contoh dan isi dengan secret acak yang kuat:

```bash
cp .env.example .env
```

Generate secret acak untuk `NEXAACS_JWT_SIGNING_KEY` dan `NEXAACS_SECRET_MASTER_KEY`:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Pastikan Anda mengganti semua nilai placeholder (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `NEXAACS_JWT_SIGNING_KEY`, `NEXAACS_SECRET_MASTER_KEY`, `NEXAACS_CWMP_SHARED_PASSWORD`).

Jika web UI diakses lewat domain atau IP server publik, sesuaikan juga di `.env`:
```dotenv
NEXAACS_CORS_ALLOWED_ORIGINS=http://IP_SERVER_ANDA:8000,https://acs.domainanda.com
NEXAACS_FILE_PUBLIC_URL=http://IP_SERVER_ANDA:7567
```

### 2. Jalankan Semua Kontainer

```bash
docker compose up -d --build
```

Atau menggunakan Makefile:
```bash
make docker-up
```

Cek status kontainer dan kesehatan layanan:
```bash
docker compose ps
docker compose logs -f api cwmp worker
```

### 3. Akses Aplikasi & Wajib Ganti Password Default
- **Dashboard Web:** `http://<IP_SERVER>:8000`
- **ACS URL untuk ONT (TR-069):** `http://<IP_SERVER>:7547/cwmp`
- **Login Awal:** Username `admin` / Password `admin`

> **PENTING (KEAMANAN):** Setelah login pertama kali, **segera ganti password akun `admin`** melalui menu **Security / Settings -> Users & Roles**, lalu buat **API Key dengan scope terbatas** jika ingin diintegrasikan ke sistem Billing/aplikasi lain.

---

## Instalasi Manual Ubuntu (Tanpa Docker)

Untuk deployment native dengan `systemd` + `nginx`:
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```
Skrip ini akan menginstal PostgreSQL, Redis, Nginx, membuat secret otomatis di `/etc/nexaacs/secrets.env` (`chmod 600`), mem-build biner Go + bundle React, serta menjalankan layanan via `systemd`.

---

## Pengembangan Lokal

### Backend & Unit Test
```bash
go test ./...
```

### Frontend + Simulator UI (Tanpa Backend)
```bash
cd nexaacs-web
npm install
npm run dev
```
Akses UI di `http://localhost:8000`.

### Full Stack Lokal (Windows PowerShell)
Salin `.env.example` ke `.env`, siapkan PostgreSQL lokal, lalu jalankan:
```powershell
./scripts/run-local.ps1
```

---

## Dokumentasi API & Integrasi

Jika Anda ingin menghubungkan **NexACS** ke aplikasi lain (misalnya sistem Billing ISP, WhatsApp Bot, CRM, atau portal teknisi), lihat dokumentasi lengkap endpoint REST & WebSocket pada:

**[docs/API.md](docs/API.md)**

---

## Lisensi

Proyek ini dirilis di bawah lisensi **MIT** — lihat berkas [LICENSE](LICENSE).
