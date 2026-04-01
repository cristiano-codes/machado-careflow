import type { ReactNode } from "react";
import { Filter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ActiveFiltersSummary } from "@/features/agendaLab/components/ActiveFiltersSummary";

type CollapsibleFiltersProps = {
  open: boolean;
  filters: string[];
  classCount: number;
  allocationCount: number;
  children: ReactNode;
};

export function CollapsibleFilters({
  open,
  filters,
  classCount,
  allocationCount,
  children,
}: CollapsibleFiltersProps) {
  return (
    <Collapsible open={open}>
      {!open ? (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <ActiveFiltersSummary filters={filters} />
            <p className="text-xs text-muted-foreground">
              {classCount} turmas e {allocationCount} alocacoes no recorte.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <CollapsibleContent>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4" />
              Filtros
            </CardTitle>
            <CardDescription>Filtros locais para leitura operacional da unidade.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {children}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <ActiveFiltersSummary filters={filters} />
              <p className="text-xs text-muted-foreground">
                {classCount} turmas e {allocationCount} alocacoes no recorte.
              </p>
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
