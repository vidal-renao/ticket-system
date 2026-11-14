import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { appUrl } from "@/lib/app-url";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot-script";

const APP_URL = appUrl();

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "HelpDesk AI",
    template: "%s | HelpDesk AI",
  },
  description:
    "AI-powered IT helpdesk SaaS for Swiss SMEs with multilingual support, SLA tracking, and operational workflows for support teams.",
  applicationName: "HelpDesk AI",
  openGraph: {
    title: "HelpDesk AI",
    description:
      "Operational helpdesk software for Swiss SMEs with multilingual support, SLA tracking, and AI-assisted triage.",
    url: APP_URL,
    siteName: "HelpDesk AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HelpDesk AI",
    description:
      "Operational helpdesk software for Swiss SMEs with multilingual support, SLA tracking, and AI-assisted triage.",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Rendered on the server so the first byte already carries the page's real
  // language. A static lang="de" on /en pages made Chrome offer (or apply) a
  // German-to-user-language translation, which rewrote the English login into
  // machine-translated Spanish.
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {children}
        {/* Brightness overlay: soft-light blend, never intercepts clicks. */}
        <div
          id="hd-brightness-overlay"
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            pointerEvents: "none",
            mixBlendMode: "soft-light",
            background: "var(--hd-brightness-bg, #ffffff)",
            opacity: "var(--hd-brightness-opacity, 0)",
            transition: "opacity 200ms ease",
          }}
        />
      </body>
    </html>
  );
}
