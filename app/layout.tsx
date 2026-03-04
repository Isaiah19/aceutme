import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AceUTME – Smart CBT Practice for UTME Success",
  description:
    "Practice real UTME questions with full CBT simulation. English 60 + 3 subjects x 40. Track progress and pass with confidence.",
  keywords: [
    "JAMB CBT",
    "UTME practice",
    "JAMB mock",
    "CBT simulation",
    "JAMB preparation",
  ],
  openGraph: {
    title: "AceUTME",
    description: "Smart CBT Practice for UTME Success",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-zinc-900">{children}</body>
    </html>
  );
}