import { AuthProvider } from "@/app/context/AuthContext";
import { FileEventProvider } from "@/app/context/FileEventContext";
import "@/styles/globals.css";
import "@wooorm/starry-night/style/dark";
import { type Metadata } from "next";
import { Figtree } from "next/font/google";
import { Suspense } from "react";
import ClientLayout from "./_components/clientLayout";

export const metadata: Metadata = {
  title: "Sharder",
  description: "A decentralized file storage solution",
  keywords: ["Sharder", "decentralized", "file storage", "solution"],
  icons: [{ rel: "icon", url: "/favicon.png" }],
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
        <AuthProvider>
          <FileEventProvider>
            <main className="w-full h-full min-h-screen min-w-screen bg-[#080910]">
              <Suspense>{children}</Suspense>
              <ClientLayout />
            </main>
          </FileEventProvider>
        </AuthProvider>
      </body>
    </html>
  );
}