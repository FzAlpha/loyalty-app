alter table public.partner_applications enable row level security;

-- No policies: deny by default. Read and write only through the 55_partners RPCs.
