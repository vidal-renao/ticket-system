import { LandingPage } from "@/components/marketing/LandingPage";

/** Public landing page — always accessible, even when authenticated. */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <LandingPage locale={locale} />;
}
