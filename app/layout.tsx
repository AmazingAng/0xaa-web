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
    title: "0xaa.xyz — Personal Signal",
    description: "A monochrome personal signal from the edge of the network.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "0xaa.xyz — Personal Signal",
      description: "A monochrome personal signal from the edge of the network.",
      type: "website",
      url: "/",
      images: [
        {
          url: "/og.png",
          width: 1732,
          height: 908,
          alt: "0xaa.xyz Personal Signal",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "0xaa.xyz — Personal Signal",
      description: "A monochrome personal signal from the edge of the network.",
      images: ["/og.png"],
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
