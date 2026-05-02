import { OperatorShell } from "@/components/app-shell/operator-shell";
import { ManualRequestForm } from "@/components/operators/manual-request-form";
import { requireOperatorSession } from "@/lib/auth/operator";
import { listOperationalWorkplaces, listValidShifts } from "@/lib/directory/service";
import { listFtReasons } from "@/lib/requests/service";

export default async function ManualRequestPage() {
  const operator = await requireOperatorSession();
  const [workplaces, shifts, ftReasons] = await Promise.all([
    listOperationalWorkplaces(),
    listValidShifts(),
    listFtReasons(),
  ]);

  return (
    <OperatorShell
      operator={operator}
      title="Novo lançamento manual"
      description="Registre exceções autorizadas pela coordenação."
      backHref="/operacao"
    >
      <div className="mx-auto max-w-2xl">
        <ManualRequestForm workplaces={workplaces} shifts={shifts} ftReasons={ftReasons} />
      </div>
    </OperatorShell>
  );
}
