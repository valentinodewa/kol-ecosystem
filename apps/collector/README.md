# Fastpay Collector

Collector akan berjalan pada komputer yang terhubung ke Wi-Fi internal BMS. Tanggung jawabnya:

1. Mengambil hasil query read-only dari Fastpay.
2. Menormalisasi data per KOL dan periode.
3. Mengirim snapshot agregat ke API Cloudflare melalui koneksi HTTPS.

Implementasi collector dibuat setelah kontrak data dan autentikasi ingestion disepakati.
