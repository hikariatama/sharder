import { env } from "@/env";
import { motion } from "framer-motion";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface DevSettingsProps {
  onMatch?: () => void;
}

export function DevSettings({ onMatch }: DevSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shardUrl, setShardUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bufferRef = useRef("");
  const phrase = "chimera";

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      bufferRef.current += e.key.toLowerCase();

      if (bufferRef.current.length > phrase.length) {
        bufferRef.current = bufferRef.current.slice(-phrase.length);
      }

      if (bufferRef.current === phrase.toLowerCase()) {
        if (onMatch) {
          onMatch();
        } else {
          setIsOpen(true);
        }
        bufferRef.current = "";
      }
    };

    document.body.addEventListener("keypress", handleKeyPress);

    return () => {
      document.body.removeEventListener("keypress", handleKeyPress);
    };
  }, [phrase, onMatch]);

  const loadShardUrl = async () => {
    setIsLoading(true);
    const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/secret`);
    setIsLoading(false);
    if (response.ok) {
      const data = await response.json() as { secret: string };
      if (env.NEXT_PUBLIC_BACKEND_URL.startsWith("/")) {
        const baseUrl = window.location.origin;
        const secretUrl = `${baseUrl}/api/connect/${data.secret}`;
        setShardUrl(secretUrl);
      } else {
        setShardUrl(`${env.NEXT_PUBLIC_BACKEND_URL}/connect/${data.secret}`);
      }
    } else {
      console.error("Failed to fetch shard URL");
    }
  }

  return isOpen && (
    <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen flex justify-center items-center backdrop-blur-xs">
      <div className="w-full h-full bg-black/30 absolute z-40" onClick={() => setIsOpen(false)} />
      <div className="bg-white p-4 rounded shadow-lg z-50 relative">
        <h2 className="text-xl font-bold">Management</h2>
        {shardUrl ?
          <div className="mt-4">
            <div
              className="select-none font-mono cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors ease-in-out duration-75 px-2 py-1 rounded-sm"
              onClick={() => {
                void navigator.clipboard.writeText(`./shard ${shardUrl}`);
              }}
            >
              ./shard {shardUrl}
            </div>
          </div>
          : (
            <motion.button
              className="mt-4 px-4 py-2 bg-black text-white cursor-pointer flex items-center justify-center"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 700, damping: 20 }}
              onClick={() => loadShardUrl()}
            >
              {isLoading ? (
                <LoaderCircle className="w-4 h-4 animate-spin" />
              ) : "Get Shard URL"}
            </motion.button>
          )}
      </div>
    </div>
  )
};

