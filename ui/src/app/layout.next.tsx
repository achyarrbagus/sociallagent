import type { Metadata } from "next";

import "@mdxeditor/editor/style.css";
import "../index.css";

export const metadata: Metadata = {
  title: "SocialAgent",
  description: "Workspace kreatif bersama tim AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
