"use client";

import { env } from "@/env";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthContext } from "../context/AuthContext";


export default function AuthForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { recheckAuth } = useAuthContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      await recheckAuth()
      router.push("/");
    } else {
      setError("Invalid username or password");
      setUsername("");
      setPassword("");
    }
  }

  return (
    <form action="POST" onSubmit={handleSubmit} className="mt-8">
      <div className="flex gap-8 items-center">
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Username"
            className="p-2 text-white border-b-white border-b text-center tracking-wide outline-none h-10"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="p-2 text-white border-b-white border-b text-center tracking-wide outline-none h-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <motion.button
          type="submit"
          className="border-1 border-white text-white disabled:text-zinc-500 disabled:border-zinc-500 group aspect-square h-20 flex justify-center items-center outline-none enabled:cursor-pointer disabled:cursor-not-allowed disabled:!transform-none"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 1000, damping: 30 }}
          disabled={!username || !password}
        >
          <ArrowRight className="w-12 h-12 stroke-1" />
        </motion.button>
      </div>
      {error && (
        <div className="text-red-500 text-center mt-4">
          {error}
        </div>
      )}
    </form>
  )
}