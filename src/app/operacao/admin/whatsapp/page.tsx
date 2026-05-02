import { OperatorShell } from "@/components/app-shell/operator-shell";
import { WhatsappRulesManager } from "@/components/operators/whatsapp-rules-manager";
import { requireOperatorSession } from "@/lib/auth/operator";
import { assertOperatorIsAdmin } from "@/lib/auth/operator-access";

export default async function WhatsappAdminPage() {
  const operator = await requireOperatorSession();
  assertOperatorIsAdmin(operator);

  return (
    <OperatorShell
      operator={operator}
      title="WhatsApp"
      description="Configure quando o botão de WhatsApp manual fica ativo ou bloqueado."
      backHref="/operacao"
    >
      <WhatsappRulesManager />
    </OperatorShell>
  );
}
