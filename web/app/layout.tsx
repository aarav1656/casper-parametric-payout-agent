import type { Metadata } from "next";
import dynamic from "next/dynamic";
import localFont from "next/font/local";
import "./globals.css";

const WalletProvider = dynamic(
  () => import("@/lib/wallet").then((module) => module.WalletProvider),
  { ssr: false }
);

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Parametric Payout Agent",
  description:
    "Autonomous parametric insurance on Casper testnet: an agent pays a data endpoint for a signed reading and triggers an on-chain payout only when the reading crosses the policy threshold.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
