-- Staff accounts and server-side sessions.

CREATE TYPE user_role AS ENUM ('admin', 'staff');

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  display_name   text NOT NULL,
  role           user_role NOT NULL,
  -- Format: scrypt$<N>$<r>$<p>$<salt>$<hash>. Never a plain password.
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_password_hash_format CHECK (password_hash LIKE 'scrypt$%')
);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- SHA-256 of the session token. The token itself only exists in the user's
  -- cookie, so a leaked copy of this table cannot be used to log in.
  token_hash  bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,

  CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Status changes made by staff record who made them. NULL means the customer
-- (booking creation) or the system.
ALTER TABLE job_status_events
  ADD COLUMN actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX job_status_events_actor_user_id_idx ON job_status_events (actor_user_id);
