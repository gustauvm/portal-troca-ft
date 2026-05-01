import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
  {
    variants: {
      variant: {
        primary:
          "bg-[linear-gradient(135deg,var(--brand-600),var(--brand-500))] text-white shadow-[0_16px_40px_rgba(6,34,54,0.24)] hover:translate-y-[-1px]",
        secondary:
          "bg-white/75 text-[color:var(--ink-900)] ring-1 ring-black/8 backdrop-blur hover:bg-white",
        ghost:
          "bg-transparent text-[color:var(--ink-800)] hover:bg-black/5",
        danger:
          "bg-[linear-gradient(135deg,#8b1e2a,#b7333f)] text-white shadow-[0_12px_28px_rgba(139,30,42,0.24)]",
      },
      size: {
        sm: "h-10 px-4",
        md: "h-11 px-5",
        lg: "h-12 px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
