# Progress Reporter Kerja

Desktop app untuk Windows yang menjadwalkan dan mengirim update progress harian ke Discord — tanpa copy-paste manual, tanpa webhook server, tanpa ganggu Chrome kerja utama.

Dibangun untuk tim yang punya format report tetap (Login → Progress per jam → Logout) dan butuh scheduler yang tetap jalan meski monitor mati atau screensaver aktif.

---

## Masalah yang diselesaikan

Update progress harian di Discord sering jadi pekerjaan repetitif:

- Mengetik format yang sama berulang kali
- Menghitung ulang ringkasan di logout
- Lupa kirim di jam tertentu
- Webhook tidak tersedia karena permission server

Solusi di repo ini: **Electron app + SQLite lokal + browser automation via Playwright** dengan profil Chrome terpisah. App mengurus format, jadwal, timer kerja bersih, dan pengiriman — kamu cukup isi rencana kerja pagi hari, lalu klik **Mulai Hari Ini**.

---

## Fitur utama

| Fitur | Deskripsi |
|-------|-----------|
| **Jadwal otomatis** | Login, progress, dan logout terkirim sesuai waktu yang kamu set |
| **Timer kerja bersih** | Hitung 8 jam target; pause saat Break Start, lanjut setelah Break End |
| **Gate logout** | Logout tidak terkirim sebelum 8 jam bersih tercapai (kecuali kirim manual) |
| **Sum otomatis** | Bagian `- Sum:` di logout digenerate dari baris login + judul progress yang sudah terkirim |
| **Multi-day planning** | Rencanakan beberapa hari ke depan; scheduler hanya aktif untuk hari ini |
| **History** | Lihat dan edit report hari sebelumnya |
| **Profil Chrome terpisah** | Discord automation tidak bentrok dengan Chrome kerja utama |
| **Resilience** | Heartbeat scheduler, retry, dan power-save blocker saat monitor off |

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────┐
│  Electron (main process)                                │
│  ├── SQLite (work days, messages, settings, logs)       │
│  ├── Scheduler (timing, retry, logout gate)             │
│  └── IPC bridge → React UI                              │
└──────────────────────────┬──────────────────────────────┘
                           │ spawn node + temp message file
                           ▼
┌─────────────────────────────────────────────────────────┐
│  scripts/discord-browser/ (Playwright engine)           │
│  ├── send-discord.mjs — buka Chrome, paste, kirim       │
│  ├── config.json — channel URL (local, tidak di-commit) │
│  └── chrome-profile/ — session Discord (local)          │
└─────────────────────────────────────────────────────────┘
```

**Kenapa browser automation, bukan webhook?**

Webhook butuh permission Manage Webhooks di server Discord. Banyak tim internal tidak memberi akses itu ke semua developer. UI automation lebih rapuh secara teknis, tapi tidak butuh koordinasi dengan admin server — trade-off yang wajar untuk tool personal/team kecil.

**Kenapa SQLite lokal dulu?**

Data report harian sensitif (rencana kerja, blocker, design ID). Simpan lokal dulu = zero infra, zero latency, zero biaya hosting. Sync ke server (misalnya Laravel API) bisa ditambah nanti tanpa mengubah flow UI.

---

## Prasyarat

- **Windows 10/11**
- **Node.js 20+** (LTS disarankan)
- **Google Chrome** terpasang
- **PowerShell** (sudah ada di Windows)
- Akun Discord dengan akses ke channel target

---

## Instalasi

```powershell
git clone https://github.com/hafidrf/progress-reporter-kerja.git
cd progress-reporter-kerja
npm install
npm run setup:discord
npm run build
```

Edit channel Discord di `scripts/discord-browser/config.json`:

```json
{
  "channelUrl": "https://discord.com/channels/GUILD_ID/CHANNEL_ID",
  "chromeProfileDir": "chrome-profile",
  "cdpPort": 9333
}
```

Cara dapat URL channel: buka channel di Discord Web → copy dari address bar.

---

## Setup Discord (sekali saja)

1. Jalankan app: `npm start`
2. Klik **Setup Discord**
3. Chrome terpisah terbuka → login Discord jika diminta
4. Pastikan channel target terbuka
5. Tutup jendela Chrome automation

Session tersimpan di `scripts/discord-browser/chrome-profile/` (folder ini tidak masuk git).

---

## Shortcut desktop (opsional)

```powershell
npm run desktop-shortcut
```

Shortcut **Progress Reporter Kerja** akan muncul di Desktop.

---

## Alur kerja harian

### Pagi — rencanakan

1. Buka app (tanggal otomatis mengikuti timezone lokal, default `Asia/Jakarta`)
2. Isi **Login** — waktu + 2 baris rencana kerja
3. Tambah **Progress** — satu entry per update (judul, design ID, ETA, jam kirim)
4. Isi **Logout** — waktu logout, Integration, Pending (Sum otomatis)
5. Opsional: tambah progress **Break Start** / **Break End** untuk pause timer

### Saat mulai kerja

Klik **Mulai Hari Ini** → scheduler background aktif. Pesan pending akan terkirim otomatis saat waktunya tiba.

### Sebelum logout

Timer menampilkan jam kerja bersih dan perkiraan waktu 8 jam tercapai. Logout terjadwal otomatis menunggu sampai target terpenuhi.

---

## Format pesan

### Login

```
Login(DD/MM/YY):
Working on ...
Checking ...
```

### Progress

```
Judul task
Design id : XXXX:YYYY
Eta : 1hr
```

Progress khusus break: judul `Break Start` atau `Break End` (tanpa design ID wajib).

### Logout

```
Logout(DD/MM/YY):
- Sum: Worked on ..., ..., ...
- Integration:
<isi manual, boleh kosong>
- Pending:
<isi manual, boleh kosong>
```

**Sum** digenerate dari:
- Baris 1 dan 2 pesan login
- Judul semua progress yang statusnya `sent` (Break Start/End diabaikan)

**Integration / Pending** diisi manual. Kosongkan saja jika tidak ada — baris `- Integration:` / `- Pending:` tetap ada.

---

## Timer kerja bersih

| Konsep | Perilaku |
|--------|----------|
| Mulai | Saat pesan login terkirim / session dimulai |
| Pause | Saat ada progress **Break Start** yang sudah terkirim, belum ada **Break End** |
| Target | 8 jam kerja bersih (konstanta `CLEAN_WORK_TARGET_HOURS`) |
| ETA selesai | Estimasi jam wall-clock saat 8 jam bersih tercapai; mundur jika break |
| Gate logout | Scheduler menahan logout sampai `canLogout === true` |

---

## Scheduler

- Hanya berjalan untuk **tanggal hari ini** (local timezone)
- Heartbeat setiap 10 detik — menangkap pesan yang ditambah setelah scheduler start
- Retry hingga 5x jika kirim gagal
- `powerSaveBlocker` mencegah OS throttle saat monitor off
- **Stop** menghentikan scheduler; tidak menghapus pesan pending

Tombol **Done** pada pesan: tandai sudah terkirim tanpa kirim ulang ke Discord (berguna jika sudah kirim manual).

---

## Struktur project

```
progress-reporter-kerja/
├── electron/           # Main process: DB, scheduler, Discord bridge
│   ├── db.ts           # SQLite schema & business logic
│   ├── scheduler.ts    # Background message dispatcher
│   ├── discord.ts      # Spawn Playwright engine
│   └── render.ts       # Message formatting & timer math
├── src/                # React UI
├── scripts/
│   └── discord-browser/  # Playwright send engine
│       ├── send-discord.mjs
│       ├── config.example.json
│       └── open-discord-login.ps1
├── start-app.ps1       # Launcher untuk desktop shortcut
└── package.json
```

---

## Scripts npm

| Command | Fungsi |
|---------|--------|
| `npm run dev` | Development mode (Vite + Electron hot reload) |
| `npm start` | Build + jalankan app |
| `npm run build` | Compile TypeScript + bundle React |
| `npm run setup:discord` | Salin file config example ke config lokal |
| `npm test` | Unit test formatting logic |
| `npm run test:integration` | Dry-run Discord engine |
| `npm run desktop-shortcut` | Buat shortcut di Desktop |

---

## Troubleshooting

### Pesan tidak terkirim saat monitor mati

Pastikan PC tidak sleep (hibernate). App sudah pakai power-save blocker, tapi sleep total tetap menghentikan semua proses.

### "Kotak chat tidak muncul"

1. Jalankan **Setup Discord** ulang
2. Login Discord di profil automation
3. Buka channel target manual sekali
4. Tutup Chrome automation, coba **Kirim sekarang**

### Chrome profil terkunci

Tutup jendela Chrome automation (bukan Chrome kerja utama). App otomatis kill proses dengan profil `discord-browser/chrome-profile` sebelum kirim.

### Build gagal di `better-sqlite3`

```powershell
npm run postinstall
```

Native module perlu di-rebuild untuk versi Electron yang dipakai.

### Logout tidak terkirim otomatis

Normal — scheduler menunggu 8 jam kerja bersih. Cek timer di UI. Kirim manual hanya jika memang sudah waktunya.

---

## Data & privasi

Yang **tidak** masuk repository:

- `scripts/discord-browser/config.json` — URL channel kamu
- `scripts/discord-browser/chrome-profile/` — session login Discord
- Database SQLite di `%APPDATA%/progress-reporter-kerja/` — riwayat kerja

Jangan commit file di atas ke git publik.

---

## Roadmap

- [ ] Sync history ke backend (Laravel API)
- [ ] Packaging installer (electron-builder)
- [ ] Konfigurasi channel URL dari UI settings
- [ ] Notifikasi desktop saat kirim gagal

---

## Lisensi

MIT — lihat penggunaan di repo ini sebagai referensi; sesuaikan dengan kebijakan tim dan Discord ToS di lingkungan kerjamu.
