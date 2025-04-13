"use client";

import Navbar from "@/app/_components/nav";
import { Upload } from "@/app/_components/uploader";
import { useRef } from "react";
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
