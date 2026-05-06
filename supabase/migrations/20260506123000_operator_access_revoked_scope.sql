alter table public.operator_access
drop constraint if exists operator_access_scope_consistency;

alter table public.operator_access
add constraint operator_access_scope_consistency check (
  status = 'revoked'
  or role = 'admin'
  or can_view_all
  or cardinality(view_group_keys) > 0
  or cardinality(view_company_ids) > 0
);
