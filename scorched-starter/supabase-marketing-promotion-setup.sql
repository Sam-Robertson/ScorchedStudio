-- Gmail Promotions tab annotation for email campaigns.
--
-- One nullable JSON column: the deal badge text, code, start and end dates,
-- the link, and the card image. Shape is validated in
-- lib/marketing/email-promotion.ts (promotionSchema); NULL means the campaign
-- carries no annotation. Rendered into the message head as JSON-LD by
-- lib/marketing/BlockEmail.tsx.
--
-- Run once in the Supabase SQL editor.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS promotion JSONB;

-- Check:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'campaigns' AND column_name = 'promotion';
