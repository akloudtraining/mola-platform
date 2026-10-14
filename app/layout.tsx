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
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
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
