import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Toaster } from "sonner";
import { routing } from "@/i18n/routing";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://helpdesk.vidallab.ch";

const OG_LOCALE: Record<string, string> = {
  de: "de_CH",
  en: "en_US",
  es: "es_ES",
};

const JSON_LD_DESCRIPTIONS: Record<string, string> = {
  de: "KI-gestützte IT-Helpdesk-SaaS für Schweizer KMU mit DSG/nDSG-Compliance, mehrsprachigem Support (DE/EN/ES) und Claude-gesteuertem Ticket-Triage.",
  en: "AI-powered IT helpdesk SaaS for Swiss SMEs with DSG/nDSG compliance, multilingual support (DE/EN/ES) and Claude-powered ticket triage.",
  es: "SaaS de helpdesk IT con IA para pymes suizas con cumplimiento DSG/nDSG, soporte multilingüe (DE/EN/ES) y triage de tickets con Claude.",
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
    robots: { index: false, follow: false }, // Private SaaS — no public indexing
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
    offers: { "@type": "Offer", price: "0", priceCurrency: "CHF" },
  };

  return (
    <html lang={locale} className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
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
      </body>
    </html>
  );
}
