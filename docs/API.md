# NexACS REST & WebSocket API Documentation

Dokumentasi ini ditujukan untuk integrasi **NexACS** dengan aplikasi eksternal seperti **Billing ISP**, **CRM / Portal Pelanggan**, **WhatsApp Bot**, atau aplikasi internal NOC lainnya.

---

## 1. Base URL & Transport

| Jalur | URL Default | Keterangan |
| :--- | :--- | :--- |
| **Via Nginx Proxy (Rekomendasi)** | `http://<HOST>:8000/api/v1` | Terintegrasi dengan Web UI & reverse proxy |
| **Direct API Service** | `http://<HOST>:7557/api/v1` | Koneksi langsung antar-server/internal |
| **WebSocket Real-Time** | `ws://<HOST>:8000/ws/v1/events` | Stream event CWMP, summon, task, provisioning |
| **Healthcheck** | `GET /healthz` atau `GET /api/v1/healthz` | Pengecekan status service API |

---

## 2. Autentikasi

NexACS mendukung dua metode autentikasi:

### A. API Key (`X-API-Key`) — Direkomendasikan untuk Aplikasi Eksternal / Server-to-Server
Buat API Key dari menu **Security -> API Keys** atau via `POST /api/v1/api-keys`. Sertakan pada header di setiap request:

```http
X-API-Key: nxk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Daftar Scope API Key (*Least Privilege*)
Saat membuat API Key, pilih scope seminimal mungkin sesuai kebutuhan aplikasi pemanggil:

| Scope | Hak Akses Endpoint |
| :--- | :--- |
| `devices:read` | `overview.view`, `devices.view` (melihat daftar perangkat, detail, tasks, dashboard) |
| `devices:summon` | `devices.view`, `devices.summon` (summon, refresh, ping diagnostics) |
| `provisioning:write` | `devices.view`, `devices.parameters.write` (auto-provisioning & ubah WAN/WiFi/parameter) |
| `devices:write` | Mencakup `devices:read`, `devices:summon`, tulis parameter/WAN/WiFi, dan `devices.reboot` |
| `devices:danger` | `devices.factory_reset`, `devices.delete`, `devices.credentials.edit` |
| `secrets:read` | `devices.secrets.view` (melihat password WiFi/PPPoE/ONT plaintext via reveal) |
| `faults:read` / `faults:write` | Melihat / mengelola faults |
| `firmware:read` / `firmware:write` | Melihat / mengunggah & deploy firmware |
| `settings:read` / `settings:write` | Melihat / mengubah aliases & system settings |
| `security:manage` | Kelola users, roles, API keys, dan audit logs |
| `*` atau `admin` | Akses penuh seluruh permission |

> Anda juga dapat langsung mengisi kode permission spesifik pada array `scopes`, misalnya `["devices.view", "devices.reboot"]`.

### B. Bearer Token (Login User)
Untuk aplikasi klien yang login sebagai pengguna NOC/Teknisi:

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}'
```

Respon:
```json
{
  "success": true,
  "data": {
    "access_token": "<JWT_HMAC_TOKEN>",
    "token_type": "Bearer",
    "expires_in": 3600,
    "user": {
      "username": "admin",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "role": "Super Admin",
      "permissions": ["overview.view", "devices.view", "..."]
    }
  }
}
```

Gunakan token pada header request berikutnya:
```http
Authorization: Bearer <access_token>
```

---

## 3. Format Respon Standar

### Sukses
```json
{
  "success": true,
  "data": { }
}
```
Beberapa endpoint daftar menggunakan key `"items"`:
```json
{
  "success": true,
  "items": [ ]
}
```

### Error
```json
{
  "success": false,
  "error": "pesan error yang jelas"
}
```

Kode status HTTP umum: `200 OK`, `201 Created`, `202 Accepted` (task asinkron ke CPE), `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict` (ONT sedang offline/tidak terjangkau), `429 Too Many Requests` (rate limit login).

---

## 4. Referensi Endpoint

### 4.1 Auth & Profil
| Method | Path | Auth | Keterangan |
| :--- | :--- | :--- | :--- |
| `GET` | `/healthz` | Publik | Health check service |
| `POST` | `/api/v1/auth/login` | Publik | Login username + password (`rate limited`: 10x / 5 menit per IP) |
| `POST` | `/api/v1/auth/logout` | Publik | Logout sesi klien |
| `POST` | `/api/v1/auth/refresh` | Bearer / API Key | Terbitkan ulang token baru (TTL 1 jam) |
| `GET` | `/api/v1/auth/me` | Bearer / API Key | Informasi user, role, dan daftar permission aktif |

---

### 4.2 Dashboard & Agregasi Fleet
Semua endpoint dashboard mengagregasi data di PostgreSQL secara langsung (tidak pernah memicu summon massal ke perangkat):

| Method | Path | Query Params Opsional |
| :--- | :--- | :--- |
| `GET` | `/api/v1/dashboard/overview` | `manufacturer`, `model`, `productClass`, `technology`, `protocol`, `deviceGroup` |
| `GET` | `/api/v1/dashboard/summary` | — (`total_devices`, `online_devices`, `offline_devices`, `never_connected`, `availability_pct`) |
| `GET` | `/api/v1/dashboard/status-distribution` | — |
| `GET` | `/api/v1/dashboard/uptime-distribution` | — |
| `GET` | `/api/v1/dashboard/temperature-distribution` | — |
| `GET` | `/api/v1/dashboard/rx-power-distribution` | — |
| `GET` | `/api/v1/dashboard/technology-distribution` | — |
| `GET` | `/api/v1/dashboard/manufacturer-distribution` | — |
| `GET` | `/api/v1/dashboard/product-class-distribution` | — |
| `GET` | `/api/v1/dashboard/model-distribution` | — |

---

### 4.3 Manajemen Perangkat (`Devices`)

#### Daftar Perangkat + Filter & Pencarian
`GET /api/v1/devices` *(Permission: `devices.view`)*

**Query Parameters:**
- `limit` (default `25`), `offset` atau `page`
- `search`: cari berdasarkan `serial_number`, `manufacturer`, `model_name`, `product_class`, `oui`, `tr_source_ip`, `wan_ip`, atau `pppoe_username`
- `manufacturer`, `model`, `productClass`, `technology` (`GPON` / `EPON` / `Router`), `protocol` (`TR-069` / `TR-369`), `deviceGroup`
- `status`: `online` | `offline` | `never_connected` | `unknown` | `disabled`
- `statusBucket`, `uptimeBucket`, `tempBucket`, `rxBucket`
- `sortBy`: `serialNumber` | `manufacturerCanonical` | `modelName` | `trSourceIp` | `status` | `lastInform`
- `sortDir`: `asc` | `desc`

Contoh:
```bash
curl "http://localhost:8000/api/v1/devices?search=ZTEGC&status=online&limit=20" \
  -H "X-API-Key: nxk_xxx"
```

#### Detail Lengkap Perangkat
`GET /api/v1/devices/{id}` *(Permission: `devices.view`)*

Mengembalikan object `device`, `status`, `matched_alias`, `parameters` (nilai secret otomatis dimask `••••••••`), `tasks`, `faults`, `events`, `sessions`, dan `telemetryHistory`.

#### Summon / Refresh Parameter Perangkat
`POST /api/v1/devices/{id}/summon` atau `/refresh` *(Permission: `devices.summon`)*

```json
{
  "groups": ["optical_health", "wan_summary", "wifi", "connected_hosts"]
}
```
Atau langsung path tertentu:
```json
{
  "paths": ["InternetGatewayDevice.DeviceInfo.", "InternetGatewayDevice.WANDevice.1."]
}
```
Group yang tersedia: `optical_health`, `wan_summary`, `device_info`, `device_health`, `wan`, `wifi`, `connected_hosts`, `credentials`, `vparams`, `parameters`.

#### Batch Summon (Maks. 200 Perangkat)
`POST /api/v1/devices/summon-batch` *(Permission: `devices.summon`)*
```json
{
  "device_ids": ["uuid-1", "uuid-2"],
  "groups": ["vparams"]
}
```

#### Reboot & Factory Reset
- `POST /api/v1/devices/{id}/reboot` *(Permission: `devices.reboot`)*
- `POST /api/v1/devices/{id}/factory-reset` *(Permission: `devices.factory_reset`)*

#### Baca / Tulis Parameter TR-069
- `POST /api/v1/devices/{id}/parameters/get` *(Permission: `devices.view`)*
  ```json
  { "paths": ["InternetGatewayDevice.DeviceInfo.SoftwareVersion"] }
  ```
- `POST /api/v1/devices/{id}/parameters/set` *(Permission: `devices.parameters.write`)*
  ```json
  {
    "path": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
    "value": "WiFi-Pelanggan",
    "value_type": "xsd:string"
  }
  ```
  Atau multi-parameter:
  ```json
  {
    "params": [
      { "path": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", "value": "WiFi-Baru" }
    ]
  }
  ```

#### Tambah Koneksi WAN (PPPoE / IPoE / Bridge)
`POST /api/v1/devices/{id}/wan` *(Permission: `devices.parameters.write`)*
```json
{
  "connectionType": "PPPoE",
  "pppoeUsername": "pelanggan01@isp",
  "pppoePassword": "SecretPassword",
  "vlanType": "tag",
  "vlanId": 100,
  "serviceList": "INTERNET",
  "natEnabled": true
}
```

#### Hapus Koneksi WAN (DeleteObject via VParams + Auto Summon)
`DELETE /api/v1/devices/{id}/wan/{instanceIndex}` *(Permission: `devices.parameters.write`)*

Menentukan target TR-069/TR-181 `DeleteObject` berdasarkan profil Virtual Parameters (`wanRoot` / `WAN*`) dan parameter perangkat, menghapus cache parameter WAN terkait saat selesai, lalu menjalankan `summon` (`vparams`) otomatis. Body/query opsional:
```json
{
  "objectPath": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.",
  "connectionType": "PPPoE"
}
```

#### Update & Reveal Kredensial Perangkat
- `PUT /api/v1/devices/{id}/credentials` *(Permission: `devices.credentials.edit`)*
  - `scope`: `ont_admin` | `ont_user` | `connection_request` | `pppoe`
  ```json
  { "scope": "connection_request", "username": "acs_cpe", "password": "NewCRPassword" }
  ```
- `POST /api/v1/devices/{id}/credentials/reveal` *(Permission: `devices.secrets.view` — dicatat di `audit_logs`)*

#### Ping Diagnostics dari ONT
`POST /api/v1/devices/{id}/diagnostics/ping` *(Permission: `devices.summon`)*
```json
{ "host": "8.8.8.8", "count": 4 }
```

#### Arsipkan / Soft Delete Perangkat
`DELETE /api/v1/devices/{id}` *(Permission: `devices.delete`)*

---

### 4.4 Auto-Provisioning (Integrasi Billing / PSB)
Endpoint paling berguna untuk aplikasi **Billing ISP**: kirim konfigurasi PPPoE, VLAN, dan WiFi berdasarkan **Serial Number** baik sebelum ONT dicolok (`waiting_for_bootstrap`) maupun saat ONT sudah online (`queued_immediately`).

Mendukung format field **camelCase** maupun **snake_case**:

- `GET /api/v1/provisioning` — Daftar profil provisioning *(Permission: `devices.view`)*
- `GET /api/v1/provisioning/{serial}` — Detail profil berdasarkan serial number *(Permission: `devices.view`)*
- `POST /api/v1/provisioning` *(Permission: `devices.parameters.write` / Scope `provisioning:write`)*
- `POST /api/v1/devices/{id}/provision` *(Permission: `devices.parameters.write`)*
- `DELETE /api/v1/provisioning/{serial}` — Hapus profil provisioning *(Permission: `devices.parameters.write`)*

Contoh panggilan dari Billing / PHP / Node.js / Go:
```bash
curl -X POST http://localhost:8000/api/v1/provisioning \
  -H "X-API-Key: nxk_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "serialNumber": "ZTEGC1234567",
    "manufacturer": "ZTE",
    "wanIndex": 1,
    "vlanId": 102,
    "pppoeUsername": "budi.santoso@isp",
    "pppoePassword": "PasswordPPPoE123",
    "wifiIndex": 1,
    "ssid": "Rumah-Budi",
    "ssidKey": "WiFiRahasia123",
    "wifiEnabled": true,
    "periodicInformInterval": 300,
    "autoApplyOnBoot": true
  }'
```

---

### 4.5 Tasks & Faults
| Method | Path | Permission | Query Params / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tasks` | `devices.view` | `?taskType=&status=&search=&limit=` |
| `GET` | `/api/v1/faults` | `faults.view` | `?status=&limit=` |
| `POST` | `/api/v1/faults/{id}/acknowledge` | `faults.manage` | `{"note": "..."}` |
| `POST` | `/api/v1/faults/{id}/resolve` | `faults.manage` | `{"note": "..."}` |
| `DELETE` | `/api/v1/faults/{id}` | `faults.manage` | — |

---

### 4.6 Firmware Management
| Method | Path | Permission | Keterangan |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/firmware` | `firmware.view` | Daftar image firmware & deployment jobs |
| `POST` | `/api/v1/firmware` | `firmware.deploy` | `multipart/form-data`: `file`, `manufacturer`, `modelName`, `version`, optional `productClass`, `hardwareRevision`, `releaseNotes` |
| `POST` | `/api/v1/firmware/{id}/deploy` | `firmware.deploy` | Body: `{"deviceIds": ["uuid-1", "uuid-2"]}` |
| `DELETE` | `/api/v1/firmware/{id}` | `firmware.deploy` | Hapus image dari katalog & disk |

---

### 4.7 Aliases, Users, Roles, API Keys & Settings
- **Manufacturer Aliases:** `GET/POST /api/v1/aliases`, `PUT/DELETE /api/v1/aliases/{id}` (`settings.view` / `settings.manage`)
- **Users:** `GET/POST /api/v1/users`, `PUT/DELETE /api/v1/users/{id}` (`security.users.manage`)
- **Roles & Permissions:** `GET /api/v1/roles`, `PUT /api/v1/roles/{id}/permissions`, `GET /api/v1/permissions` (`security.users.manage`)
- **API Keys:** `GET/POST /api/v1/api-keys`, `DELETE /api/v1/api-keys/{id}` (`security.users.manage`)
- **Audit Logs:** `GET /api/v1/audit-logs` (`security.audit.view`)
- **System Settings:** `GET/PUT /api/v1/settings/{category}` (`general`, `device_status`, `classification`, `protocol`, `auto_summon`)

---

## 5. Real-Time WebSocket Events (`/ws/v1/events`)

Koneksi WebSocket membutuhkan JWT valid:
```text
ws://<HOST>:8000/ws/v1/events?token=<access_token>
```
*(Untuk server-to-server, header `Authorization: Bearer <token>` atau `X-API-Key: <key>` juga didukung.)*

Format payload event yang disiarkan server:
```json
{
  "type": "summon.started",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "device_id": "uuid-perangkat",
  "timestamp": "2026-11-23T14:30:00Z",
  "data": {
    "task_id": "uuid-task",
    "status": "queued"
  }
}
```
Jenis event yang dikirim: `summon.started`, `task.started`, `provisioning.queued_immediately`, `provisioning.waiting_for_bootstrap`.
