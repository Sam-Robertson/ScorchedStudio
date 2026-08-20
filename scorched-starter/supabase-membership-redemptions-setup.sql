-- Run this in the Supabase SQL editor to set up staff redemption of membership
-- entitlements (entrances + wood credit), and to let members be looked up by
-- name/phone in addition to email. Depends on supabase-memberships-setup.sql.

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS phone TEXT;

-- Append-only ledger of staff redemptions. amount is seats for type='entrance',
-- cents for type='wood_credit'. square_order_id/notes are optional — Phase-4 MVP
-- has staff key the discount/credit into Square manually and record the
-- resulting order id here after the fact.
CREATE TABLE IF NOT EXISTS membership_redemptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id    UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('entrance', 'wood_credit')),
  amount           INT NOT NULL CHECK (amount > 0),
  redeemed_by      TEXT NOT NULL,
  square_order_id  TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS membership_redemptions_membership_id_idx ON membership_redemptions (membership_id);

-- Atomically checks-and-decrements a membership's cached balance column.
-- A plain JS read-then-write (like grantMembershipPeriod uses for grants) can
-- lose an update if two redemptions land on the same membership close
-- together (double-click, two staff at once) — grants get away with that
-- because they're idempotency-guarded by a unique ledger key, not balance
-- math. Redemptions guard the balance itself, atomically, in one statement.
-- Returns NULL (no row) if the membership isn't active or the balance is
-- insufficient; the caller treats that as "redemption blocked."
CREATE OR REPLACE FUNCTION redeem_membership_entitlement(
  p_membership_id UUID,
  p_type TEXT,
  p_amount INT
) RETURNS memberships
LANGUAGE plpgsql
AS $$
DECLARE
  result memberships;
BEGIN
  IF p_type = 'entrance' THEN
    UPDATE memberships
    SET entrances_remaining = entrances_remaining - p_amount,
        updated_at = now()
    WHERE id = p_membership_id
      AND status = 'active'
      AND entrances_remaining >= p_amount
    RETURNING * INTO result;
  ELSIF p_type = 'wood_credit' THEN
    UPDATE memberships
    SET wood_credit_remaining_cents = wood_credit_remaining_cents - p_amount,
        updated_at = now()
    WHERE id = p_membership_id
      AND status = 'active'
      AND wood_credit_remaining_cents >= p_amount
    RETURNING * INTO result;
  ELSE
    RAISE EXCEPTION 'Unknown entitlement type: %', p_type;
  END IF;

  -- UPDATE ... RETURNING INTO on zero matched rows leaves `result` as a row of
  -- all-NULL fields, not a NULL row — PostgREST serializes that as
  -- {"id": null, ...}, which is truthy in JS. Explicitly return SQL NULL (which
  -- PostgREST serializes as JSON null) so the caller's `if (!updated)` check
  -- actually catches the blocked case.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN result;
END;
$$;
