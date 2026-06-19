import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "OCR Schedule Assistant",
  description: "OCR schedule registration."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
