PRAGMA foreign_keys = ON;

ALTER TABLE kols ADD COLUMN pic_name TEXT;

CREATE TABLE collaboration_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_month TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (period_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]')
);

CREATE TABLE kol_monthly_roster (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collaboration_period_id INTEGER NOT NULL,
  kol_id INTEGER NOT NULL,
  tier_code TEXT,
  pic_name TEXT,
  cooperation_status TEXT NOT NULL DEFAULT 'active' CHECK (cooperation_status IN ('active', 'paused', 'ended')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (collaboration_period_id) REFERENCES collaboration_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (kol_id) REFERENCES kols(id) ON DELETE RESTRICT,
  UNIQUE (collaboration_period_id, kol_id)
);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tier_code TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reward_description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (date(start_date) IS NOT NULL),
  CHECK (date(end_date) IS NOT NULL),
  CHECK (date(end_date) >= date(start_date))
);

CREATE TABLE mission_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('registered', 'active', 'nmat', 'transactions', 'revenue')),
  target_value NUMERIC NOT NULL CHECK (target_value >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  UNIQUE (mission_id, metric)
);

CREATE TABLE mission_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL,
  kol_id INTEGER NOT NULL,
  collaboration_period_id INTEGER,
  tier_code_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'eligible' CHECK (status IN ('eligible', 'achieved', 'failed', 'excluded')),
  enrolled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY (kol_id) REFERENCES kols(id) ON DELETE RESTRICT,
  FOREIGN KEY (collaboration_period_id) REFERENCES collaboration_periods(id) ON DELETE SET NULL,
  UNIQUE (mission_id, kol_id)
);

CREATE TABLE kol_daily_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kol_id INTEGER NOT NULL,
  performance_date TEXT NOT NULL,
  sync_run_id TEXT,
  total_registered INTEGER NOT NULL DEFAULT 0 CHECK (total_registered >= 0),
  total_active INTEGER NOT NULL DEFAULT 0 CHECK (total_active >= 0),
  total_nmat INTEGER NOT NULL DEFAULT 0 CHECK (total_nmat >= 0),
  total_achieve_trx INTEGER NOT NULL DEFAULT 0 CHECK (total_achieve_trx >= 0),
  total_achieve_rev NUMERIC NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (kol_id) REFERENCES kols(id) ON DELETE RESTRICT,
  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id) ON DELETE SET NULL,
  CHECK (date(performance_date) IS NOT NULL),
  UNIQUE (kol_id, performance_date)
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL DEFAULT 'local_operator',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_roster_period_status ON kol_monthly_roster(collaboration_period_id, cooperation_status);
CREATE INDEX idx_roster_kol ON kol_monthly_roster(kol_id, collaboration_period_id);
CREATE INDEX idx_missions_status_dates ON missions(status, start_date, end_date);
CREATE INDEX idx_missions_tier ON missions(tier_code, status);
CREATE INDEX idx_mission_participants_mission ON mission_participants(mission_id, status);
CREATE INDEX idx_daily_performance_date ON kol_daily_performance(performance_date, total_nmat DESC);
CREATE INDEX idx_daily_performance_kol_date ON kol_daily_performance(kol_id, performance_date);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
