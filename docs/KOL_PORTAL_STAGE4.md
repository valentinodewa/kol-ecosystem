# Portal KOL — Tahap 4

Tahap 4 menyiapkan keamanan akun untuk pilot portal KOL. Implementasi tetap berada pada branch, Worker, D1, dan Pages dev yang terisolasi.

## Fitur

- KOL dapat mengganti password dari portal.
- Akun dengan `must_change_password = 1` wajib mengganti password awal.
- Password baru minimal 10 karakter dan wajib memiliki huruf besar, huruf kecil, angka, serta karakter khusus.
- Password baru tidak boleh sama dengan password saat ini.
- Setelah password berhasil berubah, seluruh sesi akun dicabut dan pengguna harus login kembali.
- Hash password menggunakan PBKDF2-SHA256, salt acak, dan 100.000 iterasi sesuai fondasi akun yang sudah ada.

## Endpoint

`POST /api/v1/kol/change-password`

Body:

```json
{
  "currentPassword": "password saat ini",
  "newPassword": "password baru yang kuat"
}
```

Endpoint hanya bekerja untuk sesi KOL aktif. Identitas akun diambil dari sesi, bukan dari body request.

## Validasi

- Password saat ini yang salah ditolak dengan HTTP 400.
- Password baru yang lemah ditolak dengan HTTP 400.
- Kasus penolakan tidak mengubah password dan tidak mencabut sesi aktif.
- Profil mengembalikan flag `mustChangePassword` agar UI dapat memaksa penggantian password awal.

## Batas deployment

- Worker: `kol-ecosystem-api-kol-dev`
- D1: `kol-ecosystem-kol-dev`
- Pages: `kol-ecosystem-kol-portal-dev`
- Portal utama, Worker staging, dan D1 staging tidak diubah.

