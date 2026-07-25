# ADR-007: Environments

**Status:** Proposed. Local, staging and production use separate Supabase projects/credentials, provider keys, storage, schedules and allowlists. Local uses synthetic fixtures/mocks; staging uses synthetic or approved test data and safe recipients; production promotion is feature-flagged and canaried. No production data is copied down. Configuration health reveals missing keys, never values.

