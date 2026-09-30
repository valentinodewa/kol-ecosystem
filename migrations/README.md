# D1 migrations

Migrasi D1 tersimpan berurutan di folder ini. Jangan mengubah migrasi yang sudah pernah diterapkan; buat file migrasi baru untuk setiap perubahan skema.

Untuk menerapkan migrasi pada database lokal:

```powershell
cd C:\kol-ecosystem\apps\api
corepack pnpm db:migrate:local
```
