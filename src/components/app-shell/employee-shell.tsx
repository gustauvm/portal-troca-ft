import Link from "next/link";
import { ScrollText, Shuffle, SquareChartGantt } from "lucide-react";
import { EmployeeSignOutButton } from "@/components/app-shell/signout-buttons";

const employeeNavItems = [
  {
    href: "/solicitar/permuta",
    label: "Permuta (Troca de Folga)",
    icon: Shuffle,
  },
  {
    href: "/solicitar/ft",
    label: "FT",
    icon: SquareChartGantt,
  },
  {
    href: "/minhas-solicitacoes",
    label: "Minhas solicitações",
    icon: ScrollText,
  },
] as const;

export function EmployeeShell({
  employee,
  children,
}: {
  employee: {
    fullName: string;
    companyName: string;
    careerName: string | null;
    workplaceName: string | null;
  };
  children: React.ReactNode;
}) {
  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 rounded-[28px] border border-white/60 bg-white/78 px-4 py-4 shadow-[0_10px_34px_rgba(10,20,30,0.07)] backdrop-blur-xl sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--brand-700)]">
                Portal do colaborador
              </p>
              <h1 className="truncate text-xl font-semibold tracking-[-0.04em] text-[color:var(--ink-950)]">
                {employee.fullName}
              </h1>
              <p className="truncate text-sm text-[color:var(--ink-600)]">
                {employee.companyName}
                {employee.careerName ? ` • ${employee.careerName}` : ""}
                {employee.workplaceName ? ` • ${employee.workplaceName}` : ""}
              </p>
            </div>
            <EmployeeSignOutButton />
          </div>

          <nav className="mt-4 grid grid-cols-3 gap-2 rounded-[22px] bg-[color:var(--surface-150)] p-1">
            {employeeNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-[18px] px-2 text-center text-[11px] font-semibold leading-tight text-[color:var(--ink-850)] transition hover:bg-white/80 sm:text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </header>

        <section className="flex-1">{children}</section>
      </div>
    </main>
  );
}
