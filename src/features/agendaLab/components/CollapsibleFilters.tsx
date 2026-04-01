import type { ReactNode } from "react";
import { Filter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ActiveFiltersSummary } from "@/features/agendaLab/components/ActiveFiltersSummary";

type CollapsibleFiltersProps = {
  open: boolean;
  filters: string[];
  title?: string;
  description?: string;
  summaryText?: string;
  children: ReactNode;
};

export function CollapsibleFilters({
  open,
  filters,
  title = "Filtros",
  description = "Filtros locais para leitura operacional da unidade.",
  summaryText,
  children,
}: CollapsibleFiltersProps) {
  return (
    <Collapsible open={open}>
      <CollapsibleContent>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4" />
              {title}
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {children}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <ActiveFiltersSummary filters={filters} />
              {summaryText ? <p className="text-xs text-muted-foreground">{summaryText}</p> : null}
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
