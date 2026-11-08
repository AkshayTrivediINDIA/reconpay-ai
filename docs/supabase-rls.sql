-- ---------------------------------------------------------------------------
-- OPTIONAL Supabase Row Level Security template.
--
-- THIS IS NOT ACTIVE in the shipped application.
--
-- The application uses custom session authentication and a direct PostgreSQL
-- connection. It does not set app.organization_id and it may connect with a
-- role that bypasses RLS. Enabling these policies without the required
-- application changes will either be ineffective or break queries.
--
-- Before using this file:
--   1. Create a dedicated application role without BYPASSRLS and without table
--      ownership, e.g. reconpay_app.
--   2. Set `SET LOCAL app.organization_id = '<uuid>'` inside every request
--      transaction before running tenant queries. Never set it from an
--      unverified client header.
--   3. Grant only required table/sequence privileges to reconpay_app.
--   4. Verify with tests that a missing tenant setting returns zero rows and
--      that cross-tenant reads/writes fail.
--   5. Test Supabase Storage separately; these policies cover database tables.
--
-- organizations, users, sessions, password_reset_tokens and webhook_events need
-- separate access models and are not covered by this simple tenant template.
-- ---------------------------------------------------------------------------

create schema if not exists app;

create or replace function app.current_organization_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.organization_id', true), '')::uuid;
$$;

-- Organisation-scoped tables that carry an organization_id column.
do $$
declare
  target_table text;
  tenant_tables text[] := array[
    'vendors',
    'organization_members',
    'evidence_documents',
    'purchase_orders',
    'purchase_order_items',
    'goods_receipts',
    'goods_receipt_items',
    'invoices',
    'invoice_line_items',
    'reconciliation_runs',
    'discrepancies',
    'evidence_events',
    'evidence_reports',
    'settlements',
    'settlement_approvals',
    'payments',
    'payment_events',
    'integration_connections',
    'notifications',
    'audit_logs',
    'ai_usage_logs',
    'idempotency_keys'
  ];
begin
  foreach target_table in array tenant_tables loop
    execute format('alter table %I enable row level security', target_table);
    execute format('drop policy if exists tenant_isolation on %I', target_table);
    execute format(
      'create policy tenant_isolation on %I '
      'using (organization_id = (select app.current_organization_id())) '
      'with check (organization_id = (select app.current_organization_id()))',
      target_table
    );
  end loop;
end
$$;

-- The organisations table is scoped by its own id.
alter table organizations enable row level security;
drop policy if exists tenant_isolation on organizations;
create policy tenant_isolation on organizations
  using (id = (select app.current_organization_id()))
  with check (id = (select app.current_organization_id()));

-- The application role still needs explicit grants. Example only; review
-- privileges before use:
-- grant usage on schema public, app to reconpay_app;
-- grant select, insert, update, delete on all tables in schema public to reconpay_app;
-- grant usage, select on all sequences in schema public to reconpay_app;

-- Optional verification (run as a role subject to RLS):
-- begin;
-- select set_config('app.organization_id', '<org-uuid>', true);
-- select count(*) from invoices; -- only the selected organisation
-- rollback;
