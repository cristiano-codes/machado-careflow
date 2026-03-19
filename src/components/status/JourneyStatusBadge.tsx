import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  coerceStatusText,
  formatLegacyOperationalStatus,
  getJourneyStatusBadgeVariant,
  getJourneyStatusLabel,
  resolveJourneyStatusWithLegacyFallback,
  resolveOfficialJourneyStatus,
  resolveLegacyOperationalStatus,
  type JourneyStatusSource,
} from "./journey-status";

export type JourneyStatusBadgeProps = Omit<
  React.ComponentPropsWithoutRef<typeof Badge>,
  "variant" | "children"
> & {
  source?: JourneyStatusSource | null;
  status?: string | null;
  legacyFallback?: boolean;
  emptyLabel?: string;
};

export function JourneyStatusBadge({
  source,
  status,
  legacyFallback = false,
  emptyLabel = "Sem status da jornada",
  className,
  title,
  ...props
}: JourneyStatusBadgeProps) {
  const officialStatus = source ? resolveOfficialJourneyStatus(source) : null;
  const legacyStatus = source ? resolveLegacyOperationalStatus(source) : null;
  const explicitStatus = source ? null : coerceStatusText(status);
  const resolvedStatus = source
    ? legacyFallback
      ? resolveJourneyStatusWithLegacyFallback(source)
      : officialStatus
    : explicitStatus;

  if (!resolvedStatus) {
    return (
      <Badge
        {...props}
        title={title ?? (source ? "Status oficial da jornada" : "Status informado")}
        variant="secondary"
        className={cn("whitespace-nowrap", className)}
      >
        {emptyLabel}
      </Badge>
    );
  }

  const isLegacyFallback = source ? !officialStatus && legacyFallback && !!legacyStatus : false;
  const label = isLegacyFallback
    ? formatLegacyOperationalStatus(legacyStatus)
    : source
      ? getJourneyStatusLabel(officialStatus ?? resolvedStatus)
      : getJourneyStatusLabel(resolvedStatus);
  const variant = isLegacyFallback ? "outline" : getJourneyStatusBadgeVariant(resolvedStatus);
  const badgeTitle = title ?? (isLegacyFallback ? "Status operacional legado" : "Status oficial da jornada");

  return (
    <Badge
      {...props}
      title={badgeTitle}
      variant={variant}
      className={cn("whitespace-nowrap", className)}
    >
      {label}
    </Badge>
  );
}
