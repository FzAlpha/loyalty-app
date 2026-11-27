-- Roles and permissions (BACKEND_PLAN.md §5). No manager role in Phase 1 (decided).
insert into public.roles (key, name) values
  ('customer',  'Customer'),
  ('executive', 'Executive (one business)'),
  ('partner',   'Partner business (own business only)'),
  ('owner',     'Owner (all businesses)')
on conflict (key) do update set name = excluded.name;

insert into public.permissions (key, description) values
  ('card.view',                      'Scan and view cards'),
  ('card.approve',                   'Approve or reject card requests'),
  ('card.block',                     'Block a card'),
  ('card.reissue',                   'Reissue a card'),
  ('card.batch.create',              'Create card batches'),
  ('claim.preview',                  'Preview a claim QR'),
  ('claim.redeem',                   'Redeem a claim'),
  ('offer.manage',                   'Create and edit offers'),
  ('business.manage',                'Edit business details'),
  ('staff.manage',                   'Create, change and disable staff'),
  ('customer.view',                  'View customer details'),
  ('customer.manage',                'Change customer accounts'),
  ('customer.recover',               'Issue an in-store recovery code'),
  ('customer.recover_remote',        'Issue a remote recovery code (restricted)'),
  ('customer.identity_check',        'Record an in-store identity check'),
  ('customer.release_phone.request', 'Request a phone number release'),
  ('customer.release_phone.approve', 'Approve or reject a phone number release'),
  ('report.view',                    'View reports'),
  ('audit.view',                     'View audit logs'),
  ('settings.manage',                'Change app settings'),
  ('partner.manage',                 'Approve, reject and revoke partner businesses')
on conflict (key) do update set description = excluded.description;

-- Executive: front-of-store work for one business. Partner: its own offers and redemptions
-- (plan §4 partners). Owner: everything.
with m(role_key, perm_key) as (
  values
    ('executive', 'card.view'), ('executive', 'card.approve'),
    ('executive', 'claim.preview'), ('executive', 'claim.redeem'),
    ('executive', 'customer.view'), ('executive', 'customer.recover'),
    ('executive', 'customer.identity_check'), ('executive', 'customer.release_phone.request'),
    ('partner', 'offer.manage'), ('partner', 'card.view'),
    ('partner', 'claim.preview'), ('partner', 'claim.redeem')
  union all
  select 'owner', key from public.permissions
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from m
join public.roles r on r.key = m.role_key
join public.permissions p on p.key = m.perm_key
on conflict do nothing;
