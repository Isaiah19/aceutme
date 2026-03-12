import type { Metadata } from "next";
import "./globals.css";
import BetaBanner from "@/components/BetaBanner";
import FeedbackWidget from "@/components/FeedbackWidget";

export const metadata: Metadata = {
  title: "AceUTME – Smart CBT Practice for UTME Success",
  description:
    "Practice real UTME questions with full CBT simulation. English + 3 other subjects. Track progress and pass with confidence.",
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
      <body className="bg-white text-zinc-900">
        <BetaBanner />
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}