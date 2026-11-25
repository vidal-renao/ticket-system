-- Applied 2026-07-19 in production.
-- Ticket history/archive: administrators can move resolved/closed tickets out
-- of the operational lists into the per-role History view (/history).
-- Archiving is not deletion — the ticket stays fully readable and restorable.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_tickets_archived
  ON tickets (organization_id, archived_at)
  WHERE archived_at IS NOT NULL;
