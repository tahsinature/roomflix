import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-0",
  {
    variants: {
      variant: {
        // Default: subtle outlined chrome, used for low-emphasis affordances.
        default: "border border-border bg-bg-elevated text-foreground hover:border-border-hover hover:bg-card hover:-translate-y-px",
        // Accent: ClawShip's primary CTA — coral fill, inner highlight, outer glow.
        accent: "bg-accent text-accent-foreground accent-glow hover:bg-accent-bright hover:-translate-y-px hover:accent-glow-lg",
        // Outline: bordered transparent. Hover lifts and brightens border.
        outline: "border border-border bg-transparent text-foreground hover:border-border-hover hover:bg-white/[0.03] hover:-translate-y-px",
        ghost: "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        destructive: "bg-accent text-accent-foreground accent-glow hover:bg-accent-bright",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { buttonVariants };
