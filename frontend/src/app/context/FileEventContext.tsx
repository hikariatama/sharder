"use client";

import React, { createContext, useContext, useState } from "react";

interface FileEventContextProps {
  fileUploaded: string | null;
  setFileUploaded: (uploaded: string | null) => void;
}

const FileEventContext = createContext<FileEventContextProps | undefined>(undefined);

export const FileEventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fileUploaded, setFileUploaded] = useState<string | null>(null);

  return (
    <FileEventContext.Provider value={{ fileUploaded, setFileUploaded }}>
      {children}
    </FileEventContext.Provider>
  );
};

export const useFileEventContext = (): FileEventContextProps => {
  const context = useContext(FileEventContext);
  if (!context) {
    throw new Error("useFileEventContext must be used within a FileEventProvider");
  }
  return context;
};