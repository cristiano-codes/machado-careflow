export type OccupancyLevel = "ok" | "attention" | "critical" | "full";

export function getClassOccupancyLevel(activeCount: number, maxCapacity: number): OccupancyLevel {
  if (maxCapacity <= 0) return "ok";
  if (activeCount >= maxCapacity) return "full";
  const ratio = activeCount / maxCapacity;
  if (ratio >= 0.9) return "critical";
  if (ratio >= 0.75) return "attention";
  return "ok";
}

export function getOccupancyTone(level: OccupancyLevel) {
  if (level === "full") return "text-rose-700";
  if (level === "critical") return "text-amber-700";
  if (level === "attention") return "text-yellow-700";
  return "text-emerald-700";
}

export function getOccupancyLabel(level: OccupancyLevel) {
  if (level === "full") return "Lotada";
  if (level === "critical") return "Quase lotada";
  if (level === "attention") return "Ocupacao moderada";
  return "Disponivel";
}
