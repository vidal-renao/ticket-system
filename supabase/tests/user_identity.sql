-- pgTAP suite for Phase 4A.14 user identity (reference_code, customer_type,
-- self-service grants, logos storage). Run against the ephemeral CI database
-- after identity_legacy_base.sql + 202607270001_user_identity_onboarding.sql.
\set ON_ERROR_STOP on
SET search_path = pg_catalog, public, extensions;

BEGIN;
SELECT plan(37);

-- ---------------------------------------------------------------------------
-- rve_role_code() mapping
-- ---------------------------------------------------------------------------
SELECT is(public.rve_role_code('admin', NULL), 'ADM', 'admin maps to ADM regardless of customer_type');
SELECT is(public.rve_role_code('manager', NULL), 'MGR', 'manager maps to MGR');
SELECT is(public.rve_role_code('agent', NULL), 'EMP', 'agent maps to EMP');
SELECT is(public.rve_role_code('customer', 'individual'), 'CUS', 'individual customer maps to CUS');
SELECT is(public.rve_role_code('customer', 'company'), 'COM', 'company customer maps to COM');
SELECT is(public.rve_role_code('customer', NULL), NULL, 'customer with no customer_type is unresolved');
SELECT is(public.rve_role_code('customer', 'bogus'), NULL, 'customer with an invalid customer_type is unresolved');

-- ---------------------------------------------------------------------------
-- rve_random_suffix() format
-- ---------------------------------------------------------------------------
SELECT ok(
  public.rve_random_suffix() ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$',
  'random suffix matches the ambiguity-free alphabet and XXXX-XXXX shape'
);

-- ---------------------------------------------------------------------------
-- customer_type CHECK constraint
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO public.profiles (id, organization_id, role, customer_type)
     VALUES ('00000000-0000-4000-8000-000000000001', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'customer', NULL) $$,
  '23514', NULL,
  'a customer profile with no customer_type violates the CHECK constraint'
);

SELECT throws_ok(
  $$ INSERT INTO public.profiles (id, organization_id, role, customer_type)
     VALUES ('00000000-0000-4000-8000-000000000002', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'admin', 'individual') $$,
  '23514', NULL,
  'a non-customer profile with a customer_type violates the CHECK constraint'
);

SELECT lives_ok(
  $$ INSERT INTO public.profiles (id, organization_id, role, customer_type)
     VALUES ('00000000-0000-4000-8000-000000000003', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'customer', 'individual') $$,
  'an individual customer with customer_type=individual is accepted'
);

SELECT lives_ok(
  $$ INSERT INTO public.profiles (id, organization_id, role, customer_type)
     VALUES ('00000000-0000-4000-8000-000000000004', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'customer', 'company') $$,
  'a company customer with customer_type=company is accepted'
);

-- ---------------------------------------------------------------------------
-- Auto-generation on INSERT (role resolvable immediately)
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT reference_code FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000000003') ~ '^VRE-CUS-',
  'individual customer got an auto-generated VRE-CUS- code on insert'
);
SELECT ok(
  (SELECT reference_code FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000000004') ~ '^VRE-COM-',
  'company customer got an auto-generated VRE-COM- code on insert'
);

SELECT lives_ok(
  $$ INSERT INTO public.profiles (id, organization_id, role)
     VALUES ('00000000-0000-4000-8000-000000000005', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'admin') $$,
  'an admin profile (no customer_type needed) inserts cleanly'
);
SELECT ok(
  (SELECT reference_code FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000000005') ~ '^VRE-ADM-',
  'admin got an auto-generated VRE-ADM- code on insert'
);

SELECT lives_ok(
  $$ INSERT INTO public.profiles (id, organization_id, role)
     VALUES ('00000000-0000-4000-8000-000000000006', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'agent') $$,
  'an agent profile inserts cleanly'
);
SELECT ok(
  (SELECT reference_code FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000000006') ~ '^VRE-EMP-',
  'agent got an auto-generated VRE-EMP- code on insert'
);

-- ---------------------------------------------------------------------------
-- Two-step signup: bare row (handle_new_user shape), then role assigned
-- later via UPDATE -- the reference_code must be generated on that UPDATE,
-- not left permanently NULL.
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$ INSERT INTO public.profiles (id, organization_id, role)
     VALUES ('00000000-0000-4000-8000-000000000008', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'agent') $$,
  'bare agent row (simulating a handle_new_user-created default) inserts cleanly'
);
SELECT lives_ok(
  $$ UPDATE public.profiles SET role = 'manager' WHERE id = '00000000-0000-4000-8000-000000000008' $$,
  'promoting the profile to manager via UPDATE succeeds'
);
SELECT ok(
  (SELECT reference_code FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000000008') ~ '^VRE-MGR-',
  'reference_code was assigned on the role-change UPDATE, with the new role''s prefix'
);

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE public.profiles SET reference_code = 'VRE-MGR-ZZZZ-ZZZZ' WHERE id = '00000000-0000-4000-8000-000000000008' $$,
  'P0001', 'RVE_REFERENCE_CODE_IMMUTABLE: reference_code cannot be changed once set',
  'an already-set reference_code cannot be overwritten, even to another well-formed code'
);

SELECT lives_ok(
  $$ UPDATE public.profiles SET full_name = 'Renamed Manager' WHERE id = '00000000-0000-4000-8000-000000000008' $$,
  'updating an unrelated column on a profile with an existing reference_code still succeeds'
);
SELECT ok(
  (SELECT reference_code FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000000008') ~ '^VRE-MGR-',
  'reference_code is unchanged after the unrelated-column update'
);

-- ---------------------------------------------------------------------------
-- Uniqueness
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  format(
    $$ INSERT INTO public.profiles (id, organization_id, role, reference_code)
       VALUES ('00000000-0000-4000-8000-000000000010', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'admin', %L) $$,
    (SELECT reference_code FROM public.profiles WHERE id = '00000000-0000-4000-8000-000000000005')
  ),
  '23505', NULL,
  'inserting a second profile with an already-used reference_code violates the UNIQUE constraint'
);

-- ---------------------------------------------------------------------------
-- Format constraint
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO public.profiles (id, organization_id, role, reference_code)
     VALUES ('00000000-0000-4000-8000-000000000011', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'admin', 'not-a-valid-code') $$,
  '23514', NULL,
  'a malformed reference_code violates the format CHECK constraint'
);

SELECT throws_ok(
  $$ INSERT INTO public.profiles (id, organization_id, role, reference_code)
     VALUES ('00000000-0000-4000-8000-000000000012', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'admin', 'VRE-XXX-AAAA-AAAA') $$,
  '23514', NULL,
  'a reference_code with an unrecognized role prefix violates the format CHECK constraint'
);

-- ---------------------------------------------------------------------------
-- Column-level grants for authenticated (self-service editable vs protected)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);

SELECT lives_ok(
  $$ UPDATE public.profiles SET full_name = 'My New Name' WHERE id = '00000000-0000-4000-8000-000000000003' $$,
  'authenticated can update their own full_name (self-service editable)'
);
SELECT lives_ok(
  $$ UPDATE public.profiles SET phone = '+41 00 000 00 00' WHERE id = '00000000-0000-4000-8000-000000000003' $$,
  'authenticated can update their own phone'
);
SELECT lives_ok(
  $$ UPDATE public.profiles SET address = 'Bahnhofstrasse 1', city = 'Basel', postal_code = '4001', country = 'CH' WHERE id = '00000000-0000-4000-8000-000000000003' $$,
  'authenticated can update their own address fields'
);
SELECT throws_ok(
  $$ UPDATE public.profiles SET customer_type = 'company' WHERE id = '00000000-0000-4000-8000-000000000003' $$,
  '42501', NULL,
  'authenticated cannot change their own customer_type (no column grant)'
);
SELECT throws_ok(
  $$ UPDATE public.profiles SET reference_code = 'VRE-CUS-AAAA-AAAA' WHERE id = '00000000-0000-4000-8000-000000000003' $$,
  '42501', NULL,
  'authenticated cannot change their own reference_code (no column grant)'
);
SELECT throws_ok(
  $$ UPDATE public.profiles SET role = 'admin' WHERE id = '00000000-0000-4000-8000-000000000003' $$,
  '42501', NULL,
  'authenticated cannot change their own role (pre-existing protection, still intact)'
);
SELECT throws_ok(
  $$ UPDATE public.profiles SET organization_id = NULL WHERE id = '00000000-0000-4000-8000-000000000003' $$,
  '42501', NULL,
  'authenticated cannot change their own organization_id (pre-existing protection, still intact)'
);

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Storage: logos bucket + folder-scoped RLS (mirrors avatars exactly)
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'logos' AND public = true),
  'logos bucket exists and is public'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);

SELECT lives_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('logos', '00000000-0000-4000-8000-000000000004/logo.png', '00000000-0000-4000-8000-000000000004') $$,
  'authenticated can upload a logo into their own folder'
);
SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('logos', '00000000-0000-4000-8000-000000000003/logo.png', '00000000-0000-4000-8000-000000000004') $$,
  '42501', NULL,
  'authenticated cannot upload into a different user''s logo folder'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
