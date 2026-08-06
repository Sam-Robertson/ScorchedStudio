-- Run this in the Supabase SQL editor to set up inventory tracking: items,
-- the stock ledger (source of truth for on-hand quantity), purchase orders
-- (source of truth for lead time), and a single-row settings table.
--
-- on_hand_qty is deliberately NOT a column here. It's derived at read time as
-- sum(inventory_stock_ledger.delta) per item, so there's no cached value that
-- can drift from the ledger — the ledger IS the on-hand quantity.

CREATE TABLE IF NOT EXISTS inventory_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,
  sku                   TEXT,
  safety_buffer_units   INT NOT NULL DEFAULT 7,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stock movements: physical counts (correcting delta to the counted qty),
-- monthly sales (negative delta), and purchase-order receipts when a quantity
-- was recorded. UNIQUE(item_id, reason) makes a re-uploaded sales month
-- detectable (the app checks for an existing row before inserting, and offers
-- to replace it) rather than silently ignored.
CREATE TABLE IF NOT EXISTS inventory_stock_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  delta         INT NOT NULL,
  reason        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, reason)
);

CREATE INDEX IF NOT EXISTS inventory_stock_ledger_item_idx ON inventory_stock_ledger (item_id);

-- Source of truth for lead time (arrival_date - order_date, averaged per item
-- over rows where arrival_date is set). quantity_ordered is optional — when set
-- and arrival_date is filled in, the app also writes a "received:<po_id>"
-- ledger row so marking a PO received bumps on-hand stock automatically.
CREATE TABLE IF NOT EXISTS inventory_purchase_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id            UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity_ordered   INT,
  order_date         DATE NOT NULL,
  arrival_date       DATE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_purchase_orders_item_idx ON inventory_purchase_orders (item_id);

-- Single-row settings table. tracking_start_date anchors the "all-time daily
-- average" calculation (total units sold since this date / days elapsed) —
-- deliberately one global date rather than each item's first sale, so a
-- newly-stocked item with one month of history doesn't get an inflated
-- average relative to established items.
CREATE TABLE IF NOT EXISTS inventory_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_start_date DATE NOT NULL DEFAULT CURRENT_DATE
);

INSERT INTO inventory_settings (tracking_start_date)
SELECT CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM inventory_settings);

-- Seed the finished-goods catalog from the studio's existing "Threshold Qtys"
-- tracking sheet, reconciled against actual Square item names:
--   - "Jewelry Box" (one row in the sheet) is split into the two Square
--     variations actually sold: "Jewelry box (medium)" and "Jewelry box (small)".
--   - "Giant Wood Slab" (sheet) and "Wood slab" (Square) are the same product;
--     seeded once as "Wood slab" to match the name Square sends on every
--     monthly upload.
-- SKUs are pulled from the Square items export where available.
INSERT INTO inventory_items (name, sku, safety_buffer_units) VALUES
  ('Bracelet',              '507235K', 7),
  ('Coaster Set',           '266751B', 7),
  ('Cup',                   'W009125', 7),
  ('Large Cup',             NULL,      7),
  ('Cutting Board',         NULL,      7),
  ('Wood slab',             '2480610', 7),
  ('Jewelry box (medium)',  '4651759', 7),
  ('Jewelry box (small)',   '734815V', 7),
  ('Leather Book',          '4343126', 7),
  ('Plate',                 '859372D', 7),
  ('Ring',                  '661239J', 7),
  ('Spoon',                 NULL,      7),
  ('Wallet',                '2176393', 7),
  ('Wood Disc/Key Holder',  NULL,      7)
ON CONFLICT (name) DO NOTHING;

-- Seed known-complete historical purchase orders (both an order date AND an
-- arrival date) from the old sheet, so lead time isn't "no data yet" for every
-- item on day one. Rows with a missing arrival date (e.g. Ring, which had a
-- broken threshold formula because of this) or no order data at all are
-- intentionally skipped rather than guessed. quantity_ordered is left NULL
-- since the old sheet never tracked it — these seed rows affect lead-time
-- averages only, not on-hand stock.
-- No natural unique key on this table, so guard the re-run manually: only seed
-- an item that doesn't already have any purchase order logged.
INSERT INTO inventory_purchase_orders (item_id, order_date, arrival_date)
SELECT i.id, seed.order_date, seed.arrival_date
FROM (VALUES
  ('Bracelet',             DATE '2025-07-14', DATE '2025-09-02'),
  ('Coaster Set',          DATE '2025-06-10', DATE '2025-08-09'),
  ('Cup',                  DATE '2025-06-10', DATE '2025-08-09'),
  ('Cutting Board',        DATE '2025-06-10', DATE '2025-08-09'),
  ('Leather Book',         DATE '2025-06-17', DATE '2025-08-05'),
  ('Plate',                DATE '2025-06-10', DATE '2025-08-09'),
  ('Wood Disc/Key Holder', DATE '2025-06-10', DATE '2025-07-12')
) AS seed(item_name, order_date, arrival_date)
JOIN inventory_items i ON i.name = seed.item_name
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_purchase_orders po WHERE po.item_id = i.id
);
