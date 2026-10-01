ALTER TABLE kol_daily_performance
ADD COLUMN total_activation_commission NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE kol_daily_performance
ADD COLUMN total_activation_revenue NUMERIC NOT NULL DEFAULT 0;
