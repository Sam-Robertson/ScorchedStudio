-- Run this in the Supabase SQL Editor to set up the tasks table and seed your Asana data.

-- ── Create table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  asana_id      text,
  name          text        NOT NULL,
  notes         text,
  board_column  text        NOT NULL DEFAULT 'To do'
                            CHECK (board_column IN ('To do', 'Doing', 'Done', 'Blocked')),
  priority      text        CHECK (priority IN ('High', 'Medium', 'Low')),
  status        text,
  assignee      text,
  assignee_email text,
  start_date    date,
  due_date      date,
  sprint_dates  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Seed: Admin Projects from Asana export ────────────────────────────────────

INSERT INTO tasks (asana_id, name, notes, board_column, priority, status, assignee, assignee_email, start_date, due_date, sprint_dates) VALUES

  ('1213523595074740',
   'Orem Business License',
   $$This is blocked until we have the fire and city inspection done$$,
   'Blocked', 'Medium', 'On Hold',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-03-14', NULL),

  ('1213523595074726',
   'Recurring Inventory Orders',
   $$This specific project refers to things like:
toilet paper, paper towels, hand soap, erasers, etc.

Which are being used up rather than our wood & leather products. We need a way to make sure they are always in stock.$$,
   'To do', 'Low', 'Not Started',
   'samuel scadden', 'ssscadden@gmail.com',
   '2026-04-25', '2026-04-25', NULL),

  ('1213523595074728',
   'Attach extension cords to tables',
   NULL,
   'To do', 'Low', 'Not Started',
   'samuel scadden', 'ssscadden@gmail.com',
   '2026-03-05', '2026-03-09', NULL),

  ('1213523595074730',
   'Add Cabinets to Orem Studio',
   NULL,
   'To do', 'Low', 'Not Started',
   'Sam Robertson', 'contact@scorchedstudio.com',
   '2026-05-04', '2026-05-08', 'April 27th - May 10th'),

  ('1213523595074756',
   'Find new Social Media Manager',
   NULL,
   'To do', 'Low', 'Not Started',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-07-01', NULL),

  ('1213523595074798',
   'Marketing Refinement',
   $$New initiatives/refining current efforts (increase spending with Aleya, instagram ads, blog posts, etc.)$$,
   'To do', 'Low', 'Not Started',
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, '2026-07-01', NULL),

  ('1213741270099831',
   'Get Studio Spotify Account',
   NULL,
   'To do', NULL, NULL,
   NULL, NULL,
   NULL, NULL, NULL),

  ('1213523595074820',
   'Find new Area Manager',
   NULL,
   'To do', 'Medium', 'Not Started',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-04-30', NULL),

  ('1213523595074814',
   'Get Wifi for Orem Studio',
   NULL,
   'To do', 'Low', 'Not Started',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-04-30', NULL),

  ('1213523595074804',
   'Refine Customer Experience',
   $$Right now there is a lot that our employees have to tell customers:
- How to use the burners
- Drinks are free
- Pictures/Polaroids after they finish
- Where the wood products are
- They can use the printer if they'd like
- Don't burn the stencils
- etc.

I think we should review that and see if there isn't like a poster or a menu or a 'This is how this works' way of communicating some of that information rather than verbally repeating it for every customer.$$,
   'To do', 'Medium', 'Not Started',
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, '2026-05-29', NULL),

  ('1213523595074791',
   'Farmers market logistics',
   $$We need to plan out our booth for the farmers markets. I have already done some research and I have an idea of what we will need, but we will want a more detailed plan.

After we have a plan we will need to buy the equipment and have the employees running the farmers market test the set up in the parking lot and make sure they can set up, use the equipment, and take down in a reasonable time/with not too much effort.$$,
   'To do', 'Medium', 'Not Started',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-04-30', 'March 16th - 29th'),

  ('1213523595074764',
   'Add Inventory to Square / come up with Inventory system',
   $$Square has some built in inventory capabilities. (I think it even has more than we are using on an upgraded plan, so we might do more research into that and see if that's something that's worth the money). I don't update the inventory very much in Square so it gets out of date.

I also need to set up alerts so that I know when to put in orders in the future. I have a spreadsheet that helps calculate how much in advance we need to put in orders, so I can show you that.

For this project I think we should both sit down and I can talk you through what I want.$$,
   'To do', 'Medium', 'Not Started',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-03-31', NULL),

  ('1213523595074778',
   'Key Holders',
   $$Right now we sell wood disks. I want to buy hardware to make them into key holders (I've already bought some of the hardware which is basically just a frame back and the hook) and sell it as an add on.

We would need to drill holes into the wood (I bought a drill set specifically for this, but i just haven't gotten around to it. I still need to buy drill bits). I need to create a system where we can drill those and have a couple hundred pre-drilled wood disks.$$,
   'To do', 'Low', 'Not Started',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-04-15', NULL),

  ('1213647056432328',
   'SEO Work',
   $$https://www.reddit.com/r/Utah/comments/adr6tm/orem_date_ideas/
https://orem.gov/fun/$$,
   'To do', 'Medium', 'Not Started',
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, '2026-04-30', 'April 13th - April 26th'),

  ('1213523595074826',
   'Fire Inspection',
   $$Fireprevention@orem.gov

I haven't ever had the building inspected by the fire department. I'm sure they'll have things we need to fix. You'll need to find the number, schedule that, and then communicate with me the things that need to be fixed.

fire inspection scheduled for Tuesday, March 10 · 1:00 – 2:00pm$$,
   'Doing', 'High', 'Behind',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-03-10', 'March 1st - 15th'),

  ('1213523595074838',
   'City Inspection',
   $$I have already had the city inspectors come to Scorched Studio once before. They told me I needed to fix three things:
1. Get a building permit for the changes we already made (I've done this)
2. Move the mirror down (I don't want to permanently do this, I just want to move it down when the inspector comes. Or we could just take the mirror down and say we ordered a new one)
3. Move the boxes in the storage room so there is 3 feet of space in front of the breaker. They said this was necessary for safety reasons

Your job would be to call Orem city (you'll have to google the number for inspections) and then make sure the studio has those three things done when they come.$$,
   'Doing', 'High', 'Behind',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-03-11', 'March 1st - 15th'),

  ('1213523595074862',
   'Financing Options for Second Location',
   NULL,
   'Doing', 'High', 'On track',
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, '2026-03-31', 'March 16th - 29th'),

  ('1213523595074869',
   'Buy Security Cameras',
   $$My brother-in-law recommended Wyze cameras. I think they look good, but we might want to do some research and consider other options as well?

We need something where managers, area managers, and myself can check the feed on their phone.$$,
   'Doing', 'Medium', 'Done',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-03-21', 'March 1st - 15th'),

  ('1213523595074878',
   'Install Smart Lock on Front Door',
   $$I need smart locks on our doors so that deliveries can be made to the studio without having a person there. I've sent an email to 'Orem locksmith' to see if they can do it, but I haven't heard back.

We will need to do research on different smart locks and then find a locksmith to install them.

The new locks coupled with the cameras will make deliveries way easier.$$,
   'Doing', 'High', 'On track',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-03-21', NULL),

  ('1213523595074762',
   'Scripture Case & Key Chain',
   $$I want to start selling leather scripture cases and key chains.

I have already talked to a couple suppliers, but getting the dimensions on the scripture cases is kind of tricky and I'd love to have you take this over with my oversight.$$,
   'Doing', 'High', 'Behind',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-03-13', NULL),

  ('1213523595074886',
   'Buy A Truck',
   NULL,
   'Doing', 'Medium', 'Behind',
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, '2026-04-18', 'March 30th - April 12th'),

  ('1213523595074891',
   'Add More Products',
   NULL,
   'Doing', 'Low', 'On track',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-05-29', NULL),

  ('1213523595074905',
   'Switch from Gusto → Square Payroll',
   $$For this you'll just want to follow the directions in this article:

https://squareup.com/help/us/en/article/5605-sign-up-for-square-payroll

If you need our EIN it's: 39-2359834$$,
   'Doing', 'High', 'On track',
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, '2026-03-14', 'March 1st - 15th'),

  ('1213523595074897',
   'Start Text Marketing',
   NULL,
   'Doing', 'High', 'On Hold',
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, '2026-04-01', NULL),

  ('1213523595074847',
   'Employee Handbook',
   $$I am working on this and almost have the first draft done. When I have that done, I am going to send it to you to make edits and help clean it up$$,
   'Doing', 'High', 'On track',
   'samuel scadden', 'ssscadden@gmail.com',
   NULL, '2026-03-06', 'March 1st - 15th'),

  ('1213523595074856',
   'Sign Up for Farmers Markets',
   NULL,
   'Done', NULL, NULL,
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, NULL, NULL),

  ('1213523595074859',
   '2025 Taxes',
   NULL,
   'Done', NULL, NULL,
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, NULL, NULL),

  ('1213523595074865',
   'Get better Waiver System',
   NULL,
   'Done', 'High', 'Done',
   'Sam Robertson', 'contact@scorchedstudio.com',
   NULL, NULL, 'March 1st - 15th');
