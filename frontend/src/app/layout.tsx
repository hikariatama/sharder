import { FileEventProvider } from "@/app/context/FileEventContext";
import "@/styles/globals.css";
import { type Metadata } from "next";
import { Figtree } from "next/font/google";
import { Suspense } from "react";
import ClientLayout from "./_components/clientLayout";

export const metadata: Metadata = {
  title: "Sharder",
  description: "A decentralized file storage solution",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${figtree.className}`}>
      <body>
        <FileEventProvider>
          <main className="w-full h-full min-h-screen min-w-screen bg-[#080910]">
            <Suspense>{children}</Suspense>
            <ClientLayout />
          </main>
        </FileEventProvider>
      </body>
    </html>
  );
}