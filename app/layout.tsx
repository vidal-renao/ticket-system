import type { Metadata } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://helpdesk.vidallab.ch";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
