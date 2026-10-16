import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace-refresh.css";
import "./mola-brand.css";
import "./founder-experience.css";
import "./mola-mobile.css";
import "./mola-dark.css";
import "./mola-ink.css";
import PreferencesRuntime from "./preferences-runtime";
import { preferenceBootScript } from "./preferences";

export const metadata: Metadata = {
  title: "Mola Holdings — Investment Workspace",
  description: "A private Mola Holdings workspace for group contributions, projects, and decisions.",
  // Search engines read these from the server HTML (the in-app icon swap happens later in the
  // browser), so the Mola shield must be declared here. Google wants a square multiple of 48px.
  metadataBase: new URL("https://molaholdings.app"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-96.png", type: "image/png", sizes: "96x96" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  // Link previews in WhatsApp, iMessage, Slack and search.
  openGraph: {
    type: "website",
    url: "https://molaholdings.app",
    siteName: "Mola Holdings",
    title: "Mola Holdings — Investment Workspace",
    description: "A private Mola Holdings workspace for group contributions, projects, and decisions.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Mola Holdings lion shield logo" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
  // "Add to Home Screen" opens the workspace full screen, without browser bars.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Mola", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1511" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The boot script sets theme and language attributes before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferenceBootScript }} />
      </head>
      <body className="antialiased">
        <PreferencesRuntime />
        {children}
      </body>
    </html>
  );
}
