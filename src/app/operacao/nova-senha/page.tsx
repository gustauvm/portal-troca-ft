import { Suspense } from "react";
import { OperatorPasswordForm } from "@/components/operators/operator-password-form";

export default function OperatorNewPasswordPage() {
  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-md place-items-center px-4 py-8">
        <Suspense fallback={null}>
          <OperatorPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
