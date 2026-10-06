ALTER TABLE missions ADD COLUMN participant_target INTEGER NOT NULL DEFAULT 0 CHECK (participant_target >= 0);
