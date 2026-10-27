import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { ReactQueryProvider } from "@/components/layout/react-query-provider";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/layout/app-shell";
import { NavigationTrail } from "@/components/layout/back-link";
import { ToastProvider } from "@/components/ui/use-toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { sessionPayload } from "@/lib/auth/me";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/site-url";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: "Common Pastures",
  description:
    "Collaborative directory for members, sociocratic circles, shared skills, and the community loan library.",
  applicationName: "Common Pastures",
  manifest: "/manifest.json",
  icons: {
    icon: "/CVC.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // Installed on an iPhone's home screen, open as an app rather than in Safari.
  appleWebApp: { capable: true, title: "CVC", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#97cf8a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Who's signed in, sent with the page so the first paint has the right layout.
  const session = await sessionPayload().catch(() => undefined);
  // On the wiki's own address (the middleware says so) the shell shows only the wiki.
  const wikiHost = headers().get("x-cvc-wiki-host") === "1";
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans">
        <ReactQueryProvider session={session}>
          <ToastProvider>
            <ConfirmProvider>
              <AppShell wikiHost={wikiHost} mainSite={siteUrl()}>
                {children}
              </AppShell>
              <NavigationTrail />
              <Toaster />
            </ConfirmProvider>
          </ToastProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
