"use client";

import { Diamond } from "lucide-react";
import { Tomorrow } from "next/font/google";

const tomorrow = Tomorrow({
  subsets: ["latin"],
  variable: "--font-tomorrow",
  weight: "600"
});

export default function HomePage() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden">
      <h1 className={`text-6xl font-bold text-white select-none ${tomorrow.className}`}>
        Sharder
      </h1>
      <p className="mt-4 text-lg text-gray-400 font-medium tracking-wide select-none">
        A decentralized file storage solution
      </p>
      <div className="flex gap-4 mt-4">
        <Diamond className="w-8 scale-y-125 text-purple-400" />
        <Diamond className="w-8 scale-y-125 text-purple-400" />
        <Diamond className="w-8 scale-y-125 text-purple-400" />
      </div>
    </div>
  );
}
