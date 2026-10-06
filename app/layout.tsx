import type { Metadata } from "next";
import "./globals.css";
import "./workspace-refresh.css";
import "./mola-brand.css";

export const metadata: Metadata = {
  title: "Collective — Investment Workspace",
  description: "A private workspace for group contributions, projects, and decisions.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
