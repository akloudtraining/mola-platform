import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace-refresh.css";
import "./mola-brand.css";
import "./founder-experience.css";
import "./mola-mobile.css";
import "./mola-dark.css";
import PreferencesRuntime from "./preferences-runtime";
import { preferenceBootScript } from "./preferences";

export const metadata: Metadata = {
  title: "Mola Holdings — Investment Workspace",
  description: "A private Mola Holdings workspace for group contributions, projects, and decisions.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
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
