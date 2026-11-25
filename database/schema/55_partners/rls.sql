alter table public.partners enable row level security;
alter table public.partner_offers enable row level security;

-- Members read partner offers through api.list_partner_offers (membership check). Direct table reads:
-- active partners for signed-in users; everything for partner.manage holders. No write policies.
create policy partners_select_active on public.partners for select to authenticated
  using (is_active);
create policy partners_select_manager on public.partners for select to authenticated
  using ((select api.has_permission('partner.manage', null)));
create policy partner_offers_select_manager on public.partner_offers for select to authenticated
  using ((select api.has_permission('partner.manage', null)));
