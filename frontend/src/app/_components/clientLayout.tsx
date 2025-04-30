"use client";

import Navbar from "@/app/_components/nav";
import { Upload } from "@/app/_components/uploader";
import { useAuthContext } from "@/app/context/AuthContext";
import { env } from "@/env";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import ShardHealthcheck from "./shardHealthcheck";
import { DevSettings } from "./dev";


export default function ClientLayout() {
  const { username, isLoading: isAuthLoading } = useAuthContext();
  const uploadRef = useRef<{
    isUploading: boolean;
    isDrag: boolean;
    inputRef: HTMLInputElement | null;
  }>(null);

  const handleUpload = () => {
    if (uploadRef.current) {
      uploadRef.current.inputRef?.click();
    }
  };

  useEffect(() => {
    const updateVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    updateVh();
    window.addEventListener("resize", updateVh);

    return () => {
      window.removeEventListener("resize", updateVh);
    };
  }, []);

  return (
    <>
      <div className="fixed top-1 left-1 flex items-center justify-center">
        {!isAuthLoading && username && (
          <div className="flex items-center justify-center text-zinc-400 text-xs group relative">
            <a
              href={`${env.NEXT_PUBLIC_BACKEND_URL}/logout`}
              className="text-zinc-400 text-xs flex items-center ml-1"
            >
              {username}
            </a>
            <div className="cursor-default absolute top-0 left-full break-inside-avoid opacity-0 group-hover:opacity-100 transition-opacity ease-in-out duration-150 flex items-center">
              <ArrowLeft className="w-3 h-3 ml-1" />&nbsp;click&nbsp;to&nbsp;logout
            </div>
          </div>
        )}
      </div>
      <ShardHealthcheck />
      {uploadRef.current && uploadRef.current.isDrag && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 z-40"
        >
          Release to upload
        </div>
      )}
      <Navbar handleUpload={handleUpload} />
      <Upload ref={uploadRef} />
      <DevSettings />
    </>
  );
}
