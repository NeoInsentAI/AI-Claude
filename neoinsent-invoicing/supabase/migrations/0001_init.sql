create extension if not exists "pgcrypto";

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  email text not null,
  address_line text not null,
  postal_code text not null,
  city text not null,
  country text not null,
  vat_number text,
  kvk_number text,
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  client_id uuid not null references clients(id),
  status text not null default 'draft' check (status in ('draft', 'final')),
  language text not null check (language in ('nl', 'en')),
  vat_treatment text not null check (vat_treatment in ('nl_standard', 'eu_reverse_charge')),
  issue_date date not null,
  due_date date not null,
  notes text,
  subtotal numeric(12, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  pdf_path text,
  paid boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null,
  unit_price numeric(12, 2) not null,
  vat_rate numeric(4, 2) not null,
  line_total numeric(12, 2) not null,
  sort_order int not null default 0
);

create table invoice_counters (
  year int primary key,
  last_number int not null default 0
);

create index invoices_status_idx on invoices (status);
create index invoices_issue_date_idx on invoices (issue_date);
create index invoice_items_invoice_id_idx on invoice_items (invoice_id);

-- Atomically assigns the next gap-free invoice number for a given year.
-- Called once, at finalize time, inside Task 14's API route.
create or replace function next_invoice_number(p_year int)
returns int
language plpgsql
as $$
declare
  next_val int;
begin
  insert into invoice_counters (year, last_number)
  values (p_year, 1)
  on conflict (year) do update set last_number = invoice_counters.last_number + 1
  returning last_number into next_val;
  return next_val;
end;
$$;

-- Private bucket for the permanent, never-regenerated invoice PDFs.
insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;
