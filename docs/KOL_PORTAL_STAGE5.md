# KOL Portal — Tahap 5: Manajemen Akun

Tahap ini menambahkan pengelolaan akses KOL oleh super admin di lingkungan `koldev`.

## Kemampuan

- Melihat seluruh Master KOL dan status kepemilikan akun.
- Membuat satu akun untuk KOL aktif.
- Menonaktifkan atau mengaktifkan kembali akun.
- Mereset password sementara dan mencabut seluruh sesi lama.
- Menampilkan password sementara satu kali saja; database hanya menyimpan hash PBKDF2.
- Memaksa KOL mengganti password sementara saat login.

## Batas keamanan

- Endpoint berada di `/api/v1/admin/*` dan hanya dapat dipakai role `admin`.
- Password sementara dibuat dengan `crypto.getRandomValues()`.
- Password polos tidak disimpan di D1 maupun penyimpanan browser.
- Menonaktifkan akun atau mereset password mencabut sesi aktif.
- Pembuatan akun massal belum diaktifkan untuk mencegah kesalahan provisioning.

## Target deployment

- Worker: `kol-ecosystem-api-kol-dev`
- D1: `kol-ecosystem-kol-dev`
- Pages: `kol-ecosystem-kol-portal-dev`

Environment staging utama tidak digunakan dalam tahap ini.
