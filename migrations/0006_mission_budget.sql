ALTER TABLE missions ADD COLUMN budget_amount INTEGER NOT NULL DEFAULT 0 CHECK (budget_amount >= 0);
