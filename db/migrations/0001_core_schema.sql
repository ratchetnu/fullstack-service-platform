-- Core domain: customers request bookings for a service; every accepted booking
-- becomes exactly one job, and every job status change is recorded.

CREATE TYPE job_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  email       text NOT NULL,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT customers_full_name_length CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 120),
  -- Emails are stored normalised so the unique constraint is case-insensitive.
  CONSTRAINT customers_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT customers_email_unique UNIQUE (email)
);

CREATE TABLE services (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL,
  name              text NOT NULL,
  description       text NOT NULL DEFAULT '',
  duration_minutes  integer NOT NULL,
  price_cents       integer NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT services_code_unique UNIQUE (code),
  CONSTRAINT services_code_format CHECK (code ~ '^[a-z0-9-]+$'),
  CONSTRAINT services_duration_range CHECK (duration_minutes BETWEEN 15 AND 480 AND duration_minutes % 15 = 0),
  CONSTRAINT services_price_non_negative CHECK (price_cents >= 0)
);

CREATE TABLE bookings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            text NOT NULL,
  customer_id          uuid NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  service_id           uuid NOT NULL REFERENCES services (id) ON DELETE RESTRICT,
  requested_start      timestamptz NOT NULL,
  -- What the customer typed on this request. Kept separately from the customer
  -- record so an anonymous form submission can never overwrite saved details.
  contact_name         text NOT NULL,
  contact_phone        text,
  service_address      text NOT NULL,
  notes                text,
  -- Price at the moment of booking, so later price changes do not rewrite history.
  quoted_price_cents   integer NOT NULL,
  -- Supplied by the client. Retrying the same request with the same key returns
  -- the original booking instead of creating a second one.
  idempotency_key      text NOT NULL,
  -- SHA-256 of the normalised request body, used to detect a key being reused
  -- for a different request.
  request_fingerprint  text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookings_reference_unique UNIQUE (reference),
  CONSTRAINT bookings_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT bookings_idempotency_key_length CHECK (char_length(idempotency_key) BETWEEN 16 AND 100),
  CONSTRAINT bookings_notes_length CHECK (notes IS NULL OR char_length(notes) <= 1000),
  CONSTRAINT bookings_quoted_price_non_negative CHECK (quoted_price_cents >= 0)
);

-- Postgres does not index foreign keys automatically.
CREATE INDEX bookings_customer_id_created_at_idx ON bookings (customer_id, created_at DESC);
CREATE INDEX bookings_service_id_idx ON bookings (service_id);

CREATE TABLE jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           uuid NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  status               job_status NOT NULL DEFAULT 'scheduled',
  scheduled_start      timestamptz NOT NULL,
  scheduled_end        timestamptz NOT NULL,
  started_at           timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancellation_reason  text,
  -- Incremented on every change. Clients send the version they last saw, so a
  -- stale screen cannot silently overwrite someone else's update.
  version              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- One booking produces at most one job.
  CONSTRAINT jobs_booking_id_unique UNIQUE (booking_id),
  CONSTRAINT jobs_schedule_window CHECK (scheduled_end > scheduled_start),
  CONSTRAINT jobs_version_positive CHECK (version >= 1),
  -- The lifecycle timestamps must agree with the status, whatever code wrote the row.
  CONSTRAINT jobs_status_timestamps CHECK (
       (status = 'scheduled'   AND started_at IS NULL     AND completed_at IS NULL     AND cancelled_at IS NULL)
    OR (status = 'in_progress' AND started_at IS NOT NULL AND completed_at IS NULL     AND cancelled_at IS NULL)
    OR (status = 'completed'   AND started_at IS NOT NULL AND completed_at IS NOT NULL AND cancelled_at IS NULL
                               AND completed_at >= started_at)
    OR (status = 'cancelled'   AND completed_at IS NULL   AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT jobs_cancellation_reason CHECK (
    (status = 'cancelled') = (cancellation_reason IS NOT NULL AND char_length(btrim(cancellation_reason)) > 0)
  )
);

-- Bookings list and dashboard: filter by status, order by schedule.
CREATE INDEX jobs_status_scheduled_start_idx ON jobs (status, scheduled_start);
-- Capacity check: "which active jobs overlap this time window?"
-- Partial, so finished and cancelled jobs never bloat it.
CREATE INDEX jobs_active_window_idx ON jobs (scheduled_start, scheduled_end)
  WHERE status IN ('scheduled', 'in_progress');

CREATE TABLE job_status_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id       uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  from_status  job_status,            -- NULL for the event that created the job
  to_status    job_status NOT NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT job_status_events_changes_status CHECK (from_status IS DISTINCT FROM to_status)
);

CREATE INDEX job_status_events_job_id_created_at_idx ON job_status_events (job_id, created_at);
