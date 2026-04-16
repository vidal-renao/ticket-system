import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

/**
 * Root layout — required by Next.js 15.5+ to provide <html> and <body>.
 * The `lang` attribute is set dynamically per locale via HtmlLang (client component).
 * `suppressHydrationWarning` prevents React warnings on lang mismatch during hydration.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
