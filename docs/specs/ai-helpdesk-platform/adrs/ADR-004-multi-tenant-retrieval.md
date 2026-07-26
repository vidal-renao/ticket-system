# ADR-004: Multi-tenant retrieval

**Status:** Proposed. Caller schemas never accept organization identity. The authenticated server or fixed MCP deployment context derives it, and SQL/RPC applies it before vector ranking. RLS is defense in depth, not a substitute for service-role predicates. Cross-tenant adversarial database tests are release-blocking.

