-- The application only allows these job status changes:
--
--   scheduled   -> in_progress | cancelled
--   in_progress -> completed   | cancelled
--   completed, cancelled: final
--
-- This trigger enforces the same rule inside the database, so a bug, a script
-- or a manual UPDATE cannot move a job backwards (for example completed -> scheduled).

CREATE FUNCTION enforce_job_status_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status = 'scheduled'   AND NEW.status IN ('in_progress', 'cancelled'))
  OR (OLD.status = 'in_progress' AND NEW.status IN ('completed', 'cancelled')) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid job status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation', CONSTRAINT = 'jobs_status_transition';
END;
$$;

CREATE TRIGGER jobs_status_transition_guard
  BEFORE UPDATE OF status ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_job_status_transition();
