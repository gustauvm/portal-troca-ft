import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-3xl border border-black/8 bg-white/80 px-4 py-3 text-sm text-[color:var(--ink-950)] outline-none transition placeholder:text-[color:var(--ink-400)] focus:border-[color:var(--brand-400)] focus:ring-4 focus:ring-[color:var(--brand-100)]",
        className,
      )}
      {...props}
    />
  );
}
