"use client";

import { useEffect } from "react";

export function AuthHashRedirect() {
  useEffect(() => {
    if (!window.location.hash.includes("access_token")) return;
    window.location.replace("/operacao/entrar?auth=email-disabled");
  }, []);

  return null;
}
