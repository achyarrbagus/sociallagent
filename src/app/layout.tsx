import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SocialAgent",
  description: "Workspace agensi kreatif untuk mengelola brand dan campaign bersama tim AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
