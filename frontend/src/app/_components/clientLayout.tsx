"use client";

import Navbar from "@/app/_components/nav";
import { Upload } from "@/app/_components/uploader";
import { useEffect, useRef } from "react";
import ShardHealthcheck from "./shardHealthcheck";


export default function ClientLayout() {
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
    </>
  );
}
