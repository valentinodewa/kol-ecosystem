# Kontrak sinkronisasi performa KOL

Collector berjalan pada komputer yang terhubung ke jaringan internal BMS. Collector menjalankan query Fastpay, membentuk agregat per upline, lalu mengirimkannya melalui HTTPS ke API.

## Endpoint

`POST /api/v1/ingestion/performance`

Header wajib:

```http
Authorization: Bearer <INGESTION_API_KEY>
Content-Type: application/json
```

## Payload

```json
{
  "syncRunId": "e0e55211-366b-4f1a-8aca-1704bc867ce7",
  "periodStart": "2026-09-01",
  "periodEnd": "2026-09-28",
  "extractedAt": "2026-09-30T08:30:00.000Z",
  "queryVersion": "fastpay-summary-v1",
  "rows": [
    {
      "uplineId": "FA582386",
      "kolName": "Nama sementara",
      "totalRegistered": 120,
      "totalActive": 100,
      "totalNmat": 80,
      "totalAchieveTrx": 650,
      "totalAchieveRev": 2500000
    }
  ]
}
```

## Aturan

- `syncRunId` adalah UUID unik yang dibuat collector untuk setiap proses.
- Maksimal 100 KOL per request. Batch yang lebih besar dipecah oleh collector.
- Tanggal memakai format `YYYY-MM-DD`; tanggal awal dan akhir bersifat inklusif.
- `extractedAt` memakai ISO 8601 UTC.
- `totalNmat` tidak boleh melebihi `totalActive`.
- `totalAchieveRev` boleh bernilai nol.
- Pengiriman ulang payload dengan `syncRunId` dan periode yang sama aman; snapshot diperbarui, bukan diduplikasi.
- Nama KOL dari collector hanya dipakai ketika upline belum ada. Master KOL tetap menjadi sumber nama utama.

## Respons berhasil

Status HTTP `202 Accepted`:

```json
{
  "status": "accepted",
  "syncRunId": "e0e55211-366b-4f1a-8aca-1704bc867ce7",
  "processedKols": 1,
  "periodStart": "2026-09-01",
  "periodEnd": "2026-09-28"
}
```

## Keamanan

- Secret lokal disimpan dalam `apps/api/.dev.vars` dan tidak boleh masuk Git.
- Secret production nantinya disimpan sebagai Cloudflare Worker secret.
- Collector tidak pernah mengirim kredensial database Fastpay ke API.
- API hanya menerima hasil agregasi, bukan akses database internal.
