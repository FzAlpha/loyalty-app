-- DEMO DATA for local/staging only. Never run on production.
-- Everything is named "Demo ..." so it is easy to spot and remove (see the cleanup block at the end).
-- Part 1 is safe to run more than once. Part 2 needs a customer who registered through the app.

-- ---------------------------------------------------------------- part 1: businesses, offers, partner
insert into public.businesses (slug, name, brand_color, category, address) values
  ('demo-furniture',   'Demo Furniture House', '#8B5A2B', 'Furniture',   'Demo Street 1'),
  ('demo-electronics', 'Demo Electronics',     '#1F6FEB', 'Electronics', 'Demo Street 2'),
  ('demo-fashion',     'Demo Fashion Studio',  '#C2185B', 'Fashion',     'Demo Street 3'),
  ('demo-dining',      'Demo Dining Lounge',   '#2E7D32', 'Restaurant',  'Demo Street 4')
on conflict (slug) do nothing;

with b as (select id, slug from public.businesses where slug like 'demo-%'),
     c as (select id, key from public.offer_categories),
     v (slug, cat, title, description, terms, min_amt, max_amt) as (values
  ('demo-furniture',   'member_discounts', 'Demo: 10% off sofas',            'Members save 10% on any sofa.',              'Demo offer. One use per member.', 5000, 3000),
  ('demo-furniture',   'exclusive_deals',  'Demo: Free delivery',            'Free home delivery on orders over ₹20,000.', 'Demo offer.',                     20000, null),
  ('demo-electronics', 'member_discounts', 'Demo: ₹1,000 off TVs',           'Flat ₹1,000 off any TV over ₹25,000.',       'Demo offer.',                     25000, 1000),
  ('demo-fashion',     'friends_family',   'Demo: Bring a friend, 15% off', 'You and a friend each get 15% off.',         'Demo offer.',                     2000, 1500),
  ('demo-dining',      'exclusive_deals',  'Demo: Complimentary dessert',    'A free dessert with any main course.',       'Demo offer. Dine-in only.',       null, null),
  ('demo-dining',      'member_discounts', 'Demo: 20% off weekday lunch',    'Members get 20% off lunch Mon–Fri.',         'Demo offer.',                     500, 800)
)
insert into public.offers (business_id, category_id, title, description, terms, status, starts_at, ends_at,
                           min_purchase_amount, max_discount_amount, max_uses_per_customer)
select b.id, c.id, v.title, v.description, v.terms, 'active', now() - interval '1 day', now() + interval '90 days',
       v.min_amt, v.max_amt, 1
from v join b on b.slug = v.slug join c on c.key = v.cat
where not exists (select 1 from public.offers o where o.business_id = b.id and o.title = v.title);

-- Demo partner business (plan §4 partners). Real partners sign up in the staff app and get a
-- partner_applications row; this one has no applicant account, so it shows only on the customer side.
insert into public.businesses (slug, name, brand_color, category, address, website_url, kind) values
  ('demo-travels', 'Demo Travels', '#00838F', 'Travel', 'Demo Street 5', 'https://example.com', 'partner')
on conflict (slug) do nothing;

with b as (select id from public.businesses where slug = 'demo-travels'),
     c as (select id from public.offer_categories where key = 'exclusive_deals'),
     v (title, description, min_amt, max_amt) as (values
  ('Demo: 15% off hotel stays', 'Members save 15% on partner hotel bookings.', 3000, 2000),
  ('Demo: ₹500 off flights',    'Flat ₹500 off domestic flights.',             4000, 500)
)
insert into public.offers (business_id, category_id, title, description, terms, status, starts_at, ends_at,
                           min_purchase_amount, max_discount_amount, max_uses_per_customer)
select b.id, c.id, v.title, v.description, 'Demo offer.', 'active', now() - interval '1 day', now() + interval '90 days',
       v.min_amt, v.max_amt, 1
from v, b, c
where not exists (select 1 from public.offers o where o.business_id = b.id and o.title = v.title);

-- ---------------------------------------------------------------- part 2: activate a demo customer
-- Give a customer (who registered in the app) an active demo card, as if staff had approved it.
-- No identity check is recorded, so the app correctly shows "identity not checked".
-- Run first:  select set_config('demo.phone', '<the customer''s E.164 phone>', false);
do $$
declare
  v_phone text := current_setting('demo.phone', true);
  v_uid uuid;
  v_batch uuid;
  v_card uuid;
  v_prefix text := private.get_setting('cards.number_prefix') #>> '{}';
  v_digits integer := (private.get_setting('cards.number_digits'))::integer;
  v_bytes integer := (private.get_setting('cards.token_bytes'))::integer;
begin
  if v_phone is null or v_phone = '' then
    raise notice 'demo.phone not set; skipping part 2';
    return;
  end if;
  select id into v_uid from public.profiles where phone_e164 = v_phone;
  if v_uid is null then
    raise exception 'No profile with phone %', v_phone;
  end if;
  if exists (select 1 from public.cards where current_customer_id = v_uid) then
    raise notice 'Customer already has a card; nothing to do';
    return;
  end if;

  insert into public.card_batches (label, quantity, created_by, exported_at, export_count)
  values ('DEMO batch', 1, v_uid, now(), 1) returning id into v_batch;
  insert into public.cards (batch_id, card_number, token_hash, status, current_customer_id)
  values (v_batch, v_prefix || '-' || lpad(nextval('public.card_number_seq')::text, v_digits, '0'),
          private.card_token_hash(extensions.gen_random_bytes(v_bytes)), 'active', v_uid)
  returning id into v_card;
  insert into public.card_assignments (card_id, customer_id, status, decided_at, reason)
  values (v_card, v_uid, 'approved', now(), 'DEMO seed');
  perform private.set_membership_status(v_uid, 'active');
end;
$$;

-- ---------------------------------------------------------------- cleanup (run by hand to remove demo data)
-- delete from public.offers where business_id in (select id from public.businesses where slug like 'demo-%');
-- delete from public.businesses where slug like 'demo-%';
-- Demo cards: see card_batches where label = 'DEMO batch' (assignments, cards, batch; reset membership_status).
