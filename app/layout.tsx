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

// Applies the stored theme and brightness before first paint (no flash).
const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var mode = localStorage.getItem("hd_theme") || "auto";
    var resolved = mode === "auto"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : mode;
    document.documentElement.setAttribute("data-theme", resolved);
    // Sidebar rail state, applied here so a collapsed rail never flashes open.
    document.documentElement.setAttribute(
      "data-sidebar",
      localStorage.getItem("hd_sidebar") === "collapsed" ? "collapsed" : "expanded"
    );
    var b = Number(localStorage.getItem("hd_brightness") || "50");
    if (isFinite(b) && b !== 50) {
      document.documentElement.style.setProperty("--hd-brightness-bg", b >= 50 ? "#ffffff" : "#000000");
      document.documentElement.style.setProperty("--hd-brightness-opacity", String(Math.min(0.42, Math.abs(b - 50) / 120)));
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" suppressHydrationWarning>
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
