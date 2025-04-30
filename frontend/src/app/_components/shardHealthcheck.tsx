"use client";
import { env } from "@/env";
import { AnimatePresence, motion } from "framer-motion";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { formatSize } from "@/utils";

function ShardDot({ shard, healthy, size }: { shard: string, healthy: boolean, size: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`w-2 h-2 rounded-xs skew-8 rotate-45 ${healthy ? "bg-purple-400" : "bg-red-500"}`} />
      <AnimatePresence>
        {hovered && (
          <motion.div
            key="tooltip"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 700, damping: 35 }}
            className="origin-top-right absolute top-full right-full px-2 py-1 text-xs bg-zinc-800 text-white rounded z-10 whitespace-nowrap"
          >
            {shard}
            <span className={healthy ? "text-purple-400" : "text-red-500"}>
              {healthy ? "\xa0healthy" : "\xa0unhealthy"}
            </span>
            &nbsp;{formatSize(size)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ShardHealthcheck() {
  const [shardStatus, setShardStatus] = useState<{ shard: string; healthy: boolean, size: number }[]>([]);

  useEffect(() => {
    const socket = new WebSocket(`${env.NEXT_PUBLIC_BACKEND_URL.replace("http://", "ws://")}/shards`);

    socket.onopen = () => {
      console.log("WebSocket connection established");
    };

    socket.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string) as { shard: string; healthy: boolean, size: number }[];
      setShardStatus((prevStatus) => {
        const newStatus = [...prevStatus];
        data.forEach((shard) => {
          const index = newStatus.findIndex((s) => s.shard === shard.shard);
          if (index !== -1) {
            newStatus[index] = shard;
          } else {
            newStatus.push(shard);
          }
        });
        return newStatus;
      });
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return () => {
      socket.close();
    };
  }, []);

  return (
    <>
      <AnimatePresence>
        {shardStatus.some((shard) => !shard.healthy) && (
          <motion.div
            key="alert"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="fixed top-0 right-0 left-0 pt-0.5 mx-auto w-fit text-yellow-400 text-xs flex gap-1 items-center"
          >
            <TriangleAlert className="w-3 h-3" />
            Performance may be degraded
          </motion.div>
        )}
      </AnimatePresence>
      <div className="fixed top-0 right-0 w-fit px-1 pt-1.5 flex gap-1 items-center text-white">
        {shardStatus.map((shard) => (
          <ShardDot key={shard.shard} healthy={shard.healthy} shard={shard.shard} size={shard.size} />
        ))}
      </div>
    </>
  );
}

