export const RAG_FIXTURE_IDS = {
  organizationAlpha: "10000000-0000-4000-8000-000000000001",
  organizationBeta: "20000000-0000-4000-8000-000000000002",
  alphaAdmin: "10000000-0000-4000-8000-000000000011",
  alphaAgent: "10000000-0000-4000-8000-000000000012",
  betaAdmin: "20000000-0000-4000-8000-000000000011",
  printerManual: "10000000-0000-4000-8000-000000000101",
  vpnProcedure: "10000000-0000-4000-8000-000000000102",
  syntheticFaq: "20000000-0000-4000-8000-000000000101",
} as const;

export const SYNTHETIC_KNOWLEDGE_FIXTURES = [
  { organization: "Organization Alpha", title: "Fictional printer manual" },
  { organization: "Organization Alpha", title: "Fictional VPN procedure" },
  { organization: "Organization Beta", title: "Fictional support FAQ" },
] as const;

