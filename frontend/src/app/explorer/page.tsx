"use client";

import { useFileEventContext } from "@/app/context/FileEventContext";
import { env } from "@/env";
import { formatSize, getSalsa } from "@/utils";
import { common, createStarryNight } from '@wooorm/starry-night';
import fileTypeChecker from "file-type-checker";
import { motion } from "framer-motion";
import { toHtml } from 'hast-util-to-html';
import { ArrowLeft, Download, FileText, Link, LoaderCircle, Lock, Trash2 } from "lucide-react";
import mimeTypes from "mime-types";
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import Confirm from "../_components/confirm";
import { useAuthContext } from "../context/AuthContext";

interface File {
  id: string
  name: string
  size: number
  hmac: string
  created_at: string
}

export default function FileExplorerPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | ArrayBuffer | null>(null);
  const [isFileListLoading, setIsFileListLoading] = useState(false);
  const [isFileContentLoading, setIsFileContentLoading] = useState(false);
  const [isFileListError, setIsFileListError] = useState(false);
  const [isFileContentError, setIsFileContentError] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { fileUploaded, setFileUploaded } = useFileEventContext();
  const urlCopiedRef = useRef<HTMLDivElement | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const { id: userId, isLoading: isAuthLoading } = useAuthContext();
  const router = useRouter();

  const searchParams = useSearchParams();
  const fileIdFromQuery = searchParams.get("fileId");

  const fetchFiles = async () => {
    setIsFileListLoading(true);
    setIsFileListError(false);
    try {
      const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/files`);
      if (response.ok) {
        const data = await response.json() as File[];
        setFiles(data);
        return data;
      } else {
        setIsFileListError(true);
      }
    } catch (error) {
      console.error("Error fetching files:", error);
      setIsFileListError(true);
    } finally {
      setIsFileListLoading(false);
    }
  };

  const fetchFileContent = useCallback(async (fileId: string, filename: string) => {
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }

    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setIsFileContentLoading(true);
    setIsFileContentError(false);

    try {
      const response = await fetch(
        `${env.NEXT_PUBLIC_BACKEND_URL}/files/${fileId}`,
        { signal: controller.signal }
      );

      if (!response.ok && fetchControllerRef.current === controller) {
        setIsFileContentError(true);
        return;
      }

      if (fetchControllerRef.current === controller) {
        setIsFileContentLoading(false);
        setIsDecrypting(true);
      }

      const data = await response.blob();
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const salsa = await getSalsa(window.localStorage.getItem("seed") ?? "");
          const buffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(buffer);
          const decryptedFile = salsa.decrypt(uint8Array);

          const detected = fileTypeChecker.detectFile(decryptedFile);
          const mime = detected?.mimeType ?? mimeTypes.lookup(filename) ?? null;
          const isText = mime && (mime.startsWith("text/") || mime === "application/json");

          if (fetchControllerRef.current !== controller) return;

          if (isText || !mime) {
            const content = new TextDecoder("utf-8").decode(decryptedFile);
            const starryNight = await createStarryNight(common);
            let scope = starryNight.flagToScope(filename);
            scope ??= "plaintext";

            if (scope === "plaintext") {
              setFileContent(content);
              setMimeType("text/plain");
            } else {
              const html = toHtml(starryNight.highlight(content, scope));
              setFileContent(html.replaceAll("\n", "<br />"));
              setMimeType("code");
            }
          } else {
            setFileContent(decryptedFile.buffer);
            setMimeType(mime);
          }

        } catch (err) {
          console.error("Decryption or processing failed:", err);
          setIsFileContentError(true);
        }
      };

      reader.onerror = (error) => {
        console.error("Error reading file blob:", error);
        setIsFileContentError(true);
      };

      reader.readAsArrayBuffer(data);

    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
      console.error("Error fetching file content:", error);
      setIsFileContentError(true);
    } finally {
      if (fetchControllerRef.current === controller) {
        setIsFileContentLoading(false);
        setIsDecrypting(false);
      }
    }
  }, []);

  const handleFileClick = (file: File) => {
    if (file.id === selectedFile?.id) return;
    setSelectedFile(file);
  };

  const deleteFile = async (fileId: string) => {
    setIsFileListLoading(true);
    setIsFileContentError(false);
    try {
      const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/files/${fileId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        void fetchFiles();
        setSelectedFile(null);
        setFileContent(null);
        setMimeType(null);
      }
    } catch (error) {
      console.error("Error deleting file:", error);
    } finally {
      setIsFileListLoading(false);
    }
  }

  const copyUrl = (fileId: string) => {
    const url = `${window.location.origin}/explorer?fileId=${fileId}`;
    navigator.clipboard.writeText(url).then(() => {
      if (urlCopiedRef.current) {
        urlCopiedRef.current.classList.remove("!hidden");
        setTimeout(() => {
          urlCopiedRef.current?.classList.add("!hidden");
        }, 1500);
      }
    }).catch((error) => {
      console.error("Error copying URL:", error);
    });
  };

  const renderFiles = (files: File[]) => (
    <div className="flex flex-col gap-y-2">
      {files.map((file, i) => (
        <motion.div
          key={file.id}
          className=""
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 * i }}
        >
          <motion.div
            key={file.id}
            onClick={() => handleFileClick(file)}
            className={twMerge(
              "flex justify-between p-2 rounded transition-colors duration-200 ease-in-out text-sm border-1 border-zinc-700 md:border-0",
              selectedFile?.id === file.id
                ? "bg-blue-500/10 text-blue-500"
                : "text-zinc-400 hover:bg-zinc-400/10 hover:text-zinc-200 cursor-pointer",
            )}
            whileHover={selectedFile?.id === file.id ? undefined : { scale: 1.02 }}
            whileTap={selectedFile?.id === file.id ? undefined : { scale: 0.98 }}
            animate={selectedFile?.id === file.id ? { translateX: 18 } : {}}
            transition={{ type: "spring", stiffness: 800, damping: 30 }}
          >
            <div className="flex items-center gap-2">
              <FileText className="text-blue-500 w-4 h-4" />
              <span className="text-zinc-400">
                {file.name.length > 20
                  ? `${file.name.slice(0, 10)}...${file.name.slice(-10)}`
                  : file.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedFile?.id === file.id && (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 800, damping: 30, delay: 0.20 }}
                    className="flex justify-center items-center"
                  >
                    <motion.button
                      onClick={() => setConfirmDelete(true)}
                      className="text-red-500 cursor-pointer transition-colors duration-150 ease-out"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 800, damping: 30 }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 800, damping: 30, delay: 0.15 }}
                    className="flex justify-center items-center relative"
                  >
                    <motion.button
                      onClick={() => copyUrl(file.id)}
                      className="text-zinc-400 hover:text-blue-400 cursor-pointer transition-colors duration-150 ease-out"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 800, damping: 30 }}
                    >
                      <Link className="w-4 h-4" />
                    </motion.button>
                    <div className="absolute top-full right-full translate-y-2">
                      <div
                        className="bg-white text-black text-xs rounded px-2 py-1 motion-preset-confetti motion-duration-1500 !hidden"
                        ref={urlCopiedRef}
                      >
                        URL&nbsp;copied!
                      </div>
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 800, damping: 30, delay: 0.1 }}
                    className="flex justify-center items-center"
                  >
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!mimeType) {
                          console.error("Mime type is null or undefined.");
                          return;
                        }
                        const blob = new Blob([fileContent as ArrayBuffer], { type: mimeType });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = file.name;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-zinc-400 hover:text-blue-400 cursor-pointer transition-colors duration-150 ease-out"
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 800, damping: 30 }}
                    >
                      <Download className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                </>
              )}
              {formatSize(file.size)}
            </div>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );


  useEffect(() => {
    if (fileIdFromQuery && files.length > 0) {
      const file = files.find((f) => f.id === fileIdFromQuery);
      if (file) {
        setSelectedFile(file);
      }
    }
  }, [fileIdFromQuery, files]);

  useEffect(() => {
    void fetchFiles();
  }, []);

  useEffect(() => {
    if (fileUploaded) {
      fetchFiles().then((data: File[] | undefined) => {
        if (!data) return;
        const file = data.find((f) => f.id === fileUploaded);
        if (file) {
          setSelectedFile(file);
        }
      }).catch((error) => {
        console.error("Error fetching files after upload:", error);
      }).finally(() => {
        setFileUploaded(null);
      });
    }
  }, [fileUploaded, setFileUploaded, files]);

  useEffect(() => {
    if (selectedFile) {
      void fetchFileContent(selectedFile.id, selectedFile.name);
    }
  }, [selectedFile, fetchFileContent]);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoaderCircle className="w-5 h-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!userId) {
    router.push("/access");
    return;
  }

  return (
    <>
      <style>
        {/* https://github.com/romboHQ/tailwindcss-motion/issues/52 */}
        {`.motion-preset-confetti {
          display: block;
          -webkit-appearance: none;
          appearance: none;
          position: relative;
          outline: 0;
          z-index: 1;
          margin: 0;
          animation: RomboConfettiPop var(--motion-duration) /* 750ms */ var(--motion-timing) both;
          animation-fill-mode: forwards;
        }

        .motion-preset-confetti:after {
          display: block;
          animation-duration: var(--motion-duration) /* 750ms */;
          animation-timing-function: var(--motion-timing);
          animation-iteration-count: 1;
          animation-direction: normal;
          animation-fill-mode: forwards;
          animation-name: bottomfetti;
          position: absolute;
          content: " ";
          z-index: -1;
          width: 100%;
          height: 100%;
          left: -20%;
          top: 100%;
          transition: all var(--motion-timing) var(--motion-duration) /* 750ms */;
          background-repeat: no-repeat;
          background-image: radial-gradient(circle, #a2dd60 20%, transparent 20%),radial-gradient(circle, transparent 20%, #ee65a9 20%, transparent 30%),radial-gradient(circle, #6092dd 20%, transparent 20%),radial-gradient(circle, #f3c548 20%, transparent 20%),radial-gradient(circle, transparent 10%, #46ec99 15%, transparent 20%),radial-gradient(circle, #f03e47 20%, transparent 20%),radial-gradient(circle, #7b4df7 20%, transparent 20%),radial-gradient(circle, #3ff1bc 20%, transparent 20%);
          background-size: 15% 15%, 20% 20%, 18% 18%, 20% 20%, 15% 15%, 10% 10%, 20% 20%;
        }

        .motion-preset-confetti:before {
          display: block;
          animation-duration: var(--motion-duration) /* 750ms */;
          animation-timing-function: var(--motion-timing);
          animation-iteration-count: 1;
          animation-direction: normal;
          animation-fill-mode: forwards;
          animation-name: topfetti;
          position: absolute;
          content: " ";
          width: 100%;
          height: 100%;
          left: -5%;
          background-repeat: no-repeat;
          transition: all var(--motion-timing) var(--motion-duration) /* 750ms */;
          z-index: -1;
          top: -90%;
          background-image: radial-gradient(circle, #a2dd60 30%, transparent 20%),radial-gradient(circle, transparent 20%, #ee65a9 40%, transparent 20%),radial-gradient(circle, #6092dd 30%, transparent 20%),radial-gradient(circle, #f3c548 30%, transparent 20%),radial-gradient(circle, transparent 10%, #46ec99 15%, transparent 20%),radial-gradient(circle, #f03e47 30%, transparent 20%),radial-gradient(circle, #7b4df7 30%, transparent 30%),radial-gradient(circle, #3ff1bc 30%, transparent 20%),radial-gradient(circle, #48f088 30%, transparent 30%);
          background-size: 10% 10%, 20% 20%, 15% 15%, 20% 20%, 18% 18%, 10% 10%, 15% 15%, 10% 10%, 25% 25%;
        }

        @keyframes RomboConfettiPop {
          0% {
            opacity: 0;
            transform: scale(1);
          }
          16.5% {
            opacity: 1;
            transform: scale(1.15);
          }
          25% {
            transform: scale(0.975);
          }
          32.5% {
            transform: scale(1.025);
          }
          40% {
            transform: scale(0.99);
          }
          43.5% {
            transform: scale(1.01);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
            
          70% {
              opacity: 1;
            transform: scale(1);
          }

          90% {
            opacity: 0;
            transform: scale(0.7);
          }

          100% {
            opacity: 0;
            transform: scale(0.7);
          }
        }

        @keyframes topfetti {
          0% {
            background-position: 5% 90%, 10% 90%, 10% 90%, 15% 90%, 25% 90%, 25% 90%, 40% 90%, 55% 90%, 70% 90%;
          }
          25% {
            background-position: 0% 80%, 0% 20%, 10% 40%, 20% 0%, 30% 30%, 22% 50%, 50% 50%, 65% 20%, 90% 30%;
          }
          50% {
            background-position: 0% 70%, 0% 10%, 10% 30%, 20% -10%, 30% 20%, 22% 40%, 50% 40%, 65% 10%, 90% 20%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }
          60% {
            opacity: 1;
            background-position: 0% 70%, 0% 10%, 10% 30%, 20% -10%, 30% 20%, 22% 40%, 50% 40%, 65% 10%, 90% 20%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }

          70% {
            opacity: 0;
            background-position: 0% 70%, 0% 10%, 10% 30%, 20% -10%, 30% 20%, 22% 40%, 50% 40%, 65% 10%, 90% 20%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }

          100% {
            opacity: 0;
            background-position: 0% 70%, 0% 10%, 10% 30%, 20% -10%, 30% 20%, 22% 40%, 50% 40%, 65% 10%, 90% 20%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }
        }

        @keyframes bottomfetti {
          0% {
            background-position: 10% -10%, 30% 10%, 55% -10%, 70% -10%, 85% -10%,70% -10%, 70% 0%;
          }
          25% {
            background-position: 0% 80%, 20% 80%, 45% 60%, 60% 100%, 75% 70%, 95% 60%, 105% 0%;
          }
          50% {
            background-position: 0% 90%, 20% 90%, 45% 70%, 60% 110%, 75% 80%, 95% 70%, 110% 10%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }
          60% {
            opacity: 1;
            background-position: 0% 70%, 0% 10%, 10% 30%, 20% -10%, 30% 20%, 22% 40%, 50% 40%, 65% 10%, 90% 20%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }

          70% {
            opacity: 0;
            background-position: 0% 70%, 0% 10%, 10% 30%, 20% -10%, 30% 20%, 22% 40%, 50% 40%, 65% 10%, 90% 20%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }

          100% {
            opacity: 0;
            background-position: 0% 70%, 0% 10%, 10% 30%, 20% -10%, 30% 20%, 22% 40%, 50% 40%, 65% 10%, 90% 20%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }
        }`}
      </style>
      <div className="flex items-center justify-center min-h-screen tracking-wide">
        <div className="flex flex-col md:flex-row w-full h-[80vh] max-w-6xl md:border border-zinc-400 rounded-lg shadow-lg overflow-hidden">
          <div className={twMerge(
            "w-full md:w-1/3 p-4 md:border-r border-zinc-400 h-[80vh] overflow-y-scroll overflow-x-hidden",
            selectedFile ? "hidden md:block" : "block",
          )}>
            {isFileListLoading && (
              <div className="flex gap-2">
                <LoaderCircle className="w-5 h-5 animate-spin text-zinc-400" />
                <p className="text-zinc-400">Loading files...</p>
              </div>
            )}
            {isFileListError && (
              <p className="text-red-500">Error loading files. Please try again.</p>
            )}
            {!isFileListLoading && !isFileListError && files.length === 0 ? (
              <p className="text-zinc-400 text-sm text-center">Hint: Drag file(-s) to the bottom of the page to upload</p>
            ) : (
              renderFiles(files)
            )}
          </div>
          {selectedFile && (
            <div className="flex md:hidden flex-col items-center justify-center w-full h-fit p-4">
              <h2 className="text-lg text-zinc-300 font-semibold mb-2">{selectedFile.name}</h2>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-blue-500 hover:text-blue-400 transition-colors duration-150 ease-out flex items-center gap-1"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to file list
              </button>
            </div>
          )}
          <div className={twMerge(
            "w-full md:w-2/3 justify-center items-center shrink-0",
            selectedFile ? "flex" : "hidden md:flex",
          )}>
            {selectedFile ? (
              isFileContentLoading ? (
                <div className="flex gap-2 p-4">
                  <LoaderCircle className="w-5 h-5 animate-spin text-zinc-400" />
                  <p className="text-zinc-400">Loading content...</p>
                </div>
              ) : isDecrypting ? (
                <div className="flex gap-2 p-4">
                  <Lock className="w-5 h-5 animate-pulse text-zinc-400" />
                  <p className="text-zinc-400">Decrypting...</p>
                </div>
              ) : isFileContentError ? (
                <p className="text-red-500 p-4">Error loading file content.</p>
              ) : (
                <div className="w-full h-[70vh] md:h-[80vh]">
                  {mimeType?.startsWith("text/") && typeof fileContent === "string" ? (
                    <motion.pre
                      className="text-xs text-zinc-300 h-full w-full overflow-scroll p-4"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {fileContent}
                    </motion.pre>
                  ) : mimeType?.startsWith("image/") ? (
                    <motion.img
                      src={URL.createObjectURL(new Blob([fileContent as ArrayBuffer], { type: mimeType }))}
                      alt={selectedFile.name}
                      className="w-full object-contain"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                    />
                  ) : mimeType?.startsWith("application/pdf") ? (
                    <object
                      data={URL.createObjectURL(new Blob([fileContent as ArrayBuffer], { type: mimeType }))}
                      type="application/pdf"
                      className="w-full h-full"
                      aria-label="PDF Viewer"
                    >
                      <p className="text-zinc-400">PDF viewer not supported.</p>
                    </object>
                  ) : mimeType?.startsWith("video/") ? (
                    <video
                      controls
                      className="w-full"
                      src={URL.createObjectURL(new Blob([fileContent as ArrayBuffer], { type: mimeType }))}
                      aria-label="Video Player"
                    >
                      <p className="text-zinc-400">Video player not supported.</p>
                    </video>
                  ) : mimeType?.startsWith("audio/") ? (
                    <audio
                      controls
                      className="w-full"
                      src={URL.createObjectURL(new Blob([fileContent as ArrayBuffer], { type: mimeType }))}
                      aria-label="Audio Player"
                    >
                      <p className="text-zinc-400">Audio player not supported.</p>
                    </audio>
                  ) : mimeType === "code" ? (
                    <pre className="text-xs text-white h-full w-full overflow-scroll p-4">
                      <code>
                        <div
                          className="w-full h-full overflow-scroll"
                          dangerouslySetInnerHTML={{ __html: fileContent as string }}
                        />
                      </code>
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-zinc-400">Unsupported file type.</p>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-zinc-400">Select a file to view its content.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {confirmDelete && selectedFile && (
        <Confirm
          message={`Are you sure you want to delete ${selectedFile.name}?`}
          onConfirm={() => { void deleteFile(selectedFile.id); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
