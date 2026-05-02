import { redirect } from "next/navigation";
import { OperatorLoginForm } from "@/components/operators/operator-login-form";
import { getOperatorSession } from "@/lib/auth/operator";

export default async function OperatorEntryPage() {
  const operator = await getOperatorSession();
  if (operator) {
    redirect("/operacao");
  }

  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-md place-items-center px-4 py-8">
        <OperatorLoginForm />
      </div>
    </main>
  );
}
