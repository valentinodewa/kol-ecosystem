PRAGMA foreign_keys = ON;

CREATE TABLE kol_account_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_username TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('account_created', 'password_reset', 'access_enabled', 'access_disabled')),
  account_id INTEGER NOT NULL,
  kol_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (account_id) REFERENCES kol_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (kol_id) REFERENCES kols(id) ON DELETE RESTRICT
);

CREATE INDEX idx_kol_account_audit_created ON kol_account_audit_logs(created_at DESC);
CREATE INDEX idx_kol_account_audit_account ON kol_account_audit_logs(account_id, created_at DESC);
