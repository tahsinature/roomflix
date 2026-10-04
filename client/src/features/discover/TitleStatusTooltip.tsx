import { TooltipDetails } from "@/components/ui/tooltip";
import { statusDateLabel } from "./status-tooltip";

export function TitleStatusTooltip({ action, timestamp, hint, tone }: { action: string; timestamp?: number | null; hint?: string; tone?: string }) {
  return <TooltipDetails heading={action} description={statusDateLabel(timestamp)} footer={hint} tone={tone} />;
}
