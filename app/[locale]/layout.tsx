import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Toaster } from "sonner";
import { routing } from "@/i18n/routing";
import { HtmlLang } from "@/components/layout/HtmlLang";
import { appUrl } from "@/lib/app-url";
import "../globals.css";

const APP_URL = appUrl();

const OG_LOCALE: Record<string, string> = {
  de: "de_CH",
  en: "en_US",
  es: "es_ES",
};

const JSON_LD_DESCRIPTIONS: Record<string, string> = {
  de: "Mehrsprachiger IT-Helpdesk für Schweizer KMU mit SLA-Workflows, Mandantentrennung und KI-gestützter Ticket-Triage.",
  en: "Multilingual IT helpdesk for Swiss SMEs with SLA workflows, tenant isolation and AI-assisted ticket triage.",
  es: "Helpdesk IT multilingüe para pymes suizas con flujos SLA, aislamiento por organización y triage asistido por IA.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: { default: "HelpDesk AI", template: "%s | HelpDesk AI" },
    description: JSON_LD_DESCRIPTIONS[locale] ?? JSON_LD_DESCRIPTIONS.en,
    metadataBase: new URL(APP_URL),
    openGraph: {
      type: "website",
      siteName: "HelpDesk AI",
      locale: OG_LOCALE[locale] ?? "de_CH",
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "HelpDesk AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: locale,
    description: JSON_LD_DESCRIPTIONS[locale] ?? JSON_LD_DESCRIPTIONS.en,
    author: { "@type": "Person", name: "Vidal Reñao", url: "https://vidalrenao.ch" },
  };

  return (
    <>
      <HtmlLang locale={locale} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NextIntlClientProvider messages={messages}>
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "var(--color-surface-800)",
              border: "1px solid var(--color-surface-600)",
              color: "var(--color-text-primary)",
            },
          }}
        />
      </NextIntlClientProvider>
    </>
  );
}
