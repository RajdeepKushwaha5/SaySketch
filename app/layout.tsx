import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono, Architects_Daughter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

// body/UI face; variable name kept so existing references resolve
const inter = Instrument_Sans({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const architectsDaughter = Architects_Daughter({
  variable: "--font-hand",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SaySketch",
  description:
    "Speak your idea — watch it become a diagram. SaySketch turns voice into Excalidraw diagrams in real time.",
  icons: {
    icon: "/saysketch-mark.svg",
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
  ),
  openGraph: {
    title: "SaySketch",
    description:
      "Speak your idea — watch it become a diagram. SaySketch turns voice into Excalidraw diagrams in real time.",
    siteName: "SaySketch",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SaySketch",
    description:
      "Speak your idea — watch it become a diagram. SaySketch turns voice into Excalidraw diagrams in real time.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${architectsDaughter.variable} ${bricolage.variable}`}
    >
      <body className="antialiased h-full">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
