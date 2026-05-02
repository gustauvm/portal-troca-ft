import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/app-shell/operator-shell";
import { ReviewActions } from "@/components/operators/review-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LaunchStatusPill, WorkflowStatusPill } from "@/components/ui/status-pill";
import { requireOperatorSession } from "@/lib/auth/operator";
import { getOperatorRequestDetail } from "@/lib/requests/service";
import { formatBrazilianDate } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RequestDetailPage({ params }: Props) {
  const operator = await requireOperatorSession();
  const { id } = await params;
  const detail = await getOperatorRequestDetail(id, operator);

  if (!detail) {
    notFound();
  }

  const request = detail.request;
  const canReview = request.workflowStatus === "submitted";
  const canSendWhatsapp = request.launchStatus === "matched";

  return (
    <OperatorShell
      operator={operator}
      title="Detalhe da solicitação"
      description="Revise a trilha de eventos, assuma a demanda e decida o encaminhamento."
      backHref="/operacao"
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="text-2xl">
                    {request.requesterName} • RE {request.requesterEnrolment}
                  </CardTitle>
                  <CardDescription>
                    {request.requestType === "swap" ? "Permuta (Troca de Folga)" : "FT"}
                    {request.substituteName ? ` • com ${request.substituteName}` : ""}
                    {request.workplaceName ? ` • ${request.workplaceName}` : ""}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <WorkflowStatusPill status={request.workflowStatus} />
                  <LaunchStatusPill status={request.launchStatus} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-[color:var(--surface-150)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-700)]">
                    Data principal
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--ink-950)]">
                    {formatBrazilianDate(request.requestDate)}
                  </p>
                </div>
                <div className="rounded-3xl bg-[color:var(--surface-150)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-700)]">
                    Data de compensação
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--ink-950)]">
                    {request.coverageDate ? formatBrazilianDate(request.coverageDate) : "Não se aplica"}
                  </p>
                </div>
              </div>

              <div className="rounded-[28px] border border-black/6 bg-white/75 p-5">
                <p className="text-sm font-semibold text-[color:var(--ink-950)]">
                  {request.requestType === "ft" ? "Dados da FT" : "Motivo"}
                </p>
                <p className="mt-2 text-sm leading-7 text-[color:var(--ink-700)]">
                  {request.requestType === "ft"
                    ? [
                        request.selectedShiftName ? `Horário: ${request.selectedShiftName}` : null,
                        request.selectedShiftTurn ? `Turno: ${request.selectedShiftTurn}` : null,
                        request.ftReasonLabel ? `Motivo operacional: ${request.ftReasonLabel}` : null,
                        request.coveredName ? `Coberto: ${request.coveredName}` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ") || "FT sem motivo operacional preenchido."
                    : request.reason}
                </p>
                {request.manualAuthorizationNote ? (
                  <p className="mt-3 rounded-2xl bg-[color:var(--accent-100)] px-4 py-3 text-sm text-[color:var(--ink-800)]">
                    Autorização manual: {request.manualAuthorizationNote}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>Eventos da solicitação em ordem reversa.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {(detail.events || []).map((event: { id: string; event_type: string; actor_label: string | null; created_at: string }) => (
                <div key={event.id} className="rounded-2xl border border-black/6 bg-white/76 px-4 py-4">
                  <p className="text-sm font-semibold text-[color:var(--ink-950)]">{event.event_type}</p>
                  <p className="text-sm text-[color:var(--ink-600)]">
                    {event.actor_label || "Sistema"} • {new Date(event.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <ReviewActions requestId={request.id} canReview={canReview} canSendWhatsapp={canSendWhatsapp} />
        </div>
      </div>
    </OperatorShell>
  );
}
