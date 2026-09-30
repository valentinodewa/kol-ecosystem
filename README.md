# KOL Ecosystem

Monorepo untuk dashboard performa KOL, API Cloudflare Worker, penyimpanan D1, dan collector data Fastpay.

## Struktur

- `apps/dashboard`: dashboard React untuk pengguna.
- `apps/api`: API Cloudflare Worker.
- `apps/collector`: collector yang nanti dijalankan dari jaringan internal BMS.
- `packages/contracts`: kontrak data bersama antara dashboard dan API.
- `packages/domain`: aturan bisnis KOL, tier, mission, dan metrik.
- `packages/database`: akses data dan dokumentasi skema.
- `packages/shared`: utilitas lintas aplikasi.
- `migrations`: migrasi Cloudflare D1.

## Menjalankan lokal

```powershell
pnpm install
pnpm dev
```

Dashboard: `http://localhost:5173`  
API health check: `http://localhost:8787/api/v1/health`

## Prinsip keamanan

- Jangan commit kredensial Fastpay atau Cloudflare.
- Collector hanya membaca data Fastpay dari jaringan internal.
- Dashboard publik tidak pernah terhubung langsung ke database Fastpay.
