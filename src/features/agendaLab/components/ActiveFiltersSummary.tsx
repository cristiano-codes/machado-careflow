import { Badge } from "@/components/ui/badge";

type ActiveFiltersSummaryProps = {
  filters: string[];
};

export function ActiveFiltersSummary({ filters }: ActiveFiltersSummaryProps) {
  if (filters.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem filtros ativos.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-muted-foreground">{filters.length} filtros ativos</p>
      {filters.map((item) => (
        <Badge key={item} variant="secondary" className="rounded-full px-2 py-0.5 text-[11px]">
          {item}
        </Badge>
      ))}
    </div>
  );
}
