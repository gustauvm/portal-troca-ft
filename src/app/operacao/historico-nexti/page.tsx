import { OperatorShell } from "@/components/app-shell/operator-shell";
import { LaunchHistoryBoard } from "@/components/operators/launch-history-board";
import { requireOperatorSession } from "@/lib/auth/operator";
import { getOperationalFilterOptions } from "@/lib/directory/service";
import { getCurrentPayrollWindow } from "@/lib/utils/payroll";

export default async function NextiHistoryPage() {
  const operator = await requireOperatorSession();
  const filterOptions = await getOperationalFilterOptions();
  const payroll = getCurrentPayrollWindow();

  return (
    <OperatorShell
      operator={operator}
      title="Histórico Nexti"
      description="Consulte FT e Permuta (Troca de Folga) já lançadas no Nexti."
      backHref="/operacao"
    >
      <LaunchHistoryBoard filterOptions={filterOptions} defaultPayrollReference={payroll.reference} />
    </OperatorShell>
  );
}
