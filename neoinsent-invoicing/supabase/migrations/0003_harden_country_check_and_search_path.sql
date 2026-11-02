-- Code-review finding: determineVatTreatment() in src/lib/vat.ts depends
-- entirely on clients.country being an exact uppercase 2-letter ISO code.
-- Nothing enforced that at the DB layer before, and the planned client form
-- (Task 10) is free text — this fails closed (bad input just gets classified
-- not_supported) but is a guaranteed data-entry papercut without this check.
-- Added while the table is still empty, before any real client rows exist.
alter table public.clients
  add constraint clients_country_format_check
  check (country = upper(country) and char_length(country) = 2);

-- Code-review finding: Supabase's security advisor flags plpgsql functions
-- with a mutable search_path. Zero-cost hardening — only service_role ever
-- calls this function, but pinning search_path and schema-qualifying the
-- table reference removes the advisory finding with no behavior change.
create or replace function next_invoice_number(p_year int)
returns int
language plpgsql
set search_path = ''
as $$
declare
  next_val int;
begin
  insert into public.invoice_counters (year, last_number)
  values (p_year, 1)
  on conflict (year) do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into next_val;
  return next_val;
end;
$$;
