import { createContext, useContext, useEffect, useState, type ReactElement, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipPortalContext = createContext<HTMLElement | null>(null);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const updateContainer = () => setContainer(document.fullscreenElement as HTMLElement | null);
    updateContainer();
    document.addEventListener("fullscreenchange", updateContainer);
    return () => document.removeEventListener("fullscreenchange", updateContainer);
  }, []);
  return (
    <TooltipPortalContext.Provider value={container}>
      <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={150}>
        {children}
      </TooltipPrimitive.Provider>
    </TooltipPortalContext.Provider>
  );
}

export function Tooltip({ content, children, side = "top" }: { content?: ReactNode; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  const container = useContext(TooltipPortalContext);
  if (!content) return children;
  // Disabled buttons cannot receive pointer events. A span keeps their help available.
  const trigger = children.props.disabled ? (
    <span tabIndex={0} className="inline-flex max-w-full">
      {children}
    </span>
  ) : (
    children
  );
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        asChild
        data-tooltip-trigger=""
        onPointerMove={(event) => {
          // A nested status icon owns its tooltip instead of also opening its parent's.
          if (event.target instanceof Element && event.target.closest("[data-tooltip-trigger]") !== event.currentTarget) event.preventDefault();
        }}
        onFocus={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-tooltip-trigger]") !== event.currentTarget) event.preventDefault();
        }}
      >
        {trigger}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal container={container ?? undefined}>
        <TooltipPrimitive.Content side={side} sideOffset={8} collisionPadding={12} className="app-tooltip">
          {content}
          <TooltipPrimitive.Arrow width={10} height={5} className="fill-bg-elevated" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function TooltipDetails({ heading, description, footer, tone }: { heading: ReactNode; description?: ReactNode; footer?: ReactNode; tone?: string }) {
  return (
    <span className="block max-w-64">
      <span className={cn("block font-medium text-foreground", tone)}>{heading}</span>
      {description ? <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{description}</span> : null}
      {footer ? <span className="mt-2 block border-t border-border-hover pt-2 text-[10px] text-muted-foreground">{footer}</span> : null}
    </span>
  );
}
