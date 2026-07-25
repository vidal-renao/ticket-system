# ADR-001: Repository ownership

**Status:** Proposed. Ticket System owns UI, identity, roles, ticket/SLA/knowledge domain, approvals and dashboards. MCP owns versioned tool contracts and safe orchestration adapters. Supabase is persistent truth/vector/audit state. External workflows coordinate but contain no canonical business rules. This prevents a third application and divergent policy.

