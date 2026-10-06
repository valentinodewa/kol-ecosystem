# KOL Portal — Tahap 6: Audit Keamanan Akun

Tahap ini menambahkan jejak audit untuk tindakan sensitif pada akun KOL di lingkungan `koldev`.

## Aktivitas yang dicatat

- Pembuatan akun KOL.
- Reset password oleh super admin.
- Aktivasi akses akun.
- Penonaktifan akses akun.

Setiap catatan memuat waktu, username pelaksana, tindakan, akun tujuan, KOL, dan upline ID. Password sementara dan hash password tidak pernah dimasukkan ke audit.

## Akses

- Endpoint: `GET /api/v1/admin/kol-account-audit`.
- Hanya role `admin` yang dapat membacanya.
- UI tersedia melalui menu **Riwayat Akses**.
- Maksimal 100 aktivitas terbaru ditampilkan agar pembacaan tetap ringan.

## Penyimpanan

Migration `0008_kol_account_audit.sql` bersifat aditif dan hanya diterapkan ke D1 `kol-ecosystem-kol-dev` pada tahap ini.

## Batas deployment

- Worker: `kol-ecosystem-api-kol-dev`
- D1: `kol-ecosystem-kol-dev`
- Pages: `kol-ecosystem-kol-portal-dev`

Portal utama, Worker staging, dan D1 staging tidak diubah.
