# System context

```text
Customer/Staff -> Ticket System (UI, auth, approvals, dashboard)
                     | authenticated server boundary
                     v
                  Supabase
       relational truth + vectors + audit/workflow state
                     ^
                     | fixed deployment tenant + authorized contracts
External automation -> MCP (tools, orchestration, audits)
                     |
                     +-> Anthropic (analysis/generation)
                     +-> OpenAI (embeddings, proposed MVP)
                     +-> Resend (approved/audit delivery)
```

Ticket System owns user experience, identities, roles, ticket domain, SLA configuration, knowledge administration, approvals and visualization. MCP owns tool contracts and safe orchestration, not canonical domain rules. Supabase owns durable state and tenant enforcement. Providers are processors, never sources of truth.

Trust boundaries are browser/server, server/Supabase, automation/MCP, MCP/providers and public/private UI. Organization identity is derived from the authenticated profile in Ticket System or fixed trusted deployment configuration in MCP. External workflow payloads cannot nominate it.

The public portfolio route uses static demo fixtures only and exposes no internal endpoints, identifiers, logs or write tools.

