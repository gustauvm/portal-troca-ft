import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperatorSignOutButton } from "@/components/app-shell/signout-buttons";

export function OperatorShell({
  operator,
  title,
  description,
  backHref,
  children,
}: {
  operator: {
    fullName: string;
    role: string;
  };
  title: string;
  description: string;
  backHref?: Route;
  children: React.ReactNode;
}) {
  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-[28px] border border-white/60 bg-white/78 px-4 py-4 shadow-[0_10px_40px_rgba(10,20,30,0.08)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              {backHref ? (
                <Button asChild variant="secondary" size="sm" className="mt-1">
                  <Link href={backHref}>
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </Link>
                </Button>
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--brand-700)]">
                  Mesa operacional
                </p>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--ink-950)]">
                  {title}
                </h1>
                <p className="text-sm text-[color:var(--ink-600)]">{description}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-[color:var(--surface-150)] px-4 py-3 text-sm text-[color:var(--ink-700)]">
              <UserRoundCog className="h-4 w-4" />
              <div>
                <p className="font-semibold text-[color:var(--ink-950)]">{operator.fullName}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--ink-600)]">
                  {operator.role}
                </p>
              </div>
              <OperatorSignOutButton />
            </div>
          </div>
        </header>

        <section className="flex-1">{children}</section>
      </div>
    </main>
  );
}
