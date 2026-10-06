# Portal KOL — Sumber Master Operasional

Portal KOL development memakai dua binding D1 dengan tanggung jawab terpisah:

- `DB` → `kol-ecosystem-kol-dev`: akun, password, sesi, audit akses, dan data performa development.
- `OPERATIONS_DB` → `kol-ecosystem-staging`: sumber baca-saja untuk profil KOL, status kerja sama, tier terbaru, dan mission operasional.

Dengan pembagian ini, perubahan tier atau mission dari dashboard operasional utama langsung terlihat pada portal KOL setelah request berikutnya atau tombol **Perbarui**, tanpa menyalin data dan tanpa memberi portal KOL jalur tulis ke tabel operasional.

Pencocokan antar-database menggunakan `upline_id`, bukan ID numerik internal, karena ID hasil salinan dapat berbeda.

## Batas keamanan

- Seluruh query ke `OPERATIONS_DB` pada route KOL adalah `SELECT`.
- Akun dan sesi KOL tidak dipindahkan ke D1 staging.
- Migration portal KOL tetap hanya diterapkan ke D1 `koldev`.
- Worker staging dan Pages utama tidak dideploy dalam perubahan ini.
