import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://0xaa.xyz"),
  title: "0xAA — Neural Monolith",
  description: "A personal node for learning, intelligence, and open systems.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "0xAA — Neural Monolith",
    description: "A personal node for learning, intelligence, and open systems.",
    type: "website",
    url: "/",
    images: [
      {
        url: "/og-monolith.jpg",
        width: 1200,
        height: 630,
        alt: "0xAA Neural Monolith",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "0xAA — Neural Monolith",
    description: "A personal node for learning, intelligence, and open systems.",
    images: ["/og-monolith.jpg"],
    creator: "@0xAA_Science",
    site: "@0xAA_Science",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
