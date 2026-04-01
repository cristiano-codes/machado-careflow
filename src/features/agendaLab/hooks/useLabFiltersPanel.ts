import { useEffect, useState } from "react";
import { readLabFiltersOpen, writeLabFiltersOpen } from "@/features/agendaLab/utils/storage";

export function useLabFiltersPanel(pageKey: string, defaultOpen = false) {
  const [isOpen, setIsOpen] = useState(() => readLabFiltersOpen(pageKey, defaultOpen));

  useEffect(() => {
    writeLabFiltersOpen(pageKey, isOpen);
  }, [isOpen, pageKey]);

  return [isOpen, setIsOpen] as const;
}
