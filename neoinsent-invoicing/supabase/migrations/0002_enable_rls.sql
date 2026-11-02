-- Blocks the anon/authenticated Supabase roles entirely (this app never uses
-- them — only the backend's service_role key talks to Supabase, which always
-- bypasses RLS regardless of this setting). Applied as a deliberate choice
-- after Supabase's security advisor flagged RLS-disabled tables as critical.
ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."invoice_counters" ENABLE ROW LEVEL SECURITY;
