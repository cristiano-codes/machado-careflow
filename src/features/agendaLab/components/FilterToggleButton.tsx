import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FilterToggleButtonProps = {
  open: boolean;
  activeCount: number;
  onClick: () => void;
  className?: string;
};

export function FilterToggleButton({ open, activeCount, onClick, className }: FilterToggleButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      className={cn("shrink-0 whitespace-nowrap", className)}
    >
      <Filter className="h-4 w-4" />
      {open ? "Ocultar filtros" : "Mostrar filtros"}
      {activeCount > 0 ? ` (${activeCount})` : ""}
    </Button>
  );
}
