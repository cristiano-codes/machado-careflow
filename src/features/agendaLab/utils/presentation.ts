import type {
  ActivityStatus,
  AllocationStatus,
  ClassStatus,
  EnrollmentStatus,
  RoomStatus,
  Weekday,
} from "@/features/agendaLab/types";

export const LAB_WEEKDAYS: Array<{ key: Weekday; label: string; short: string }> = [
  { key: "seg", label: "Segunda", short: "SEG" },
  { key: "ter", label: "Terca", short: "TER" },
  { key: "qua", label: "Quarta", short: "QUA" },
  { key: "qui", label: "Quinta", short: "QUI" },
  { key: "sex", label: "Sexta", short: "SEX" },
  { key: "sab", label: "Sabado", short: "SAB" },
];

export function getWeekdayLabel(weekday: Weekday) {
  return LAB_WEEKDAYS.find((item) => item.key === weekday)?.label || weekday;
}

export function getRoomStatusLabel(status: RoomStatus) {
  if (status === "ativa") return "Ativa";
  if (status === "manutencao") return "Manutencao";
  return "Inativa";
}

export function getActivityStatusLabel(status: ActivityStatus) {
  if (status === "ativa") return "Ativa";
  if (status === "em_revisao") return "Em revisao";
  return "Inativa";
}

export function getClassStatusLabel(status: ClassStatus) {
  if (status === "ativa") return "Ativa";
  if (status === "planejada") return "Planejada";
  if (status === "pausada") return "Pausada";
  return "Encerrada";
}

export function getAllocationStatusLabel(status: AllocationStatus) {
  if (status === "ativa") return "Ativa";
  if (status === "planejada") return "Planejada";
  return "Suspensa";
}

export function getEnrollmentStatusLabel(status: EnrollmentStatus) {
  if (status === "ativo") return "Ativo";
  if (status === "aguardando_vaga") return "Aguardando vaga";
  if (status === "suspenso") return "Suspenso";
  if (status === "desligado") return "Desligado";
  return "Concluido";
}

export function statusToBadgeVariant(
  status: RoomStatus | ActivityStatus | ClassStatus | AllocationStatus | EnrollmentStatus
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "ativa" || status === "ativo") return "default";
  if (
    status === "manutencao" ||
    status === "pausada" ||
    status === "suspensa" ||
    status === "suspenso" ||
    status === "em_revisao"
  ) {
    return "secondary";
  }
  return "outline";
}
