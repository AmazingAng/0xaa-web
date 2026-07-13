import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "0xaa.xyz";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
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
          url: "/og-monolith.png",
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
      images: ["/og-monolith.png"],
      creator: "@0xAA_Science",
      site: "@0xAA_Science",
    },
  };
}

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
