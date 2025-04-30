"use client";

import { env } from "@/env";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

interface AuthContextProps {
  id: string | null;
  username: string | null;
  isLoading: boolean;
  recheckAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [id, setId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/me`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = (await response.json()) as { id: string; username: string };
        setId(data.id);
        setUsername(data.username);
      } else {
        setId(null);
        setUsername(null);
      }
    } catch (error) {
      console.error("Error checking auth:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ id, username, isLoading, recheckAuth: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = (): AuthContextProps => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within a AuthProvider");
  }
  return context;
};