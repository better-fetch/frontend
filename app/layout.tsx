import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Button } from "@/components/ui/button";
import { getClaims } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const DESCRIPTION =
  "Fetch any URL through a real browser. JavaScript rendering, browser geo-emulation, sticky sessions, screenshots, and clearance-cookie helpers — one API call.";

export const metadata: Metadata = {
  metadataBase: new URL("https://betterfetch.co"),
  title: {
    default: "Better Fetch — browser-grade URL fetching API",
    template: "%s — Better Fetch",
  },
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  applicationName: "Better Fetch",
  keywords: [
    "browser fetch API",
    "headless browser API",
    "web scraping API",
    "JavaScript rendering",
    "Cloudflare bypass",
    "browser automation API",
    "screenshot API",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Better Fetch",
    title: "Better Fetch — browser-grade URL fetching API",
    description: DESCRIPTION,
    url: "https://betterfetch.co",
  },
  twitter: {
    card: "summary_large_image",
    title: "Better Fetch — browser-grade URL fetching API",
    description: DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const signedIn = Boolean(await getClaims());

  return (
    <html
      lang="en"
      className={cn("scroll-smooth", geist.variable, geistMono.variable)}
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
            <Link href="/" className="flex items-center">
              <Image
                src="/logo-white.svg"
                alt="Better Fetch"
                width={22}
                height={22}
                priority
              />
            </Link>
            <nav className="flex items-center gap-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/docs">Docs</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/mcp">MCP</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/plugin">Plugin</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/blog">Blog</Link>
              </Button>
              {signedIn ? (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/keys">API keys</Link>
                  </Button>
                  <form action="/auth/signout" method="post">
                    <Button variant="outline" size="sm" type="submit">
                      Sign out
                    </Button>
                  </form>
                </>
              ) : (
                <Button size="sm" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-10">{children}</main>
        <footer className="border-t">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-12 text-center">
            <div className="space-y-1">
              <p className="text-lg font-semibold tracking-tight">
                {signedIn ? "Back to your keys?" : "Ready to unlock the web?"}
              </p>
              <p className="text-sm text-muted-foreground">
                {signedIn
                  ? "Keys, usage, and your plan — all in one place."
                  : "50 free browser-grade calls a month. One API call, any URL."}
              </p>
            </div>
            <Button asChild>
              <Link href={signedIn ? "/keys" : "/login"}>
                {signedIn ? "Open dashboard" : "Get started free"}
              </Link>
            </Button>
            <div className="flex w-full flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Image src="/logo-white.svg" alt="" width={18} height={18} />
                <span>© {new Date().getFullYear()} Better Fetch</span>
              </div>
              <nav className="flex gap-4 text-sm text-muted-foreground">
                <Link href="/docs" className="hover:text-foreground">
                  Docs
                </Link>
                <Link href="/mcp" className="hover:text-foreground">
                  MCP
                </Link>
                <Link href="/plugin" className="hover:text-foreground">
                  Plugin
                </Link>
                <Link href="/blog" className="hover:text-foreground">
                  Blog
                </Link>
              </nav>
            </div>
          </div>
        </footer>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-TMNCM090PF"
          strategy="afterInteractive"
        />
        <Script id="ga4" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-TMNCM090PF');`}
        </Script>
      </body>
    </html>
  );
}
