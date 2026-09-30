# Fastpay Collector

Collector berjalan pada komputer yang terhubung ke Wi-Fi internal BMS. Tahap pertama menggunakan dua file CSV hasil query Fastpay, menggabungkannya berdasarkan `upline`, memvalidasi hasil, lalu mengirim agregat ke API.

## 1. Siapkan CSV register dan aktif

Header yang diterima:

```csv
upline,total_outlet_terdaftar,total_outlet_aktif
FA582386,120,100
```

## 2. Siapkan CSV NMAT

Header yang diterima:

```csv
upline,total_nmat,total_achieve_trx,total_achieve_rev
FA582386,80,650,2500000
```

## 3. Dry-run

Dry-run hanya membentuk dan menampilkan payload; data tidak dikirim.

```powershell
cd C:\kol-ecosystem
corepack pnpm collect -- `
  --period-start 2026-09-01 `
  --period-end 2026-09-28 `
  --registration-csv apps/collector/samples/registration.csv `
  --nmat-csv apps/collector/samples/nmat.csv `
  --dry-run
```

## 4. Kirim ke API lokal

Set secret hanya pada sesi terminal aktif:

```powershell
$env:INGESTION_API_KEY = "nilai-yang-sama-dengan-apps-api-dev-vars"

corepack pnpm collect -- `
  --period-start 2026-09-01 `
  --period-end 2026-09-28 `
  --registration-csv apps/collector/samples/registration.csv `
  --nmat-csv apps/collector/samples/nmat.csv `
  --api-url http://localhost:8787/api/v1/ingestion/performance
```

Jangan menyimpan API key di source code, CSV, atau Git.

## Aturan validasi

- Satu `upline` hanya boleh muncul sekali pada setiap CSV.
- Semua upline pada CSV NMAT wajib tersedia pada CSV register/aktif.
- Semua metrik harus berupa angka dan tidak boleh negatif, kecuali revenue boleh bernilai negatif.
- `total_nmat` tidak boleh melebihi `total_outlet_aktif`.
- Maksimal 100 KOL dikirim per request; collector otomatis membagi data yang lebih besar menjadi beberapa batch.
- CSV boleh memakai delimiter koma, titik koma, atau tab.

File CSV operasional sebaiknya disimpan di `apps/collector/input`. Folder tersebut diabaikan Git.
