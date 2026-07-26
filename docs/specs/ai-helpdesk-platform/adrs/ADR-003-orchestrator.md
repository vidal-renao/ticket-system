# ADR-003: Orchestrator

**Status:** Proposed. Use a Supabase-backed internal workflow state machine with Vercel workers/scheduling for MVP. GitHub Actions is suitable only for simple administrative schedules; workflow 294419190 remains disabled. Defer n8n until integration volume warrants its additional infrastructure and security boundary. Reassess in staging using the matrix in `07-workflow-orchestration.md`.

