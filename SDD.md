# Spec-Driven Development

Meaningful features and changes to authorization, data, lifecycle, integrations or UI flows follow this sequence:

## Context

Describe the existing behavior, actors, code paths and data involved.

## Problem

State the user or operational problem without prescribing implementation.

## Requirements

List observable outcomes, authorization rules, error states and acceptance criteria.

## Constraints

Record compatibility, tenant isolation, privacy, migration, performance and rollout constraints.

## Design

Define changed boundaries, contracts, schema, threat considerations and alternatives rejected.

## Implementation

Split work into reviewable changes. Include migrations and feature flags where rollback requires them.

## Validation

Map each requirement to unit, integration, component, E2E or manual verification. Record actual results and unresolved risk.

A specification may be a focused issue or document; it must exist before coding for changes with cross-module or production-data impact.
