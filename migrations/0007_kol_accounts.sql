PRAGMA foreign_keys = ON;

CREATE TABLE kol_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kol_id INTEGER NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000 CHECK (password_iterations BETWEEN 100000 AND 100000),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (kol_id) REFERENCES kols(id) ON DELETE RESTRICT
);

CREATE TABLE kol_sessions (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (account_id) REFERENCES kol_accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_kol_accounts_active_username ON kol_accounts(is_active, username);
CREATE INDEX idx_kol_sessions_account_active ON kol_sessions(account_id, expires_at, revoked_at);
CREATE INDEX idx_kol_sessions_token_hash ON kol_sessions(token_hash);
