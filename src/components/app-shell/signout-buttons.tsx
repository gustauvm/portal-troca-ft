"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/utils/fetcher";

export function EmployeeSignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      size="sm"
      className="shrink-0"
      onClick={async () => {
        await fetchJson("/api/employee/session/clear", { method: "POST" });
        router.push("/entrar");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" />
      Sair
    </Button>
  );
}

export function OperatorSignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      size="sm"
      className="shrink-0"
      onClick={async () => {
        await fetchJson("/api/ops/auth/session/clear", { method: "POST" });
        router.push("/operacao/entrar");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" />
      Sair
    </Button>
  );
}
