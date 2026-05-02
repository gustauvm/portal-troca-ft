import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/app-shell/operator-shell";
import { OperatorAccessManager } from "@/components/operators/operator-access-manager";
import { requireOperatorSession } from "@/lib/auth/operator";
import { listOperatorAccess } from "@/lib/auth/operator-access";
import { getOperationalFilterOptions } from "@/lib/directory/service";

export default async function OperatorAdminPage() {
  const operator = await requireOperatorSession();
  if (operator.role !== "admin") {
    notFound();
  }

  const [items, filterOptions] = await Promise.all([
    listOperatorAccess(),
    getOperationalFilterOptions(),
  ]);

  return (
    <OperatorShell
      operator={operator}
      title="Acessos da operação"
      description="Admins liberam, removem e limitam operadores por grupo ou empresa."
      backHref="/operacao"
    >
      <OperatorAccessManager initialItems={items} filterOptions={filterOptions} />
    </OperatorShell>
  );
}
