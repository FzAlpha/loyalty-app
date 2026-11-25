-- Offer categories for the customer app's benefit tiles (F1, from the client's design).
-- Owners set a category per offer. Re-running refreshes name and order.
insert into public.offer_categories (key, name, sort_order) values
  ('member_discounts', 'Member Discounts',        10),
  ('friends_family',   'Friends & Family Offers', 20),
  ('exclusive_deals',  'Exclusive Deals',         30)
on conflict (key) do update
  set name = excluded.name,
      sort_order = excluded.sort_order;
