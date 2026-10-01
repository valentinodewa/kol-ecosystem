# KOL Operations UI

UI operasional lokal berjalan melalui Vite di `http://localhost:4174`.

## Konfigurasi lokal

Salin `.env.example` menjadi `.env.local`, lalu isi `ADMIN_API_KEY` dengan secret admin staging. File `.env.local` diabaikan Git dan tidak boleh dibagikan.

```powershell
Copy-Item apps\collector-ui\.env.example apps\collector-ui\.env.local
notepad apps\collector-ui\.env.local
```

Jalankan dari root project:

```powershell
corepack pnpm dev:collector-ui
```

Browser hanya mengakses `/local-api`. Vite meneruskan request ke Worker staging dan menambahkan bearer token dari proses lokal, sehingga secret tidak masuk ke bundle browser.
