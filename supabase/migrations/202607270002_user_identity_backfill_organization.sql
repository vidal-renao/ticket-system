-- ============================================================================
-- Phase 4A.14 §12: backfill organization_id for the 10 profiles identified,
-- with evidence, as legitimate Vidal Real Estate customers in
-- secure-reports/ai-helpdesk/orphan-profiles-classification-2026-07-26.md.
--
-- Deliberately excludes the 3 profiles classified there as "ambiguous"
-- (admin@dnamar.test, test-a@waai-staging.dev, test-b@waai-staging.dev --
-- domain/name evidence suggests they belong to other projects sharing this
-- Supabase instance, not to this HelpDesk). Idempotent: only touches rows
-- that are still NULL, and only the exact 10 ids below -- never overwrites
-- an existing organization_id, never touches a row outside this named list.
--
-- Rollback: UPDATE public.hd_profiles SET organization_id = NULL
--           WHERE id IN (<the 10 ids below>);
-- ============================================================================

BEGIN;
SET LOCAL search_path = public, pg_temp;

DO $$
DECLARE
  v_org_id uuid;
  v_legitimate_ids uuid[] := ARRAY[
    '9f07b155-bf0e-43eb-aeb8-1391c9f1282a', -- angel@gmail.com
    'd0f294ac-6d5c-4946-95cd-ef1350306242', -- belindabeck@gmail.ch
    'ea078959-a58d-4c6e-a763-a82380894c22', -- juan@gmail.com
    '5024ead5-4f21-42ff-93c3-6252935feeec', -- lucas@gmail.com
    'b75835f5-265d-455c-bbb5-6bb7b31ccc81', -- luis@gmail.com (Luis Garcia)
    'bd587eff-7121-495b-a548-1c1235f7d5f9', -- mar@gmail.com
    'c0c807f9-42da-473f-b287-31eabb8e70be', -- pablo@gmail.com (Pablo Garcia)
    '8c732204-f456-493b-bccd-d6fe29435f98', -- salma@gmail.com
    '1db687ba-139b-4de9-ae13-0d65776e8fbf', -- vidal-31@hotmail.com
    '6b625d7e-6dfe-4c9f-8873-c85ff83b2227'  -- htcpacoxo31@gmail.com
  ]::uuid[];
  v_updated_count integer;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'vidal-real-estate';
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'RVE_BACKFILL_CANONICAL_ORG_NOT_FOUND: no organizations row with slug=vidal-real-estate';
  END IF;

  UPDATE public.hd_profiles
  SET organization_id = v_org_id
  WHERE id = ANY (v_legitimate_ids)
    AND organization_id IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'RVE_BACKFILL_ORGANIZATION: assigned Vidal Real Estate to % profile(s) (of % candidate ids; already-assigned or missing rows are skipped, never overwritten)',
    v_updated_count, array_length(v_legitimate_ids, 1);
END $$;

COMMIT;
