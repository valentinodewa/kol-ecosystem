# Portal KOL — Tahap 3

Tahap 3 menambahkan performa pribadi ke portal KOL dev tanpa mengubah portal operasional atau D1 staging.

## Lingkungan terisolasi

- Branch: `feature/kol-portal`
- Pages: `kol-ecosystem-kol-portal-dev`
- Worker: `kol-ecosystem-api-kol-dev`
- D1: `kol-ecosystem-kol-dev`

## Endpoint

`GET /api/v1/kol/performance?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD`

Endpoint hanya menerima rentang tanggal. `kol_id` dan `upline_id` selalu diambil dari sesi KOL aktif. Parameter `uplineId` tambahan dari browser tidak digunakan sehingga KOL tidak dapat meminta data KOL lain.

Respons berisi data harian untuk:

- register;
- aktivasi;
- NMAT;
- transaksi;
- revenue transaksi;
- komisi aktivasi;
- revenue aktivasi.

## Tampilan

Portal menyediakan:

- filter tanggal awal dan akhir;
- tujuh kartu ringkasan;
- pilihan metrik grafik;
- grafik performa harian;
- tabel rincian per tanggal;
- mission aktif berdasarkan tier terbaru.

## Validasi keamanan

- request tanpa sesi menghasilkan HTTP 401;
- akun pilot hanya menerima baris dengan upline `FA582386`;
- query tambahan `uplineId=FA660738` tetap mengembalikan `FA582386`;
- bundle Pages hanya memuat URL API koldev, bukan API staging.

