import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Button } from "@/components/ui/button";
import { getClaims } from "@/lib/supabase/server";
import { getPopularTools, getToolCategories } from "@/lib/tool-display";
import { getLiveTools } from "@/lib/tools-registry";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const DESCRIPTION =
  "Give Claude and ChatGPT reliable access to live web data. One hosted MCP connector for JavaScript rendering, structured extraction, browser sessions, API discovery, screenshots, and regional routing.";

export const metadata: Metadata = {
  metadataBase: new URL("https://betterfetch.co"),
  title: {
    default: "Better Fetch — the web data layer for AI",
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
    "MCP web scraping",
    "Claude MCP",
    "ChatGPT MCP",
    "AI web data",
    "agent web scraping",
    "JavaScript rendering",
    "structured web extraction",
    "browser sessions",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Better Fetch",
    title: "Better Fetch — the web data layer for AI",
    description: DESCRIPTION,
    url: "https://betterfetch.co",
  },
  twitter: {
    card: "summary_large_image",
    title: "Better Fetch — the web data layer for AI",
    description: DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [signedIn, tools] = await Promise.all([
    getClaims().then(Boolean),
    getLiveTools({ force: true }).catch(() => []),
  ]);
  const categories = getToolCategories(tools);
  const popularTools = getPopularTools(tools, 6);

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
              <div className="group/tools relative">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/tools" aria-haspopup={categories.length ? "menu" : undefined}>
                    Tools
                  </Link>
                </Button>
                {categories.length ? (
                  <div className="invisible absolute right-0 top-full w-[min(38rem,calc(100vw-2rem))] pt-2 opacity-0 transition group-hover/tools:visible group-hover/tools:opacity-100 group-focus-within/tools:visible group-focus-within/tools:opacity-100">
                    <div className="grid gap-4 rounded-lg border bg-popover p-4 text-left shadow-xl sm:grid-cols-[1fr_1.2fr]">
                      <div className="space-y-2">
                        {categories.map((category) => (
                          <Link
                            key={category.slug}
                            href={`/tools?category=${encodeURIComponent(category.slug)}`}
                            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <span>{category.label}</span>
                            <span className="text-xs">{category.count}</span>
                          </Link>
                        ))}
                      </div>
                      {popularTools.length ? (
                        <div className="space-y-2 border-t pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                          {popularTools.map((tool) => (
                            <Link
                              key={tool.id}
                              href={`/tools/${tool.name}`}
                              className="block rounded-md px-2 py-1.5 hover:bg-muted"
                            >
                              <span className="block text-sm font-medium">{tool.title}</span>
                              <span className="line-clamp-1 text-xs text-muted-foreground">
                                {tool.description}
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/docs">Docs</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/mcp">Connect</Link>
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
                {signedIn ? "Back to your keys?" : "Give your AI a better fetch."}
              </p>
              <p className="text-sm text-muted-foreground">
                {signedIn
                  ? "Keys, usage, and your plan — all in one place."
                  : "Connect Claude or ChatGPT in minutes. Start with 50 free calls a month."}
              </p>
            </div>
            <Button asChild>
              <Link href={signedIn ? "/keys" : "/mcp"}>
                {signedIn ? "Open dashboard" : "Connect your AI"}
              </Link>
            </Button>
            <div className="flex w-full flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Image src="/logo-white.svg" alt="" width={18} height={18} />
                <span>© {new Date().getFullYear()} Better Fetch</span>
              </div>
              <nav className="flex gap-4 text-sm text-muted-foreground">
                <Link href="/tools" className="hover:text-foreground">
                  Tools
                </Link>
                <Link href="/docs" className="hover:text-foreground">
                  Docs
                </Link>
                <Link href="/mcp" className="hover:text-foreground">
                  Connect
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
