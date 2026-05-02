import { OperatorShell } from "@/components/app-shell/operator-shell";
import { OperationsBoard } from "@/components/operators/operations-board";
import { requireOperatorSession } from "@/lib/auth/operator";
import { getOperationalFilterOptions } from "@/lib/directory/service";
import { getCurrentPayrollWindow } from "@/lib/utils/payroll";

export default async function OperationsPage() {
  const operator = await requireOperatorSession();
  const filterOptions = await getOperationalFilterOptions();

  return (
    <OperatorShell
      operator={operator}
      title="Central operacional"
      description="Acompanhe tudo o que entrou no portal e o que já foi localizado na Nexti."
    >
      <OperationsBoard
        filterOptions={filterOptions}
        defaultPayrollReference={getCurrentPayrollWindow().reference}
        isAdmin={operator.role === "admin"}
      />
    </OperatorShell>
  );
}
