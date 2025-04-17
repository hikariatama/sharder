"use client";

import { useFileEventContext } from "@/app/context/FileEventContext";
import { env } from "@/env";
import { motion } from "framer-motion";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { getSalsa } from "@/utils";

export const Upload = forwardRef<
  { isUploading: boolean; isDrag: boolean; inputRef: HTMLInputElement | null },
  unknown
>((_, ref) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDrag, setIsDrag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { setFileUploaded } = useFileEventContext();
  const [fileCount, setFileCount] = useState(0);
  const [isDrop, setIsDrop] = useState(false);

  useImperativeHandle(ref, () => ({
    isUploading,
    isDrag,
    inputRef: fileInputRef.current ?? document.createElement("input"),
  }));

  const handleSubmit = async (files: FileList) => {
    setIsUploading(true);

    const salsa = await getSalsa(window.localStorage.getItem("seed") ?? "");

    const uploadPromises = Array.from(files).map(async (file) => {
      const formData = new FormData();
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = async () => {
        const buffer = reader.result as ArrayBuffer;
        const uint8Array = new Uint8Array(buffer);
        const encryptedFile = salsa.encrypt(uint8Array);
        formData.append("file", new Blob([encryptedFile]), file.name);
      };

      await new Promise<void>((resolve) => {
        reader.onloadend = () => {
          resolve();
        };
      })

      await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/upload`, {
        method: "POST",
        body: formData,
      })
        .then(async (response) => {
          if (response.ok) {
            const data = (await response.json()) as { ulid: string };
            const { ulid } = data;
            setFileUploaded(ulid);
          }
        })
        .catch((error) => {
          console.error("Error uploading file:", error);
        });
    });

    void Promise.all(uploadPromises)
      .finally(() => {
        setIsUploading(false);
        setIsDrag(false);
        setIsDrop(false);
        setFileCount(0);
      });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void handleSubmit(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDrag(false);
    setIsDrop(true);
    if (e.dataTransfer.files) {
      setFileCount(Array.from(e.dataTransfer.files).length);
      void handleSubmit(e.dataTransfer.files);
    }
  };

  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

  return (
    <>
      <motion.div
        className="fixed text-zinc-300 font-medium text-sm shadow-lg w-32 text-center"
        style={{
          left: `${cursorPosition.x - 64}px`,
          top: `${cursorPosition.y - 30}px`,
        }}
        initial={{ scale: 0 }}
        animate={{ scale: isDrag ? 1 : 0 }}
        transition={{ duration: 0.15, ease: "easeInOut" }}
      >
        Release to upload
      </motion.div>
      <motion.div
        className={twMerge(
          "fixed w-8 h-8 border-8 border-white rounded-full blur-sm flex items-center justify-center pointer-events-none",
          isUploading && "animate-pulse border-blue-200"
        )}
        style={{
          left: `${cursorPosition.x - 12}px`,
          top: `${cursorPosition.y - 12}px`,
        }}
        initial={{ scale: 0 }}
        animate={{ scale: (isDrag || isDrop && isUploading) ? 1 : 0 }}
        transition={{ duration: 0.15, ease: "easeInOut" }}
      />
      {isUploading && isDrop && fileCount > 1 && (
        Array.from({ length: fileCount }, (_, i) => {
          const angle = (2 * Math.PI * i) / fileCount;
          const radius = 20;
          const offsetX = Math.cos(angle) * radius * 2 + Math.random() * 5;
          const offsetY = Math.sin(angle) * radius + Math.random() * 5;
          return (
            <div
              key={i}
              className="fixed w-8 h-8 border-8 border-blue-200 rounded-full blur-sm flex items-center justify-center pointer-events-none animate-pulse"
              style={{
                left: `${cursorPosition.x - 12 + offsetX}px`,
                top: `${cursorPosition.y - 12 + offsetY}px`,
                animationDelay: `${i * 0.1 + 0.1}s`,
              }}
            />
          );
        })
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setCursorPosition({ x: e.pageX, y: e.pageY });
        }}
        onDrop={(e) => handleDrop(e)}
        onDragEnter={() => setIsDrag(true)}
        onDragLeave={() => setIsDrag(false)}
        className="fixed w-full h-14 bottom-0 z-40"
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        placeholder="Upload a file"
        multiple
      />
    </>
  );
});

Upload.displayName = "Upload";
