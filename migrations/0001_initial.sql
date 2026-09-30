PRAGMA foreign_keys = ON;

CREATE TABLE kols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upline_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  tier_code TEXT,
  joined_at TEXT,
  contact TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE performance_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (date(period_start) IS NOT NULL),
  CHECK (date(period_end) IS NOT NULL),
  CHECK (date(period_end) >= date(period_start)),
  UNIQUE (period_start, period_end)
);

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  source TEXT NOT NULL DEFAULT 'fastpay',
  query_version TEXT NOT NULL,
  kol_count INTEGER NOT NULL DEFAULT 0 CHECK (kol_count >= 0),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  CHECK (date(period_start) IS NOT NULL),
  CHECK (date(period_end) IS NOT NULL),
  CHECK (date(period_end) >= date(period_start))
);

CREATE TABLE kol_performance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kol_id INTEGER NOT NULL,
  period_id INTEGER NOT NULL,
  sync_run_id TEXT NOT NULL,
  total_registered INTEGER NOT NULL CHECK (total_registered >= 0),
  total_active INTEGER NOT NULL CHECK (total_active >= 0),
  total_nmat INTEGER NOT NULL CHECK (total_nmat >= 0),
  total_achieve_trx INTEGER NOT NULL CHECK (total_achieve_trx >= 0),
  total_achieve_rev NUMERIC NOT NULL,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (kol_id) REFERENCES kols(id) ON DELETE RESTRICT,
  FOREIGN KEY (period_id) REFERENCES performance_periods(id) ON DELETE RESTRICT,
  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE RESTRICT,
  UNIQUE (kol_id, period_id)
);

CREATE TABLE sync_run_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id TEXT NOT NULL,
  upline_id TEXT,
  error_code TEXT,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_kols_status ON kols(status);
CREATE INDEX idx_periods_dates ON performance_periods(period_start, period_end);
CREATE INDEX idx_snapshots_period_nmat ON kol_performance_snapshots(period_id, total_nmat DESC);
CREATE INDEX idx_sync_runs_period ON sync_runs(period_start, period_end, started_at DESC);
CREATE INDEX idx_sync_run_errors_run ON sync_run_errors(sync_run_id);
