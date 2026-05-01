"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/utils/fetcher";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function EmployeeSignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      size="sm"
      className="w-full sm:w-auto"
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
      className="w-full sm:w-auto"
      onClick={async () => {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
        router.push("/operacao/entrar");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" />
      Sair
    </Button>
  );
}
