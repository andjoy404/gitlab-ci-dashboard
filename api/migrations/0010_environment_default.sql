-- Add is_default column to track the default environment
ALTER TABLE gitlab_environments ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure only one environment can be default
CREATE UNIQUE INDEX idx_environments_default_one ON gitlab_environments(is_default) WHERE is_default = TRUE;
