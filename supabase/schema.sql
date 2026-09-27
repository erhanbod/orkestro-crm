create extension if not exists pgcrypto;

create type deal_stage as enum (
  'Lead',
  'Contact Made',
  'Presentation',
  'Negotiation',
  'Verbal Won'
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aud_value bigint not null default 0 check (aud_value >= 0),
  stage deal_stage not null default 'Lead',
  owner text not null,
  account_or_partner text not null,
  contact_name text,
  expected_close_date date not null,
  lead_source text default 'Unknown',
  probability integer not null default 0 check (probability between 0 and 100),
  next_activity text,
  is_archived boolean not null default false,
  archived_at timestamptz,
  deal_updates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger deals_updated_at
before update on public.deals
for each row
execute function public.update_updated_at_column();

alter table public.deals enable row level security;

create policy "Allow read access for everyone in MVP"
  on public.deals
  for select
  using (true);

create policy "Allow insert access for everyone in MVP"
  on public.deals
  for insert
  with check (true);

create policy "Allow update access for everyone in MVP"
  on public.deals
  for update
  using (true)
  with check (true);

create policy "Allow delete access for everyone in MVP"
  on public.deals
  for delete
  using (true);

create index if not exists deals_stage_idx
  on public.deals (stage);

create index if not exists deals_owner_idx
  on public.deals (owner);

create index if not exists deals_expected_close_date_idx
  on public.deals (expected_close_date);

-- Example seed rows for local testing
insert into public.deals (
  name,
  aud_value,
  stage,
  owner,
  account_or_partner,
  contact_name,
  expected_close_date,
  lead_source,
  probability,
  next_activity,
  is_archived,
  deal_updates
)
values
  ('Northstar Analytics', 42000, 'Lead', 'Maya', 'Northstar', 'Olivia Chen', '2026-10-15', 'Website inquiry', 25, 'Discovery call with CFO', false, '[]'::jsonb),
  ('Apex Logistics', 65000, 'Contact Made', 'Leo', 'Apex Group', 'Marcus Bell', '2026-10-28', 'Outbound campaign', 45, 'Demo for operations team', false, '[]'::jsonb),
  ('Bluepeak Studio', 31000, 'Presentation', 'Aisha', 'Bluepeak', 'Sana Kim', '2026-11-08', 'Referral', 60, 'Send proposal and pricing deck', false, '[]'::jsonb),
  ('Harbor Health', 92000, 'Negotiation', 'Dylan', 'Harbor', 'Nina Patel', '2026-11-18', 'Partner referral', 75, 'Negotiate contract terms', false, '[]'::jsonb),
  ('Summit Energy', 138000, 'Verbal Won', 'Priya', 'Summit Renewables', 'Aaron Cole', '2026-12-02', 'Conference', 90, 'Finalize onboarding and kickoff plan', false, '[]'::jsonb)
on conflict do nothing;
