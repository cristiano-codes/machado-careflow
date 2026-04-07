import type { Unit } from "@/features/agendaLab/types";

export function resolveDefaultUnit(units: Unit[]): Unit | null {
  if (!Array.isArray(units) || units.length === 0) return null;
  return units[0];
}

export function resolveDefaultUnitId(units: Unit[]): string {
  return resolveDefaultUnit(units)?.id || "";
}

export function isSingleUnitUxMode(units: Unit[]): boolean {
  return Array.isArray(units) && units.length > 0;
}
