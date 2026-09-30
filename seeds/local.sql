INSERT OR IGNORE INTO kols (upline_id, name, status, notes)
VALUES ('FA582386', 'KOL Contoh Lokal', 'active', 'Data contoh; bukan master KOL produksi');

INSERT OR IGNORE INTO performance_periods (period_start, period_end, label, status)
VALUES ('2026-09-01', '2026-09-28', 'Contoh September 2026', 'open');

INSERT OR REPLACE INTO sync_runs (
  id,
  period_start,
  period_end,
  status,
  source,
  query_version,
  kol_count,
  row_count,
  started_at,
  completed_at
)
VALUES (
  'local-seed-2026-09-01-2026-09-28',
  '2026-09-01',
  '2026-09-28',
  'succeeded',
  'local_seed',
  'foundation-v1',
  1,
  1,
  '2026-09-30T00:00:00.000Z',
  '2026-09-30T00:00:01.000Z'
);

INSERT INTO kol_performance_snapshots (
  kol_id,
  period_id,
  sync_run_id,
  total_registered,
  total_active,
  total_nmat,
  total_achieve_trx,
  total_achieve_rev,
  synced_at
)
SELECT
  k.id,
  p.id,
  'local-seed-2026-09-01-2026-09-28',
  120,
  100,
  80,
  650,
  2500000,
  '2026-09-30T00:00:01.000Z'
FROM kols k
CROSS JOIN performance_periods p
WHERE k.upline_id = 'FA582386'
  AND p.period_start = '2026-09-01'
  AND p.period_end = '2026-09-28'
ON CONFLICT(kol_id, period_id) DO UPDATE SET
  sync_run_id = excluded.sync_run_id,
  total_registered = excluded.total_registered,
  total_active = excluded.total_active,
  total_nmat = excluded.total_nmat,
  total_achieve_trx = excluded.total_achieve_trx,
  total_achieve_rev = excluded.total_achieve_rev,
  synced_at = excluded.synced_at,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
