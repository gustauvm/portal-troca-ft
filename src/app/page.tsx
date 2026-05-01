import Link from "next/link";
import { ArrowRight, ShieldCheck, Smartphone, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const featureCards = [
  {
    title: "Validação na origem",
    description:
      "Bloqueia matrícula errada, datas duplicadas, período fora da folha e conflitos de escala antes da solicitação entrar na fila.",
    icon: ShieldCheck,
  },
  {
    title: "100% pensado para celular",
    description:
      "Fluxo guiado, objetivo e rápido para quem abre o portal no posto ou durante a troca de turno.",
    icon: Smartphone,
  },
  {
    title: "Operação com rastreabilidade",
    description:
      "Fila filtrável, timeline de eventos, status de lançamento e sincronização em tempo quase real com a Nexti.",
    icon: Workflow,
  },
];

export default function HomePage() {
  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--brand-700),var(--brand-500))] text-white shadow-[0_18px_36px_rgba(10,49,77,0.24)]">
              <span className="font-display text-lg font-semibold">DT</span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--brand-700)]">
                Portal Operacional
              </p>
              <h1 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--ink-950)]">
                Permutas e FT
              </h1>
            </div>
          </div>
          <Badge variant="brand" className="hidden sm:inline-flex">
            Nexti + Supabase
          </Badge>
        </header>

        <section className="grid flex-1 gap-8 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="brand">Fluxo guiado para colaborador e operação</Badge>
            <div className="space-y-4">
              <h2 className="max-w-4xl text-4xl font-semibold tracking-[-0.06em] text-[color:var(--ink-950)] sm:text-5xl lg:text-6xl">
                Menos ruído na troca, mais controle na folha.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-[color:var(--ink-700)] sm:text-lg">
                O novo portal centraliza permutas e folgas trabalhadas, valida regras críticas de
                escala na origem e devolve para operação uma fila pronta para lançamento manual com
                auditoria, filtros e reconciliação automática.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/entrar">
                  Sou colaborador
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
                <Link href="/operacao/entrar">Entrar na operação</Link>
              </Button>
            </div>

            <div className="grid gap-4 pt-3 sm:grid-cols-3">
              {[
                { value: "22→21", label: "regra fixa de folha" },
                { value: "Realtime", label: "status operacional" },
                { value: "Mobile", label: "UX nativa de bolso" },
              ].map((item) => (
                <Card key={item.label} className="bg-white/72">
                  <CardContent className="space-y-1 px-5 py-5">
                    <p className="text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink-950)]">
                      {item.value}
                    </p>
                    <p className="text-sm text-[color:var(--ink-600)]">{item.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card className="overflow-hidden border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(241,246,249,0.92))]">
            <CardHeader className="border-b border-black/6 pb-5">
              <Badge variant="neutral" className="w-fit">
                Jornada do produto
              </Badge>
              <CardTitle className="text-2xl">Entrada rápida, rastreio completo.</CardTitle>
              <CardDescription>
                A experiência separa claramente o que é autosserviço do colaborador e o que é mesa
                operacional, sem perder o contexto da empresa, cargo, escala e posto.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-5 sm:p-6">
              {featureCards.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="flex gap-4 rounded-[24px] border border-black/6 bg-white/82 p-4"
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color:var(--brand-100)] text-[color:var(--brand-700)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold tracking-[0.22em] text-[color:var(--brand-700)]">
                          0{index + 1}
                        </span>
                        <h3 className="text-base font-semibold text-[color:var(--ink-950)]">
                          {feature.title}
                        </h3>
                      </div>
                      <p className="text-sm leading-6 text-[color:var(--ink-600)]">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
