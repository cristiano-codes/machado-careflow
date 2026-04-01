import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

type FilterToggleButtonProps = {
  open: boolean;
  activeCount: number;
  onClick: () => void;
};

export function FilterToggleButton({ open, activeCount, onClick }: FilterToggleButtonProps) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      <Filter className="h-4 w-4" />
      {open ? "Ocultar filtros" : "Mostrar filtros"}
      {activeCount > 0 ? ` (${activeCount})` : ""}
    </Button>
  );
}
