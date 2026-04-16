import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: { default: "HelpDesk AI", template: "%s | HelpDesk AI" },
  description: "AI-powered IT helpdesk for Swiss SMEs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
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
      </body>
    </html>
  );
}
