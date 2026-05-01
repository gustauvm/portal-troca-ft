import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-2 block text-sm font-semibold tracking-[-0.01em] text-[color:var(--ink-800)]", className)}
      {...props}
    />
  );
}
