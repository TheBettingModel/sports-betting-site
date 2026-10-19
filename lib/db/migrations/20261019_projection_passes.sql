-- Explicit release migration for the external Render-connected PostgreSQL.
-- Never run automatically at app startup. Apply only to a verified target.
CREATE TABLE IF NOT EXISTS public.projection_passes (
  user_id text PRIMARY KEY,
  game_id text NOT NULL,
  claimed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  snapshot jsonb NOT NULL,
  CONSTRAINT projection_pass_duration CHECK (expires_at = claimed_at + interval '24 hours')
);
