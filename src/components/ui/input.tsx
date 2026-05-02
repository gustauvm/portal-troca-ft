import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-black/8 bg-white/80 px-4 text-sm text-[color:var(--ink-950)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] outline-none transition placeholder:text-[color:var(--ink-400)] focus:border-[color:var(--brand-400)] focus:ring-4 focus:ring-[color:var(--brand-100)]",
        className,
      )}
      {...props}
    />
  );
}
