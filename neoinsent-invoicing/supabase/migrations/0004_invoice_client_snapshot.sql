-- Clients became editable (user-approved addendum, 2026-11-03). To keep issued
-- invoices immutable, the client's details are copied onto the invoice when it
-- is finalized; PDFs, emails and tax reports for final invoices read this
-- snapshot instead of the live clients row.
alter table public.invoices add column client_snapshot jsonb;

alter table public.invoices
  add constraint invoices_final_requires_snapshot
  check (status = 'draft' or client_snapshot is not null);
