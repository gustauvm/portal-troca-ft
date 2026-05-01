import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-2xl border border-black/8 bg-white/80 px-4 text-sm text-[color:var(--ink-950)] outline-none transition focus:border-[color:var(--brand-400)] focus:ring-4 focus:ring-[color:var(--brand-100)]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
