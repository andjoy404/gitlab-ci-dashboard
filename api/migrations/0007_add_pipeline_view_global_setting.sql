ALTER TABLE app_global_settings
  ADD COLUMN IF NOT EXISTS pipeline_view TEXT NOT NULL DEFAULT 'all';

UPDATE app_global_settings
  SET pipeline_view = 'all'
  WHERE pipeline_view IS NULL;
