"use client";

import { useEffect } from "react";

export function AuthHashRedirect() {
  useEffect(() => {
    if (!window.location.hash.includes("access_token")) return;
    if (window.location.pathname.startsWith("/operacao/auth/callback")) return;
    window.location.replace(`/operacao/auth/callback${window.location.hash}`);
  }, []);

  return null;
}
