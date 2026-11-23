# NexACS --- Product Plan & Technical Blueprint

**Dokumen:** Product Requirements + Technical Plan\
**Versi:** 1.0\
**Tanggal:** 17 November 2026\
**Status:** Draft untuk pengembangan\
**Nama proyek:** NexaACS (working name)\
**Target awal:** Operasional internal ISP, dengan fondasi multi-tenant
untuk SaaS\
**Backend:** Go\
**Frontend:** React + TypeScript + Vite + Material UI\
**Protokol:** TR-069 (CWMP) dan TR-369 (USP)\
**Deployment:** Ubuntu Server, tanpa Docker, dikelola dengan systemd

------------------------------------------------------------------------

# 1. Ringkasan Produk

NexaACS adalah platform untuk mengelola, memantau, mengonfigurasi, dan
melakukan troubleshooting perangkat CPE/ONT pelanggan melalui protokol
broadband management.

Sistem dibangun menggunakan Go sebagai backend dan React sebagai
frontend. Arsitektur menggunakan **Modular Monolith**: satu codebase
utama, domain dan modul terpisah, serta beberapa executable yang dapat
dijalankan sebagai service Linux tersendiri.

Tahap awal berfokus pada TR-069/CWMP agar perangkat dapat terhubung,
mengirim Inform, dibaca parameternya, dan dikelola dari dashboard.
Fondasi TR-369/USP disiapkan sejak awal, kemudian implementasi transport
dan controller dilakukan bertahap.

## 1.1 Tujuan

-   Mengumpulkan seluruh perangkat ONT/CPE dalam satu dashboard.
-   Mengetahui status perangkat dan kapan terakhir perangkat menghubungi
    ACS.
-   Memantau uptime, optical RX power, temperature, IP address,
    teknologi, vendor, dan product class jika parameter tersedia.
-   Melakukan Summon untuk mengambil parameter perangkat sesuai kelompok
    data.
-   Melakukan Refresh untuk memperbarui data yang tersedia.
-   Melakukan remote action seperti reboot, reset, dan konfigurasi
    parameter.
-   Menyediakan riwayat task dan pencatatan kegagalan Summon.
-   Mengelola firmware dan keamanan perangkat.
-   Menyiapkan tenant isolation agar platform dapat dikembangkan menjadi
    SaaS.

## 1.2 Prinsip produk

1.  **Data harus berasal dari perangkat atau sumber yang jelas.** Jangan
    mengarang nilai RX power, temperature, uptime, IP, atau status.
2.  **N/A berbeda dengan 0.** Parameter yang tidak didukung, belum
    diambil, gagal dibaca, dan bernilai nol harus dibedakan.
3.  **Online/offline ditentukan oleh kebijakan last inform yang dapat
    dikonfigurasi.**
4.  **Perintah remote bersifat asynchronous.** Task yang baru masuk
    antrean tidak boleh ditampilkan sebagai berhasil.
5.  **Dukungan vendor/model harus tervalidasi.** Nama vendor saja tidak
    cukup untuk menjamin kompatibilitas.
6.  **Keamanan didahulukan.** Password, credential, firmware, dan
    tindakan berisiko harus dilindungi dan diaudit.

------------------------------------------------------------------------

# 2. Ruang Lingkup dan Prioritas

## 2.1 Menu utama frontend

Menu utama yang ditetapkan:

1.  Overview
2.  Devices
3.  Faults
4.  Firmware
5.  Security
6.  Settings

Menu dapat ditambahkan tanpa mengubah struktur navigasi secara mendasar.
Contoh menu lanjutan: Provisioning, Tasks, Device Models, Reports,
Tenants, dan Audit Logs.

## 2.2 Pemetaan menu

  -----------------------------------------------------------------------
  Menu                    Fungsi utama            Prioritas
  ----------------------- ----------------------- -----------------------
  Overview                Dashboard statistik dan P0
                          distribusi perangkat    

  Devices                 Daftar perangkat,       P0
                          pencarian, filter,      
                          detail, tindakan        

  Faults                  Kegagalan Summon, task, P0
                          komunikasi, dan         
                          diagnosis               

  Firmware                Repository dan          P2
                          deployment firmware     

  Security                Credential, akses,      P1
                          trust, dan kebijakan    
                          keamanan                

  Settings                Konfigurasi sistem,     P1
                          klasifikasi, pengguna,  
                          dan preferensi          
  -----------------------------------------------------------------------

P0 = wajib untuk MVP; P1 = penting setelah fondasi MVP; P2 = tahap
lanjutan.

------------------------------------------------------------------------

# 3. Overview --- Dashboard

Overview menjadi halaman pertama setelah pengguna login. Tujuannya
memberikan gambaran kondisi seluruh perangkat secara cepat dan
menyediakan filter/drill-down ke daftar Devices.

## 3.1 Summary cards

Dashboard menampilkan:

  -----------------------------------------------------------------------
  Card                                Definisi
  ----------------------------------- -----------------------------------
  Total Devices                       Jumlah perangkat terdaftar yang
                                      tidak dihapus

  Online                              Perangkat dengan last inform masih
                                      dalam batas online

  Offline                             Perangkat dengan last inform
                                      melewati batas online

  Availability                        Persentase perangkat online
                                      terhadap total perangkat yang
                                      dihitung
  -----------------------------------------------------------------------

Rumus availability:

`Availability (%) = (Online Devices / Total Eligible Devices) × 100`

Ketentuan: - Jika total perangkat 0, tampilkan N/A, bukan pembagian
dengan nol. - Perangkat yang dihapus atau dinonaktifkan tidak dihitung
dalam total eligible. - Perangkat yang belum pernah Inform harus
ditampilkan dalam kategori `Never Connected` atau `Unknown`, bukan
otomatis dianggap offline lama. - Definisi ini harus konsisten di
seluruh dashboard dan tabel Devices.

## 3.2 Distribusi status berdasarkan lama offline

Dashboard menyediakan distribusi:

-   Online
-   Offline \> 30 menit
-   Offline \> 2 jam
-   Offline \> 1 hari
-   Offline \> 1 minggu
-   Offline \> 1 bulan

**Aturan kategorisasi yang direkomendasikan:** kategori offline dibuat
saling eksklusif agar totalnya tidak menghitung perangkat yang sama
berulang kali.

  Kategori                  Usulan rentang berdasarkan umur last inform
  ------------------------- ---------------------------------------------
  Online                    Umur last inform \<= online threshold
  Offline 30 menit--2 jam   \> 30 menit sampai \<= 2 jam
  Offline 2--24 jam         \> 2 jam sampai \<= 24 jam
  Offline 1--7 hari         \> 1 hari sampai \<= 7 hari
  Offline 7--30 hari        \> 7 hari sampai \<= 30 hari
  Offline \> 1 bulan        \> 30 hari
  Never Connected           Belum pernah menerima Inform

Catatan: permintaan awal menyebut label `offline > 30 menit`, `> 2 jam`,
`> 1 hari`, `> 1 minggu`, dan `> 1 bulan`. Implementasi UI boleh
menggunakan label tersebut, tetapi query dan chart sebaiknya memakai
bucket eksklusif di atas. Batas online threshold harus dapat diubah
melalui Settings. Nilai awal yang disarankan untuk konfigurasi adalah 30
menit, tetapi harus dapat disesuaikan dengan Periodic Inform Interval
dan perilaku perangkat di jaringan.

## 3.3 Distribusi uptime

Dashboard menampilkan distribusi uptime perangkat berdasarkan nilai
uptime terakhir yang berhasil dibaca.

Kategori awal yang perlu didukung: - 1--12 jam - 12--24 jam - 1--7
hari - 7--30 hari - \> 1 bulan - N/A / belum tersedia

Catatan interpretasi: daftar awal pengguna menyebut `1–12 jam`,
`1–24 jam`, `1–7 hari`, dan `> 1 bulan`. Rentang `1–12 jam` berada di
dalam `1–24 jam`, sehingga untuk chart yang totalnya harus konsisten,
gunakan bucket non-overlap di atas. Jika memang dibutuhkan tampilan
kumulatif, label dan perhitungannya harus dibedakan dari distribusi.

Uptime bukan umur perangkat dan bukan lama perangkat online menurut ACS.
Uptime adalah nilai dari parameter perangkat, misalnya
`Device.DeviceInfo.UpTime` atau padanan data model/vendor. Simpan waktu
pengambilan nilai agar pengguna mengetahui kesegarannya.

## 3.4 Distribusi temperature

Kategori:

  Kategori   Kondisi
  ---------- --------------------------------------------------
  Normal     \< 45 °C
  Warning    45--55 °C
  Critical   \> 55 °C (mencakup 56 °C ke atas)
  N/A        Tidak didukung, belum diambil, atau gagal dibaca

Pengguna menyebut kategori `> 56`. Agar nilai 55--56 tidak ambigu,
aturan awal yang dipakai adalah `> 55 °C`, sehingga 56 °C masuk
Critical. Nilai batas harus bisa dikonfigurasi. Jangan menampilkan
satuan jika sumber parameter tidak jelas; normalisasi ke °C bila
konversi satuan diketahui.

## 3.5 Distribusi optical RX power

Satuan: dBm.

Kategori yang diminta:

  Kategori          Rentang
  ----------------- ------------------------
  Sangat kuat       RX \> -12 dBm
  Baik              -20 dBm sampai -13 dBm
  Perlu perhatian   -24 dBm sampai -21 dBm
  Lemah             -26 dBm sampai -25 dBm
  Sangat lemah      RX \< -27 dBm
  N/A               Tidak tersedia

**Penting:** daftar awal menggunakan batas `< -12`, `-13 sampai -20`,
`-21 sampai -24`, `-25 sampai -26`, dan `> -27`. Dalam dBm, urutan
numerik berlawanan dengan intuisi kekuatan sinyal: -10 dBm lebih kuat
daripada -20 dBm. Implementasi harus menetapkan interval yang tidak
tumpang tindih dan memutuskan nilai tepat -12, -20, -21, -24, -25, -26,
dan -27 masuk bucket mana. Rekomendasi interval operasional:

-   `RX >= -12`
-   `-20 <= RX < -12`
-   `-24 <= RX < -20`
-   `-27 <= RX < -24`
-   `RX < -27`

Rentang ini merupakan normalisasi teknis untuk menghilangkan celah pada
nilai desimal. Ambang batas tetap perlu divalidasi dengan standar/vendor
dan kebijakan jaringan ISP. Jangan menganggap semua ONT melaporkan
optical power dengan path atau kalibrasi yang sama.

## 3.6 Distribusi teknologi

Kategori awal: - EPON - GPON - Router - N/A

Teknologi harus ditentukan dari data model, informasi model perangkat,
OUI/product class, atau mapping model yang sudah diverifikasi. Jangan
menyimpulkan GPON/EPON hanya dari IP atau nama vendor.

Simpan nilai mentah dan nilai normalisasi: - `technology_raw` -
`technology_normalized`

## 3.7 Distribusi manufacturer

Daftar awal yang harus dapat dikelola:

-   ZTE
-   Huawei
-   Fiberhome
-   GM
-   Xtetch
-   Bnetfit
-   Dual Band
-   D-Link
-   TP-Link
-   Nokia
-   VSOL
-   Raisecom
-   Lainnya
-   N/A

Daftar ini adalah seed data, bukan daftar tertutup. Beberapa nama
mungkin merupakan label merek lokal, distributor, product class, atau
kategori pemasaran, bukan manufacturer resmi yang dikirim CPE. Oleh
karena itu, simpan: - Manufacturer raw dari perangkat. - Manufacturer
canonical hasil mapping. - OUI. - Mapping alias. - Sumber/tingkat
keyakinan mapping.

Admin dapat menambah dan mengubah alias melalui Settings.

## 3.8 Distribusi product class dan model

Dashboard menampilkan: - Top Product Class berdasarkan jumlah
perangkat. - Top Model berdasarkan jumlah perangkat. - Manufacturer →
Product Class → Model sebagai drill-down filter.

Product class diambil dari Inform CWMP atau identitas perangkat USP jika
tersedia. Model dapat berasal dari `DeviceInfo.ModelName`, product
class, dan katalog model internal. Jangan menyamakan `ProductClass`
dengan `ModelName`.

## 3.9 Filter dashboard

Filter yang disediakan: - Rentang waktu / snapshot. - Manufacturer. -
Model. - Product Class. - Technology. - Status. - Kelompok perangkat
(jika fitur group aktif).

Klik chart/card harus membuka Devices dengan filter yang sesuai.

## 3.10 Perilaku dashboard

-   Data dashboard berasal dari agregasi database, bukan meminta semua
    ONT melakukan Summon setiap kali halaman dibuka.
-   Tampilkan `Last data update` dan status kesegaran data.
-   Refresh dashboard hanya memperbarui agregasi backend.
-   Summon adalah tindakan aktif untuk meminta data perangkat; bukan
    sinonim refresh dashboard.
-   Chart harus menampilkan jumlah dan persentase.
-   Kategori N/A harus terlihat agar perangkat yang belum menyediakan
    parameter tidak hilang dari statistik.

------------------------------------------------------------------------

# 4. Devices --- Device Management

## 4.1 Daftar perangkat

Kolom wajib:

  -----------------------------------------------------------------------
  Kolom                               Sumber / definisi
  ----------------------------------- -----------------------------------
  Serial Number                       Identitas perangkat

  Manufacturer                        Manufacturer canonical/raw

  Model                               Model name

  Product Class                       Product class dari protokol

  IP Address TR                       IP sumber koneksi CPE atau alamat
                                      koneksi yang terverifikasi

  RX Power                            Optical receive power dalam dBm

  PPPoE Username                      Parameter WAN/PPPoE jika tersedia

  Status                              Online / Offline / Never Connected
                                      / Unknown

  Last Inform                         Waktu Inform terakhir diterima
  -----------------------------------------------------------------------

Kolom tambahan yang dapat diaktifkan: - Technology - Uptime -
Temperature - Hardware Version - Software Version - OUI - Connection
Request URL (hanya untuk role berwenang) - Device Group - Protocol
(TR-069/USP) - Last Summon - Last successful parameter sync

`IP Address TR` perlu didefinisikan secara eksplisit. Rekomendasi:
tampilkan IP sumber koneksi TR-069/USP yang diamati server, dan simpan
terpisah dari WAN IP yang dilaporkan parameter perangkat. Label UI
sebaiknya `TR-069/USP Source IP` agar tidak tertukar dengan WAN IP.

## 4.2 Fitur tabel

-   Search serial number.
-   Search IP address.
-   Search PPPoE username.
-   Filter manufacturer.
-   Filter model.
-   Filter product class.
-   Filter technology.
-   Filter online/offline.
-   Filter RX power.
-   Filter last inform.
-   Sort setiap kolom yang relevan.
-   Pagination server-side.
-   Column visibility.
-   Export CSV (fitur lanjutan).
-   Bulk selection untuk tindakan yang aman dan dibatasi permission.

## 4.3 Status perangkat

Status operasional: - `Online`: last inform masih berada dalam online
threshold. - `Offline`: last inform melewati threshold. -
`Never Connected`: belum pernah mengirim Inform/terdaftar melalui
protokol. - `Unknown`: data status tidak cukup atau status belum dapat
ditentukan. - `Disabled`: perangkat dinonaktifkan admin (status
administratif terpisah).

Simpan `last_inform_at`, `online_threshold_seconds`, `last_seen_source`,
dan status hasil kalkulasi. Status sebaiknya dihitung dari last inform
dan threshold, bukan hanya mengandalkan flag yang mungkin basi.

------------------------------------------------------------------------

# 5. Device Detail --- Acuan Screenshot

Halaman detail mengikuti tiga screenshot yang diberikan. Tujuan utamanya
adalah memberi teknisi informasi ringkas, tindakan cepat, konfigurasi,
dan parameter perangkat dalam satu halaman.

## 5.1 Header

Tampilkan: - Tombol kembali. - Badge status Online/Offline. - Serial
Number sebagai judul. - Manufacturer + Model/Product Class sebagai
subjudul. - Tombol `Summon`. - Tombol `Refresh`.

### Summon

Summon adalah proses pengambilan parameter perangkat secara aktif.
Sistem membuat task/operation untuk membaca kelompok parameter yang
dibutuhkan.

Kelompok data yang dapat diambil: - Device Information. - Device
Health. - WAN Connections. - WiFi Configuration. - Connected Hosts. -
Parameter tree / parameter list.

Perilaku: 1. User klik Summon. 2. Backend membuat summon job dan task
terkait. 3. Jika perangkat online, ACS mencoba Connection Request (jika
tersedia dan aman) atau menunggu sesi CPE berikutnya. 4. Saat sesi
aktif, ACS meminta parameter yang dibutuhkan. 5. Hasil disimpan ke
database. 6. UI menampilkan progress dan waktu data terakhir diperbarui.
7. Jika gagal, buat Fault dengan alasan dan correlation/task ID.

Summon tidak boleh mengklaim berhasil hanya karena request diterima API.

### Refresh

Refresh memperbarui tampilan menggunakan data terbaru yang sudah
tersimpan di backend dan mengambil ulang status/metadata yang dapat
diperbarui tanpa memicu full summon. Jika implementasi membutuhkan
request ke perangkat, tampilkan sebagai task dan jelaskan cakupannya.

Pisahkan: - `Refresh UI/data`: reload data dari backend. -
`Refresh device parameters`: request parameter dari perangkat. -
`Summon`: kumpulan pengambilan parameter yang ditentukan.

Hindari tiga tombol yang melakukan hal sama.

## 5.2 ONT Information

Card menampilkan:

-   Serial
-   OUI
-   Manufacturer
-   Product
-   Model
-   HW Version
-   SW Version
-   IP Address

Nilai yang tidak tersedia ditampilkan `N/A` atau `-` dengan tooltip yang
menjelaskan statusnya jika memungkinkan.

## 5.3 Device Health

Card menampilkan: - Uptime - RX dBm - Temperature

Setiap nilai memiliki: - Nilai terakhir. - Unit. - Waktu terakhir
diperbarui. - Indikator kategori/threshold. - N/A jika tidak tersedia.

Nilai RX dan temperature harus berasal dari parameter yang sudah
dipetakan untuk model perangkat terkait.

## 5.4 Actions

Tindakan yang ditampilkan: - Reboot - Reset - Delete

Ketentuan: - Reboot meminta konfirmasi dan membuat task. - Reset berarti
Factory Reset; wajib konfirmasi tambahan dan permission khusus. - Delete
adalah penghapusan record dari platform, bukan factory reset perangkat.
Gunakan soft delete/archival terlebih dahulu. Tampilkan peringatan bahwa
perangkat mungkin akan muncul kembali saat menghubungi ACS jika
enrollment masih diizinkan. - Semua tindakan dicatat di audit log. - UI
menunjukkan queued, executing, success, failed, timeout, atau waiting
for device.

## 5.5 Modem Credentials

Card menampilkan: - Admin Username - Admin Password - User Username -
User Password

Aturan keamanan: - Password selalu masked secara default. - Reveal hanya
melalui tombol dengan permission khusus. - Reveal dicatat di audit
log. - Credential dienkripsi saat disimpan, bukan plaintext. - Jangan
pernah mengirim password ke endpoint list umum jika tidak diperlukan. -
Jangan menyimpan password di log, task error, analytics, atau WebSocket
event. - Sediakan rotasi dan pembaruan credential. - Bedakan credential
ACS/Connection Request dari credential login web admin ONT dan PPPoE.

## 5.6 WAN Connections

Card menampilkan informasi WAN setelah parameter berhasil diambil: -
Connection name / instance. - Connection type (PPPoE, IPoE, Bridge,
sesuai data). - Enable/status. - WAN IP. - Gateway. - DNS. - PPPoE
username (jika tersedia). - VLAN ID (jika tersedia). - NAT status (jika
tersedia).

Jika belum ada data: `No WAN configuration data. Click Summon to fetch.`
atau teks yang setara, dengan tombol/aksi yang jelas.

Password PPPoE tidak ditampilkan secara default. Jika perlu disimpan
untuk fungsi tertentu, perlakukan sebagai secret.

## 5.7 WiFi Configuration

Tampilkan setiap radio/SSID yang ditemukan: - SSID. - Enable. -
Band/frequency (2.4 GHz / 5 GHz jika tersedia). - Security mode. -
Channel. - Channel width. - Broadcast SSID. - Associated client count
jika tersedia.

Password WiFi harus masked dan reveal dibatasi permission. Sediakan edit
SSID/password sebagai task asynchronous, dengan validasi panjang dan
karakter.

## 5.8 Connected Hosts

Tampilkan daftar client/host: - Hostname. - MAC address. - IP address. -
Interface/SSID. - Connection type (Ethernet/WiFi jika diketahui). -
Active status. - Last seen jika tersedia.

Jangan menganggap data host lengkap jika perangkat tidak mendukung
parameter host table.

## 5.9 Task History

Tampilkan: - Waktu. - Task type. - Peminta. - Protocol. - Status. -
Durasi. - Ringkasan hasil/fault. - Detail task.

Task history dapat difilter berdasarkan status dan jenis tindakan.

## 5.10 All Parameters

Mengikuti screenshot, bagian parameter berada di bawah detail utama.

Fitur: - Total parameter yang diketahui. - Search/filter parameter
path. - Kolom Name dan Value. - Pagination atau virtual scrolling. -
Expand/collapse object tree (fitur lanjutan). - Tampilkan tipe data dan
waktu update. - Tampilkan sumber protokol dan status pembacaan. - Copy
parameter path/value. - Permission untuk edit parameter.

Parameter harus ditampilkan sebagai path penuh, misalnya: -
`InternetGatewayDevice.DeviceInfo.HardwareVersion` -
`InternetGatewayDevice.DeviceInfo.SoftwareVersion` -
`InternetGatewayDevice.ManagementServer.ConnectionRequestURL` -
`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANIPConnection.1.ExternalIPAddress`

Contoh di atas menggunakan TR-098/InternetGatewayDevice. Perangkat
TR-181 dapat memakai root `Device.`. Jangan memaksa seluruh perangkat
memakai satu root data model.

------------------------------------------------------------------------

# 6. Faults --- Summon & Operation Failures

Menu Faults menampilkan kegagalan operasi yang perlu ditindaklanjuti
teknisi/admin. Fokus awal adalah kegagalan Summon sesuai kebutuhan
produk, tetapi desain harus dapat menampung kegagalan task dan
komunikasi lainnya.

## 6.1 Kategori fault

-   Summon failed.
-   Inform/session failure.
-   Connection Request failed.
-   Parameter read failed.
-   Parameter write failed.
-   Reboot failed.
-   Factory reset failed.
-   Firmware download/upgrade failed.
-   USP message/transport failure.
-   Timeout.
-   Authentication/authorization failure.
-   Device not reachable.
-   Unsupported parameter/RPC.

## 6.2 Kolom Faults

  Kolom                  Keterangan
  ---------------------- -------------------------------------------
  Fault ID               ID unik
  Created At             Waktu terjadi
  Device Serial          Perangkat terkait
  Manufacturer / Model   Identitas perangkat
  IP Address             IP sumber terakhir
  Operation              Summon / Reboot / Set Parameter / lainnya
  Protocol               TR-069 / TR-369
  Error Code             Kode fault jika tersedia
  Error Message          Ringkasan penyebab
  Status                 Open / Acknowledged / Resolved / Ignored
  Retry Count            Jumlah percobaan
  Last Attempt           Percobaan terakhir

## 6.3 Detail fault

Detail fault harus menyediakan: - Device identity. - Task/summon job
ID. - Waktu mulai dan selesai. - Protocol/session/message correlation
ID. - RPC/operation. - Parameter yang gagal (jika relevan). - Error code
dan sanitized error message. - Retry history. - Log teknis yang sudah
disanitasi. - Tombol Retry jika operation aman untuk diulang. -
Acknowledge dan Resolve.

Jangan menyimpan credential atau secret di error message. Fault tidak
selalu berarti perangkat rusak; fault dapat berasal dari timeout, sesi
belum tersedia, parameter tidak didukung, atau autentikasi.

## 6.4 Retry policy

-   Retry otomatis hanya untuk error transient yang aman.
-   Gunakan exponential backoff dan batas percobaan.
-   Jangan otomatis mengulang Factory Reset atau tindakan destruktif.
-   Retry manual memerlukan permission dan membuat audit log.
-   Fault resolved jika operasi berhasil atau ditutup secara manual
    dengan alasan.

------------------------------------------------------------------------

# 7. Firmware

Fitur yang direncanakan:

-   Upload firmware image.
-   Metadata vendor, model, product class, hardware revision.
-   Firmware version.
-   File size.
-   SHA-256 checksum.
-   Digital signature validation jika tersedia.
-   Release notes.
-   Compatibility status.
-   Deployment job.
-   Target device/group.
-   Scheduled rollout.
-   Batch size dan concurrency limit.
-   Progress dan result.
-   Rollback guidance jika vendor mendukung.

Validasi kompatibilitas wajib dilakukan sebelum firmware dikirim. Jangan
mengirim firmware berdasarkan manufacturer saja.

------------------------------------------------------------------------

# 8. Security

Menu Security mengelola keamanan platform dan perangkat.

## 8.1 Platform security

-   Users, roles, permissions.
-   Session/token management.
-   API keys.
-   Login history.
-   Audit log.
-   Password policy.
-   Rate limiting.
-   Tenant access boundary.
-   Secret encryption/key rotation.

## 8.2 Device security

-   ACS credential.
-   Connection Request username/password.
-   USP Controller trust.
-   Certificate management.
-   Device enrollment/allowlist.
-   Credential rotation.
-   Firmware integrity.
-   Suspicious device activity.

## 8.3 Permission berisiko tinggi

Permission terpisah untuk: - View device secrets. - Edit device
credentials. - Reboot. - Factory reset. - Delete/archive device. -
Deploy firmware. - Manage trust/certificates. - Manage users and roles.

------------------------------------------------------------------------

# 9. Settings

Settings harus modular dan dapat diperluas.

## 9.1 General

-   System name.
-   Timezone.
-   Date/time format.
-   Default pagination.
-   Data retention.

## 9.2 Device status

-   Online threshold.
-   Periodic Inform expectation.
-   Never Connected policy.
-   Offline buckets.
-   Status recalculation interval.

## 9.3 Device classification

-   Manufacturer alias mapping.
-   Technology mapping.
-   Product class mapping.
-   Model catalog.
-   Vendor OUI catalog.
-   RX power thresholds.
-   Temperature thresholds.
-   Uptime buckets.

## 9.4 Protocol

-   CWMP endpoint configuration.
-   Supported CWMP versions.
-   Session timeout.
-   Connection Request policy.
-   USP MTP settings.
-   USP Controller identity.
-   Trust/certificate settings.

## 9.5 Users and roles

-   User management.
-   Role management.
-   Permission matrix.
-   Login/session policy.

## 9.6 Integrations (future)

-   Billing system.
-   RADIUS.
-   MikroTik.
-   Telegram/email notifications.
-   External monitoring.

------------------------------------------------------------------------

# 10. Data Model dan Parameter Mapping

ACS harus mendukung lebih dari satu data model.

## 10.1 Data model

-   TR-098: `InternetGatewayDevice.`
-   TR-181: `Device.`
-   Vendor-specific extensions.

## 10.2 Canonical parameter mapping

Buat katalog parameter internal yang memetakan beberapa path vendor/data
model ke satu key canonical.

Contoh:

  Canonical key                  Contoh sumber
  ------------------------------ ----------------------------------
  `device.serial_number`         DeviceInfo.SerialNumber
  `device.manufacturer`          DeviceInfo.Manufacturer
  `device.model_name`            DeviceInfo.ModelName
  `device.hardware_version`      DeviceInfo.HardwareVersion
  `device.software_version`      DeviceInfo.SoftwareVersion
  `device.uptime_seconds`        DeviceInfo.UpTime
  `device.temperature_celsius`   Vendor-specific temperature path
  `optical.rx_power_dbm`         Vendor-specific optical RX path
  `wan.external_ip`              WAN IP connection path
  `wan.pppoe_username`           WAN PPP connection username
  `wifi.ssid`                    WiFi SSID path
  `wifi.security_key`            WiFi security key path

Mapping harus menyimpan: - Protocol. - Data model version. -
Manufacturer/model scope. - Source parameter path. - Canonical key. -
Data type. - Unit. - Transform/normalization rule. - Read/write
capability. - Validated firmware/model range.

## 10.3 Parameter value state

Bedakan: - `available`: berhasil dibaca. - `unsupported`: perangkat
menyatakan parameter tidak didukung. - `not_fetched`: belum pernah
diminta. - `read_failed`: permintaan gagal. - `stale`: pernah dibaca,
tetapi sudah melewati freshness policy. - `redacted`: sengaja tidak
dikirim ke user karena secret.

Simpan `last_success_at`, `last_attempt_at`, `source_protocol`, dan
`source_session_id`.

------------------------------------------------------------------------

# 11. Rancangan Database / ERD

Database utama PostgreSQL. Semua tabel domain tenant-owned harus
memiliki `tenant_id` atau hubungan yang memastikan tenant scope dapat
ditegakkan.

## 11.1 Entitas utama

  Tabel                         Fungsi
  ----------------------------- -------------------------------------
  tenants                       ISP/organisasi
  users                         Pengguna
  roles                         Role
  permissions                   Permission
  user_roles                    Relasi user-role
  role_permissions              Relasi role-permission
  devices                       Perangkat
  device_models                 Katalog model
  device_manufacturer_aliases   Mapping nama manufacturer
  data_models                   TR-098/TR-181/vendor model
  parameter_definitions         Definisi canonical/source parameter
  model_parameter_mappings      Mapping parameter per model
  device_parameters             Nilai parameter terkini
  parameter_history             Riwayat nilai
  device_events                 Event perangkat
  protocol_sessions             Riwayat sesi protokol
  usp_endpoints                 USP endpoint dan transport metadata
  tasks                         Task remote
  task_attempts                 Percobaan task
  task_logs                     Log task
  summon_jobs                   Operasi Summon
  faults                        Fault/operation failure
  device_groups                 Grup perangkat
  device_group_members          Anggota grup
  firmware_files                Metadata firmware
  firmware_jobs                 Deployment firmware
  audit_logs                    Audit aktivitas
  system_settings               Konfigurasi sistem
  api_keys                      API key
  device_credentials            Credential terenkripsi

## 11.2 ERD konseptual

``` mermaid
erDiagram
    TENANTS ||--o{ USERS : has
    TENANTS ||--o{ DEVICES : owns
    TENANTS ||--o{ DEVICE_GROUPS : owns
    TENANTS ||--o{ TASKS : owns
    TENANTS ||--o{ FAULTS : owns
    TENANTS ||--o{ FIRMWARE_FILES : owns

    USERS ||--o{ USER_ROLES : assigned
    ROLES ||--o{ USER_ROLES : includes
    ROLES ||--o{ ROLE_PERMISSIONS : grants
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : defines

    DEVICE_MODELS ||--o{ DEVICES : identifies
    DEVICE_MODELS ||--o{ MODEL_PARAMETER_MAPPINGS : maps
    DATA_MODELS ||--o{ MODEL_PARAMETER_MAPPINGS : defines

    DEVICES ||--o{ DEVICE_PARAMETERS : has
    DEVICES ||--o{ PARAMETER_HISTORY : tracks
    DEVICES ||--o{ DEVICE_EVENTS : emits
    DEVICES ||--o{ PROTOCOL_SESSIONS : connects
    DEVICES ||--o{ USP_ENDPOINTS : exposes
    DEVICES ||--o{ TASKS : receives
    DEVICES ||--o{ SUMMON_JOBS : summoned
    DEVICES ||--o{ FAULTS : generates
    DEVICES ||--o{ DEVICE_GROUP_MEMBERS : belongs

    DEVICE_GROUPS ||--o{ DEVICE_GROUP_MEMBERS : contains
    TASKS ||--o{ TASK_ATTEMPTS : retries
    TASKS ||--o{ TASK_LOGS : records
    SUMMON_JOBS ||--o{ TASKS : creates
    FIRMWARE_FILES ||--o{ FIRMWARE_JOBS : deploys
    DEVICES ||--o{ FIRMWARE_JOBS : receives

    TENANTS {
      uuid id PK
      varchar name
      varchar slug
      varchar status
      timestamptz created_at
    }
    USERS {
      uuid id PK
      uuid tenant_id FK
      varchar email
      varchar password_hash
      varchar status
    }
    ROLES {
      uuid id PK
      uuid tenant_id FK
      varchar name
    }
    PERMISSIONS {
      uuid id PK
      varchar code
      varchar description
    }
    USER_ROLES {
      uuid user_id FK
      uuid role_id FK
    }
    ROLE_PERMISSIONS {
      uuid role_id FK
      uuid permission_id FK
    }
    DEVICE_MODELS {
      uuid id PK
      varchar manufacturer
      varchar model_name
      varchar product_class
      varchar oui
      varchar technology
    }
    DATA_MODELS {
      uuid id PK
      varchar name
      varchar version
    }
    MODEL_PARAMETER_MAPPINGS {
      uuid id PK
      uuid model_id FK
      uuid data_model_id FK
      varchar canonical_key
      varchar parameter_path
      varchar value_type
    }
    DEVICES {
      uuid id PK
      uuid tenant_id FK
      uuid model_id FK
      varchar serial_number
      varchar protocol
      varchar status
      inet tr_source_ip
      timestamptz last_inform_at
      timestamptz deleted_at
    }
    DEVICE_PARAMETERS {
      uuid id PK
      uuid device_id FK
      varchar parameter_path
      text value
      varchar value_type
      varchar read_state
      timestamptz last_success_at
    }
    PARAMETER_HISTORY {
      uuid id PK
      uuid device_id FK
      varchar parameter_path
      text old_value
      text new_value
      timestamptz created_at
    }
    DEVICE_EVENTS {
      uuid id PK
      uuid device_id FK
      varchar event_code
      jsonb payload
      timestamptz created_at
    }
    PROTOCOL_SESSIONS {
      uuid id PK
      uuid device_id FK
      varchar protocol
      varchar protocol_version
      varchar status
      timestamptz started_at
      timestamptz ended_at
    }
    USP_ENDPOINTS {
      uuid id PK
      uuid device_id FK
      varchar endpoint_id
      varchar mtp
      varchar status
    }
    TASKS {
      uuid id PK
      uuid tenant_id FK
      uuid device_id FK
      varchar protocol
      varchar task_type
      varchar status
      jsonb payload
      timestamptz scheduled_at
    }
    TASK_ATTEMPTS {
      uuid id PK
      uuid task_id FK
      int attempt_number
      varchar status
      text error_code
      timestamptz started_at
    }
    TASK_LOGS {
      uuid id PK
      uuid task_id FK
      varchar level
      text message
      timestamptz created_at
    }
    SUMMON_JOBS {
      uuid id PK
      uuid device_id FK
      varchar status
      jsonb requested_groups
      timestamptz started_at
      timestamptz completed_at
    }
    FAULTS {
      uuid id PK
      uuid tenant_id FK
      uuid device_id FK
      uuid task_id FK
      uuid summon_job_id FK
      varchar category
      varchar status
      varchar error_code
      text message
      timestamptz created_at
      timestamptz resolved_at
    }
    DEVICE_GROUPS {
      uuid id PK
      uuid tenant_id FK
      varchar name
    }
    DEVICE_GROUP_MEMBERS {
      uuid group_id FK
      uuid device_id FK
    }
    FIRMWARE_FILES {
      uuid id PK
      uuid tenant_id FK
      varchar version
      varchar manufacturer
      varchar model
      varchar checksum_sha256
      text storage_path
    }
    FIRMWARE_JOBS {
      uuid id PK
      uuid firmware_id FK
      uuid device_id FK
      varchar status
    }
    AUDIT_LOGS {
      uuid id PK
      uuid tenant_id FK
      uuid user_id FK
      varchar action
      jsonb metadata
      timestamptz created_at
    }
```

ERD ini konseptual dan akan diturunkan menjadi migration SQL. Tambahkan
unique constraints, foreign keys, tenant-scoped constraints, indexes,
serta aturan soft delete pada implementasi.

## 11.3 Index dan constraint penting

-   Unique `(tenant_id, serial_number)` sesuai kebijakan identitas
    perangkat.
-   Index `(tenant_id, last_inform_at)`.
-   Index `(tenant_id, status)`.
-   Unique `(device_id, parameter_path)` untuk nilai parameter terkini.
-   Index `(device_id, parameter_path, created_at)` untuk history.
-   Index `(tenant_id, status, scheduled_at)` untuk task.
-   Index `(tenant_id, created_at, status)` untuk faults.
-   Index pada manufacturer, model, product class, technology untuk
    filter.
-   Partition parameter history, task logs, dan event tables jika volume
    sudah besar.

------------------------------------------------------------------------

# 12. Arsitektur Backend Go

## 12.1 Executables

Satu repository, beberapa proses:

  -----------------------------------------------------------------------
  Binary                              Tanggung jawab
  ----------------------------------- -----------------------------------
  `nexaacs-api`                       REST API, auth, dashboard,
                                      WebSocket

  `nexaacs-cwmp`                      HTTP/SOAP CWMP server

  `nexaacs-usp`                       USP Controller dan MTP

  `nexaacs-worker`                    Task queue, summon, provisioning,
                                      firmware, cleanup
  -----------------------------------------------------------------------

Semua menggunakan domain/application layer bersama. Proses dapat
dijalankan dan direstart secara terpisah melalui systemd.

## 12.2 Struktur folder Go

``` text
nexaacs/
├── cmd/
│   ├── api/main.go
│   ├── cwmp/main.go
│   ├── usp/main.go
│   └── worker/main.go
├── internal/
│   ├── platform/
│   │   ├── config/
│   │   ├── database/
│   │   ├── redis/
│   │   ├── logger/
│   │   ├── security/
│   │   └── storage/
│   ├── domain/
│   │   ├── device/
│   │   ├── parameter/
│   │   ├── task/
│   │   ├── fault/
│   │   ├── firmware/
│   │   ├── tenant/
│   │   ├── user/
│   │   └── datamodel/
│   ├── application/
│   │   ├── dashboard/
│   │   ├── device/
│   │   ├── summon/
│   │   ├── task/
│   │   ├── fault/
│   │   ├── provisioning/
│   │   └── firmware/
│   ├── protocol/
│   │   ├── cwmp/
│   │   │   ├── server/
│   │   │   ├── session/
│   │   │   ├── soap/
│   │   │   ├── rpc/
│   │   │   ├── event/
│   │   │   └── fault/
│   │   ├── usp/
│   │   │   ├── controller/
│   │   │   ├── record/
│   │   │   ├── message/
│   │   │   ├── mtp/
│   │   │   └── security/
│   │   └── common/
│   │       ├── datamodel/
│   │       └── mapping/
│   ├── infrastructure/
│   │   ├── persistence/postgres/
│   │   ├── queue/
│   │   ├── cache/
│   │   ├── storage/
│   │   └── scheduler/
│   ├── delivery/
│   │   ├── http/
│   │   │   ├── handler/
│   │   │   ├── middleware/
│   │   │   ├── request/
│   │   │   └── response/
│   │   └── websocket/
│   └── worker/
│       ├── task/
│       ├── summon/
│       ├── firmware/
│       └── cleanup/
├── migrations/
├── data-models/
│   ├── tr-098/
│   ├── tr-181/
│   ├── vendor/
│   └── schemas/
├── configs/
├── deployments/
│   ├── systemd/
│   └── nginx/
├── scripts/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── protocol/
│   └── fixtures/
├── docs/
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

## 12.3 Rekomendasi library

  Kebutuhan           Pilihan
  ------------------- ----------------------------------------
  HTTP router         Chi
  PostgreSQL driver   pgx
  SQL generation      sqlc
  Migration           golang-migrate
  Redis               go-redis
  XML                 encoding/xml + SOAP/CWMP layer sendiri
  Logging             zap atau slog
  Config              Viper atau envconfig
  WebSocket           coder/websocket
  Metrics             Prometheus client
  Validation          go-playground/validator
  USP serialization   Protobuf sesuai USP specification

Pilih dependency yang versi dan lisensinya telah ditinjau. Jangan
mengasumsikan library protobuf generik sudah menjadi implementasi USP
lengkap.

------------------------------------------------------------------------

# 13. Spesifikasi CWMP Engine

## 13.1 Endpoint

Contoh: - `https://cwmp.example.net/cwmp` - Port dapat dikonfigurasi. -
HTTPS wajib untuk deployment production. - CPE mengirim HTTP POST berisi
SOAP envelope. - Server memvalidasi content type, ukuran body,
autentikasi, dan struktur XML.

## 13.2 RPC tahap awal

  RPC                      Prioritas
  ------------------------ -----------
  Inform                   P0
  GetRPCMethods            P0
  GetParameterNames        P0
  GetParameterValues       P0
  SetParameterValues       P0
  Reboot                   P0/P1
  FactoryReset             P1
  Download                 P1
  TransferComplete         P1
  AddObject                P1
  DeleteObject             P1
  GetParameterAttributes   P2
  SetParameterAttributes   P2
  Upload                   P2

## 13.3 Session lifecycle

1.  CPE membuka sesi ke ACS.
2.  ACS memvalidasi request dan membaca Inform.
3.  ACS mengidentifikasi/enroll perangkat.
4.  ACS menyimpan event dan parameter identitas.
5.  Session manager menentukan task yang dapat dijalankan.
6.  ACS mengirim RPC dalam urutan yang sesuai.
7.  CPE membalas RPC.
8.  ACS memproses response/fault dan memperbarui task.
9.  Sesi berakhir sesuai aturan CWMP.
10. Session log dan metrik diperbarui.

Implementasi harus memperhatikan: - CWMP version. - SOAP
envelope/header. - `cwmp:ID` dan `mustUnderstand`. - Multiple HTTP
exchanges dalam satu sesi. - HoldRequests. - Session timeout. - Event
codes. - Fault codes. - Empty HTTP response bila sesuai spesifikasi. -
HTTP Digest/authentication sesuai kebutuhan dan kemampuan CPE. -
Connection Request authentication. - Concurrency dan session locking per
device.

## 13.4 Connection Request

-   ACS membaca ConnectionRequestURL dari perangkat.
-   Credential disimpan terenkripsi.
-   Server memvalidasi URL dan mencegah SSRF.
-   Connection Request dikirim hanya ke alamat yang diizinkan.
-   Hasil request tidak dianggap sama dengan hasil RPC.
-   Jika request berhasil diterima tetapi CPE tidak membuka sesi, status
    task tetap menunggu/timeout.

------------------------------------------------------------------------

# 14. Spesifikasi TR-369 / USP

TR-369 harus menjadi protocol module tersendiri.

Komponen: - USP Controller. - USP Record encoder/decoder. - USP Message
encoder/decoder. - Protobuf. - MTP abstraction. - Controller/Agent
endpoint identity. - Trust and certificate management. - Message
correlation. - Retry and expiry. - Notification subscription.

MTP yang dapat ditambahkan: - MQTT - WebSocket - STOMP - CoAP

Implementasikan transport sesuai kebutuhan perangkat target. Untuk MVP
USP, pilih satu MTP berdasarkan perangkat yang benar-benar tersedia
untuk pengujian.

USP operations yang perlu direncanakan: - Get - Set - Operate - Add -
Delete - GetSupportedDM - GetInstances - Subscribe/Notify

TR-069 dan USP dapat berbagi Device Service, canonical parameter
mapping, task abstraction, audit, dan dashboard. Mereka tidak boleh
berbagi parser, session lifecycle, atau transport implementation secara
paksa.

------------------------------------------------------------------------

# 15. REST API

Base path: `/api/v1`

## 15.1 Auth

  Method   Endpoint          Fungsi
  -------- ----------------- ---------------
  POST     `/auth/login`     Login
  POST     `/auth/refresh`   Refresh token
  POST     `/auth/logout`    Logout
  GET      `/auth/me`        Profil

## 15.2 Dashboard

  Method   Endpoint                                  Fungsi
  -------- ----------------------------------------- --------------------------------------
  GET      `/dashboard/summary`                      Total, online, offline, availability
  GET      `/dashboard/status-distribution`          Bucket last inform
  GET      `/dashboard/uptime-distribution`          Bucket uptime
  GET      `/dashboard/temperature-distribution`     Temperature
  GET      `/dashboard/rx-power-distribution`        Optical RX
  GET      `/dashboard/technology-distribution`      EPON/GPON/Router/N/A
  GET      `/dashboard/manufacturer-distribution`    Manufacturer
  GET      `/dashboard/product-class-distribution`   Product class
  GET      `/dashboard/model-distribution`           Model

Semua endpoint dashboard menerima filter umum seperti `manufacturer`,
`model`, `product_class`, `technology`, dan `protocol` bila relevan.

## 15.3 Devices

  Method   Endpoint                         Fungsi
  -------- -------------------------------- ----------------------------
  GET      `/devices`                       List + filter + pagination
  GET      `/devices/:id`                   Detail
  GET      `/devices/:id/health`            Uptime/RX/temp
  GET      `/devices/:id/wan`               WAN connections
  GET      `/devices/:id/wifi`              WiFi configuration
  GET      `/devices/:id/hosts`             Connected hosts
  GET      `/devices/:id/parameters`        Parameter list
  GET      `/devices/:id/parameters/tree`   Parameter tree
  GET      `/devices/:id/sessions`          Session history
  GET      `/devices/:id/events`            Event history
  GET      `/devices/:id/tasks`             Task history
  POST     `/devices/:id/summon`            Buat Summon job
  POST     `/devices/:id/refresh`           Refresh sesuai definisi
  POST     `/devices/:id/reboot`            Reboot task
  POST     `/devices/:id/factory-reset`     Factory reset task
  DELETE   `/devices/:id`                   Soft delete/archive

## 15.4 Parameters

  Method   Endpoint                            Fungsi
  -------- ----------------------------------- -------------------------
  POST     `/devices/:id/parameters/get`       Request parameter read
  POST     `/devices/:id/parameters/set`       Request parameter write
  GET      `/devices/:id/parameters/history`   History

## 15.5 Tasks dan Faults

  Method   Endpoint                    Fungsi
  -------- --------------------------- --------------------------------
  GET      `/tasks`                    List tasks
  GET      `/tasks/:id`                Detail task
  POST     `/tasks/:id/cancel`         Cancel jika masih memungkinkan
  GET      `/faults`                   List faults
  GET      `/faults/:id`               Detail fault
  POST     `/faults/:id/retry`         Retry yang aman
  POST     `/faults/:id/acknowledge`   Acknowledge
  POST     `/faults/:id/resolve`       Resolve

## 15.6 Firmware, Security, Settings

``` text
GET/POST       /firmware
GET            /firmware/:id
POST           /firmware/:id/deploy

GET/POST       /users
GET/POST       /roles
GET            /permissions
GET            /audit-logs

GET/PUT        /settings/general
GET/PUT        /settings/device-status
GET/PUT        /settings/thresholds
GET/PUT        /settings/manufacturers
GET/PUT        /settings/technology-mappings
GET/PUT        /settings/protocols
```

## 15.7 Contoh Summon

Request:

``` http
POST /api/v1/devices/{deviceId}/summon
```

``` json
{
  "groups": [
    "device_info",
    "device_health",
    "wan",
    "wifi",
    "connected_hosts",
    "parameters"
  ]
}
```

Response:

``` json
{
  "success": true,
  "data": {
    "summon_job_id": "uuid",
    "status": "queued",
    "message": "Summon job queued"
  }
}
```

Status final diperbarui setelah komunikasi dengan perangkat selesai.
Kegagalan membuat Fault yang dapat ditelusuri.

## 15.8 WebSocket events

Endpoint: `/ws/v1/events`

Event: - `device.registered` - `device.status.changed` -
`device.inform.received` - `summon.started` - `summon.progress` -
`summon.completed` - `summon.failed` - `task.started` -
`task.completed` - `task.failed` - `fault.created` - `fault.resolved` -
`firmware.progress`

Jangan kirim secret melalui WebSocket.

------------------------------------------------------------------------

# 16. Frontend React

## 16.1 Teknologi

-   React + TypeScript.
-   Vite.
-   Material UI.
-   MUI X Data Grid (cek lisensi dan kebutuhan fitur).
-   TanStack Query.
-   Zustand.
-   React Router.
-   React Hook Form.
-   Zod.
-   Apache ECharts.
-   Axios.
-   WebSocket client.

## 16.2 Struktur folder

``` text
nexaacs-web/
├── public/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   ├── providers.tsx
│   │   └── theme/
│   ├── layouts/
│   │   ├── DashboardLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── Breadcrumbs.tsx
│   ├── components/
│   │   ├── common/
│   │   ├── data-table/
│   │   ├── charts/
│   │   ├── status/
│   │   └── dialogs/
│   ├── features/
│   │   ├── overview/
│   │   ├── devices/
│   │   ├── faults/
│   │   ├── firmware/
│   │   ├── security/
│   │   ├── settings/
│   │   ├── tasks/
│   │   └── provisioning/
│   ├── services/
│   │   ├── api-client.ts
│   │   └── websocket.ts
│   ├── hooks/
│   ├── stores/
│   ├── types/
│   ├── utils/
│   └── main.tsx
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 16.3 UI/UX rules

-   Gunakan Material UI secara konsisten untuk seluruh komponen.
-   Sidebar dan content area memiliki scroll masing-masing.
-   Header tetap mudah diakses.
-   Gunakan layout responsif.
-   Gunakan warna status secara konsisten.
-   Tabel memiliki server-side pagination, sorting, filtering.
-   Jangan menampilkan semua parameter sekaligus jika jumlahnya sangat
    besar; gunakan pagination/virtualization.
-   N/A, stale, failed, dan unsupported harus memiliki tampilan yang
    berbeda.
-   Konfirmasi untuk tindakan destruktif.
-   Tampilkan progress dan status asynchronous.
-   Hindari gradient, glow, dan dekorasi yang tidak diperlukan.
-   Semua halaman memiliki loading, empty, error, dan permission-denied
    state.

------------------------------------------------------------------------

# 17. Queue, Worker, dan Reliability

PostgreSQL menjadi sumber kebenaran task. Redis digunakan untuk queue
distribution, cache, dan koordinasi. Task tidak boleh hilang jika Redis
restart.

Task state: - pending - queued - waiting_for_device - executing -
completed - failed - timeout - cancelled

Persyaratan: - Retry dengan exponential backoff. - Idempotency key. -
Worker heartbeat. - Lease/locking. - Per-device command serialization. -
Dead-letter handling. - Task timeout. - Cancellation. - Recovery setelah
process restart. - Task attempt history.

CWMP task dieksekusi dalam sesi CPE yang tepat. USP task dikirim melalui
MTP dan dilacak dengan correlation ID serta expiry.

------------------------------------------------------------------------

# 18. Deployment Tanpa Docker

## 18.1 Server

Ubuntu Server LTS. Komponen dipasang langsung: - Go toolchain. - Node.js
LTS untuk build frontend. - PostgreSQL. - Redis. - Nginx. - Certbot atau
mekanisme TLS lain. - Prometheus/Grafana/Loki (opsional pada tahap
awal).

## 18.2 Struktur direktori

``` text
/opt/nexaacs/
├── backend/
│   ├── bin/
│   │   ├── nexaacs-api
│   │   ├── nexaacs-cwmp
│   │   ├── nexaacs-usp
│   │   └── nexaacs-worker
│   ├── configs/
│   └── data-models/
└── frontend/
    └── dist/

/etc/nexaacs/
├── config.yaml
└── secrets.env

/var/lib/nexaacs/
├── firmware/
├── backups/
└── uploads/

/var/log/nexaacs/
```

Jalankan service dengan user Linux khusus `nexaacs`, bukan root.

## 18.3 systemd

Service: - `nexaacs-api.service` - `nexaacs-cwmp.service` -
`nexaacs-usp.service` - `nexaacs-worker.service`

Setiap service: - `User=nexaacs` - `Restart=on-failure` atau kebijakan
restart yang sesuai. - `RestartSec` terukur. - Environment/config file
dengan permission ketat. - WorkingDirectory yang benar. - Log ke
journald atau logging pipeline. - Hardening systemd yang telah diuji
kompatibilitasnya.

Frontend React Vite di-build menjadi static files dan disajikan Nginx.
PM2 tidak dibutuhkan untuk frontend static maupun binary Go. systemd
menjadi process manager utama.

## 18.4 Network

Contoh endpoint: - `acs.example.net` --- frontend dan management API. -
`cwmp.example.net` --- CWMP endpoint. - Endpoint USP sesuai MTP yang
digunakan.

PostgreSQL dan Redis hanya listen pada interface internal/localhost atau
jaringan privat yang dibatasi. Jangan membuka port database/cache ke
internet.

## 18.5 Deployment workflow

1.  Checkout release Git.
2.  Build binary Go.
3.  Install frontend dependencies dengan lockfile.
4.  Build frontend.
5.  Jalankan database migration.
6.  Install binary dan frontend build ke release directory.
7.  Update symlink `current`.
8.  Restart service terkait.
9.  Health check.
10. Rollback jika health check gagal.

Sediakan backup PostgreSQL, firmware, konfigurasi, dan secret key. Uji
restore secara berkala.

------------------------------------------------------------------------

# 19. Development Roadmap

Estimasi berikut adalah rencana kasar untuk satu developer fokus; bukan
komitmen waktu. Pengembangan USP dan validasi perangkat dapat
memperpanjang jadwal.

## Phase 0 --- Foundation

**Estimasi: 1--2 minggu**

-   [ ] Git repository.
-   [ ] Go project dan executable.
-   [ ] React/Vite project.
-   [ ] MUI theme dan dashboard layout.
-   [ ] PostgreSQL setup.
-   [ ] Redis setup.
-   [ ] Migration framework.
-   [ ] Configuration management.
-   [ ] Structured logging.
-   [ ] Systemd baseline.
-   [ ] CI/test/build script.

**Acceptance criteria:** API, frontend, PostgreSQL, dan Redis berjalan
di Ubuntu tanpa Docker.

## Phase 1 --- Identity & Device Domain

**Estimasi: 2--3 minggu**

-   [ ] Tenant foundation.
-   [ ] User authentication.
-   [ ] RBAC.
-   [ ] Device entity/repository.
-   [ ] Device model catalog.
-   [ ] Manufacturer alias.
-   [ ] Technology classification.
-   [ ] Canonical parameter mapping foundation.
-   [ ] Device list API.
-   [ ] Device list UI.

**Acceptance criteria:** admin dapat login dan melihat daftar perangkat
dari database.

## Phase 2 --- CWMP MVP

**Estimasi: 4--6 minggu**

-   [ ] HTTP CWMP server.
-   [ ] SOAP envelope parser/generator.
-   [ ] Inform RPC.
-   [ ] Device identity extraction.
-   [ ] CWMP session lifecycle.
-   [ ] Event storage.
-   [ ] GetRPCMethods.
-   [ ] GetParameterNames.
-   [ ] GetParameterValues.
-   [ ] SetParameterValues.
-   [ ] Fault handling.
-   [ ] Integration tests dengan fixture.
-   [ ] Test dengan ONT sungguhan.

**Acceptance criteria:** ONT dapat mengirim Inform, terdaftar, dan data
identitas tersimpan.

## Phase 3 --- Overview & Device Detail

**Estimasi: 3--4 minggu**

-   [ ] Summary cards.
-   [ ] Availability calculation.
-   [ ] Online/offline aging buckets.
-   [ ] Uptime distribution.
-   [ ] Temperature distribution.
-   [ ] RX power distribution.
-   [ ] Technology distribution.
-   [ ] Manufacturer distribution.
-   [ ] Product class/model distribution.
-   [ ] Device table sesuai kolom.
-   [ ] Device detail sesuai screenshot.
-   [ ] Parameter list/filter.
-   [ ] WebSocket update.
-   [ ] Empty/loading/error states.

**Acceptance criteria:** dashboard menampilkan agregasi yang konsisten
dengan daftar perangkat dan nilai parameter tersimpan.

## Phase 4 --- Summon, Tasks & Remote Actions

**Estimasi: 3--5 minggu**

-   [ ] Summon job.
-   [ ] Summon parameter groups.
-   [ ] PostgreSQL-backed task persistence.
-   [ ] Redis queue integration.
-   [ ] Connection Request.
-   [ ] Reboot.
-   [ ] Factory Reset.
-   [ ] Parameter refresh.
-   [ ] Task history.
-   [ ] Retry/timeout.
-   [ ] Fault creation.
-   [ ] Fault detail and retry.
-   [ ] Audit log.

**Acceptance criteria:** Summon dan remote task memiliki status yang
benar, hasil dapat ditelusuri, dan kegagalan tercatat di Faults.

## Phase 5 --- WAN, WiFi, Hosts & Classification

**Estimasi: 2--4 minggu**

-   [ ] WAN parameter mappings.
-   [ ] PPPoE username mapping.
-   [ ] WiFi SSID/security mapping.
-   [ ] Connected host mapping.
-   [ ] RX optical parameter mapping per model.
-   [ ] Temperature mapping per model.
-   [ ] Uptime mapping.
-   [ ] Vendor compatibility matrix.
-   [ ] Device model settings UI.

**Acceptance criteria:** perangkat yang tervalidasi menampilkan data
WAN, WiFi, hosts, dan health dengan sumber yang jelas.

## Phase 6 --- Faults & Security

**Estimasi: 2--3 minggu**

-   [ ] Fault list/detail.
-   [ ] Fault filters.
-   [ ] Acknowledge/resolve.
-   [ ] Safe retry.
-   [ ] Credential encryption.
-   [ ] Secret masking/reveal permission.
-   [ ] Login/audit history.
-   [ ] API rate limiting.
-   [ ] Device enrollment policy.
-   [ ] Security review.

**Acceptance criteria:** fault dapat dikelola dan akses terhadap
secret/action berisiko dibatasi serta diaudit.

## Phase 7 --- Firmware

**Estimasi: 2--4 minggu**

-   [ ] Firmware repository.
-   [ ] Upload.
-   [ ] SHA-256 checksum.
-   [ ] Compatibility metadata.
-   [ ] Deployment job.
-   [ ] Download RPC.
-   [ ] TransferComplete.
-   [ ] Firmware progress/history.
-   [ ] Rollout controls.

**Acceptance criteria:** firmware dapat dikirim hanya ke target yang
kompatibel dan hasil transfer tercatat.

## Phase 8 --- USP Controller

**Estimasi: 4--8+ minggu, tergantung MTP dan perangkat uji**

-   [ ] USP Record codec.
-   [ ] USP Message codec.
-   [ ] Protobuf.
-   [ ] Controller identity.
-   [ ] Trust/certificate.
-   [ ] MTP abstraction.
-   [ ] Pilih dan implementasikan MTP pertama.
-   [ ] Get/Set/Operate.
-   [ ] Notify/subscription.
-   [ ] Correlation/expiry/retry.
-   [ ] USP integration tests.

**Acceptance criteria:** USP Agent yang kompatibel dapat terhubung dan
menjalankan operasi yang didukung.

## Phase 9 --- SaaS Readiness

-   [ ] Tenant onboarding.
-   [ ] Tenant-scoped RBAC.
-   [ ] Tenant isolation test.
-   [ ] Tenant quotas.
-   [ ] API keys.
-   [ ] Usage metrics.
-   [ ] Tenant settings.
-   [ ] Backup/restore.
-   [ ] Load test.
-   [ ] Operational runbooks.

**Acceptance criteria:** dua tenant uji tidak dapat membaca atau
memodifikasi data tenant lain.

------------------------------------------------------------------------

# 20. Testing Strategy

## Unit tests

-   Status/availability calculation.
-   Uptime buckets.
-   RX power classification.
-   Temperature classification.
-   Manufacturer normalization.
-   Parameter mapping.
-   Task state transitions.
-   Tenant authorization.

## Protocol tests

-   SOAP parsing.
-   CWMP session lifecycle.
-   RPC request/response.
-   Fault response.
-   Connection Request.
-   USP Record/Message.
-   Protobuf compatibility.
-   MTP behavior.

## Integration tests

-   Inform → device registration.
-   Summon → parameter storage.
-   Set parameter → response → history.
-   Reboot → task completion/fault.
-   Device offline → waiting/timeout.
-   Redis restart → task recovery.
-   Worker restart → lease recovery.
-   Tenant isolation.

## Hardware compatibility tests

Buat matrix per model dan firmware:

  ---------------------------------------------------------------------------------
  Vendor      Model      Firmware   TR-069     Parameter   Remote     Status
                                               mapping     action     
  ----------- ---------- ---------- ---------- ----------- ---------- -------------
  ZTE         XST99      Catat      Uji        Uji         Uji        Belum
                         versi                                        tervalidasi
                         aktual                                       

  ZTE         F670L      Catat      Uji        Uji         Uji        Belum
                         versi                                        tervalidasi
                         aktual                                       

  Huawei      Model uji  Catat      Uji        Uji         Uji        Belum
                         versi                                        tervalidasi
                         aktual                                       

  Fiberhome   Model uji  Catat      Uji        Uji         Uji        Belum
                         versi                                        tervalidasi
                         aktual                                       
  ---------------------------------------------------------------------------------

Jangan menyatakan vendor/model mendukung fitur sebelum ada hasil
pengujian.

------------------------------------------------------------------------

# 21. Acceptance Criteria MVP

MVP dianggap berhasil jika:

1.  User dapat login.
2.  ONT dapat menghubungi endpoint CWMP.
3.  Inform diterima dan device terdaftar.
4.  Serial, manufacturer, OUI, product class, hardware/software version
    tersimpan jika dikirim.
5.  Last Inform dan status dihitung dengan threshold yang dikonfigurasi.
6.  Overview menampilkan total, online, offline, availability.
7.  Distribusi status, uptime, temperature, RX power, technology,
    manufacturer, product class dapat ditampilkan dengan N/A yang benar.
8.  Devices menampilkan seluruh kolom yang ditentukan.
9.  Device Detail memiliki ONT Information, Device Health, Actions,
    Modem Credentials, WAN, WiFi, Connected Hosts, Task History, dan All
    Parameters.
10. Summon menghasilkan job yang dapat dilacak.
11. Summon failure tercatat di Faults.
12. Reboot dan parameter set berjalan sebagai task asynchronous.
13. Semua tindakan penting tercatat di audit log.
14. Aplikasi berjalan di Ubuntu tanpa Docker menggunakan systemd.
15. Secret tidak terekspos pada list API, log, atau event realtime.

------------------------------------------------------------------------

# 22. Keputusan yang Masih Perlu Divalidasi

Beberapa detail berikut perlu diputuskan sebelum implementasi final:

1.  **Online threshold:** apakah 30 menit menjadi default, atau
    disesuaikan per model/Periodic Inform Interval?
2.  **Uptime buckets:** apakah rentang 1--12 jam dan 1--24 jam
    dimaksudkan sebagai bucket terpisah atau metrik kumulatif?
3.  **RX thresholds:** validasi batas kategori dan penanganan nilai
    desimal dengan data optik aktual.
4.  **Temperature:** apakah threshold 56 °C benar-benar menjadi batas
    Critical?
5.  **IP Address TR:** pastikan yang dimaksud adalah source IP koneksi
    ACS, bukan WAN IP parameter.
6.  **Summon scope:** apakah Summon mengambil semua kelompok parameter
    atau user dapat memilih kelompok?
7.  **Refresh:** tetapkan apakah hanya reload database atau juga request
    parameter ke perangkat.
8.  **Credential scope:** pastikan admin/user credential ONT, PPPoE
    credential, dan Connection Request credential dibedakan.
9.  **USP transport:** pilih MTP pertama berdasarkan perangkat USP Agent
    yang tersedia.
10. **SaaS tenancy:** tentukan apakah tenant mempunyai ACS endpoint
    sendiri atau berbagi endpoint dengan isolasi identitas perangkat.

------------------------------------------------------------------------

# 23. Urutan Implementasi yang Direkomendasikan

Urutan kerja paling aman:

1.  Foundation Go + React + PostgreSQL + Redis, tanpa Docker.
2.  Device domain dan database.
3.  CWMP server menerima Inform dari satu ONT nyata.
4.  Device list dan Device Detail.
5.  Parameter mapping untuk ONT uji.
6.  Overview dan klasifikasi dashboard.
7.  Summon, task queue, dan Faults.
8.  Reboot dan konfigurasi WiFi/WAN.
9.  Security dan audit.
10. Firmware.
11. USP Controller.
12. SaaS readiness.

**Milestone pertama bukan dashboard lengkap. Milestone pertama adalah
satu ONT nyata berhasil mengirim Inform ke CWMP Engine dan tersimpan
sebagai device.** Setelah fondasi itu terbukti, dashboard dan fitur
manajemen dibangun di atas data yang benar-benar tersedia.

------------------------------------------------------------------------

# 24. Referensi Teknis

-   Broadband Forum Technical Library:
    https://www.broadband-forum.org/technical-library
-   TR-181 Device Data Model:
    https://device-data-model.broadband-forum.org/
-   TR-106 Data Model Template:
    https://data-model-template.broadband-forum.org/
-   Go Documentation: https://go.dev/doc/
-   React Documentation: https://react.dev/
-   Vite Documentation: https://vite.dev/
-   Material UI: https://mui.com/
-   PostgreSQL: https://www.postgresql.org/docs/
-   Redis: https://redis.io/docs/
-   systemd: https://systemd.io/

------------------------------------------------------------------------

**Akhir dokumen --- NexaACS Product Plan & Technical Blueprint v1.0**
