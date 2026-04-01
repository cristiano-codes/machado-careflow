import type { AllocationStatus, ClassStatus, Weekday } from "@/features/agendaLab/types";

export type AgendaCalendarEvent = {
  occurrenceId: string;
  occurrenceDate: Date;
  allocationId: string;
  weekday: Weekday;
  horaInicial: string;
  horaFinal: string;
  titulo: string;
  atividadeNome: string;
  salaNome: string;
  profissionalNome: string;
  ocupacaoTexto: string;
  allocationStatus: AllocationStatus;
  classStatus: ClassStatus;
  hasRoomConflict: boolean;
  hasProfessionalConflict: boolean;
};
