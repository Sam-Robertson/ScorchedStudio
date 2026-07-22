-- Run this in the Supabase SQL editor to set up the equipment/inventory issue
-- reports table used by app/admin/requests (employees flag low inventory,
-- broken equipment, etc. for staff to review and resolve).

CREATE TABLE IF NOT EXISTS equipment_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text        NOT NULL CHECK (category IN ('Low Inventory', 'Broken', 'Other')),
  priority     text        CHECK (priority IN ('High', 'Medium', 'Low')),
  notes        text        NOT NULL,
  status       text        NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Resolved')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);
