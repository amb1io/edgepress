-- Deduplicate edp_settings by name (keep earliest id per name) and enforce uniqueness.
DELETE FROM edp_settings
WHERE id NOT IN (
  SELECT MIN(id) FROM edp_settings GROUP BY name
);
--> statement-breakpoint
DROP INDEX IF EXISTS edp_settings_name_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX edp_settings_name_idx ON edp_settings (name);
