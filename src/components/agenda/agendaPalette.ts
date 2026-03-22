import type { AgendaAppointmentItem } from "@/services/api";

type PaletteTone = {
  key: string;
  label: string;
  eventClass: string;
  chipClass: string;
  dotClass: string;
};

const DEFAULT_TONE: PaletteTone = {
  key: "default",
  label: "Atendimento",
  eventClass: "bg-slate-100 border-slate-300 text-slate-900",
  chipClass: "bg-slate-100 text-slate-700 border-slate-200",
  dotClass: "bg-slate-500",
};

const SERVICE_PALETTE: PaletteTone[] = [
  {
    key: "entrevista_social",
    label: "Entrevista Social",
    eventClass: "bg-blue-100 border-blue-300 text-blue-900",
    chipClass: "bg-blue-100 text-blue-800 border-blue-200",
    dotClass: "bg-blue-600",
  },
  {
    key: "avaliacao_multidisciplinar",
    label: "Avaliacao",
    eventClass: "bg-fuchsia-100 border-fuchsia-300 text-fuchsia-900",
    chipClass: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
    dotClass: "bg-fuchsia-600",
  },
  {
    key: "psicologia",
    label: "Psicologia",
    eventClass: "bg-emerald-100 border-emerald-300 text-emerald-900",
    chipClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-600",
  },
  {
    key: "fono",
    label: "Fono",
    eventClass: "bg-orange-100 border-orange-300 text-orange-900",
    chipClass: "bg-orange-100 text-orange-800 border-orange-200",
    dotClass: "bg-orange-600",
  },
  {
    key: "terapia_ocupacional",
    label: "Terapia Ocupacional",
    eventClass: "bg-amber-100 border-amber-300 text-amber-900",
    chipClass: "bg-amber-100 text-amber-800 border-amber-200",
    dotClass: "bg-amber-600",
  },
  {
    key: "analise_vaga",
    label: "Analise de vaga / Reuniao interna",
    eventClass: "bg-zinc-100 border-zinc-300 text-zinc-900",
    chipClass: "bg-zinc-100 text-zinc-800 border-zinc-200",
    dotClass: "bg-zinc-600",
  },
];

const STATUS_ACCENT_MAP: Record<string, string> = {
  confirmado: "border-l-4 border-l-emerald-600",
  confirmed: "border-l-4 border-l-emerald-600",
  agendado: "border-l-4 border-l-amber-500",
  scheduled: "border-l-4 border-l-amber-500",
  cancelado: "border-l-4 border-l-red-600 opacity-80",
  cancelled: "border-l-4 border-l-red-600 opacity-80",
  remarcado: "border-l-4 border-l-violet-600",
  concluido: "border-l-4 border-l-emerald-800",
  completed: "border-l-4 border-l-emerald-800",
};

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function resolvePaletteKey(item: Pick<AgendaAppointmentItem, "event_type_institutional" | "service_name">): string {
  const eventType = normalizeText(item.event_type_institutional || "");
  const serviceName = normalizeText(item.service_name || "");

  if (eventType === "entrevista_social" || includesAny(serviceName, ["entrevista social", "entrevista"])) {
    return "entrevista_social";
  }
  if (
    eventType === "avaliacao_multidisciplinar" ||
    includesAny(serviceName, ["avaliacao", "avaliação", "avaliacao multidisciplinar"])
  ) {
    return "avaliacao_multidisciplinar";
  }
  if (includesAny(serviceName, ["psicologia", "psicologo", "psicóloga", "psicologo"])) {
    return "psicologia";
  }
  if (includesAny(serviceName, ["fono", "fonoaudiologia", "fonoaudiologo", "fonoaudiólogo"])) {
    return "fono";
  }
  if (
    includesAny(serviceName, [
      "terapia ocupacional",
      "terapeuta ocupacional",
      "to ",
      " t.o",
    ])
  ) {
    return "terapia_ocupacional";
  }
  if (
    eventType === "analise_vaga" ||
    includesAny(serviceName, ["analise de vaga", "análise de vaga", "reuniao", "reunião interna"])
  ) {
    return "analise_vaga";
  }
  return DEFAULT_TONE.key;
}

export function resolveAgendaEventPalette(
  item: Pick<AgendaAppointmentItem, "event_type_institutional" | "service_name" | "appointment_status" | "status">
): {
  key: string;
  label: string;
  eventClass: string;
  chipClass: string;
  dotClass: string;
  statusAccentClass: string;
} {
  const paletteKey = resolvePaletteKey(item);
  const tone = SERVICE_PALETTE.find((entry) => entry.key === paletteKey) || DEFAULT_TONE;
  const statusRaw = normalizeText(item.appointment_status || item.status || "");
  const statusAccentClass = STATUS_ACCENT_MAP[statusRaw] || "border-l-4 border-l-slate-400";

  return {
    key: tone.key,
    label: tone.label,
    eventClass: tone.eventClass,
    chipClass: tone.chipClass,
    dotClass: tone.dotClass,
    statusAccentClass,
  };
}

export function agendaLegend(): Array<{
  key: string;
  label: string;
  chipClass: string;
  dotClass: string;
}> {
  return [...SERVICE_PALETTE, DEFAULT_TONE].map((tone) => ({
    key: tone.key,
    label: tone.label,
    chipClass: tone.chipClass,
    dotClass: tone.dotClass,
  }));
}

export function agendaStatusLegend(): Array<{
  key: string;
  label: string;
  className: string;
}> {
  return [
    { key: "confirmado", label: "Confirmado", className: STATUS_ACCENT_MAP.confirmado },
    { key: "agendado", label: "Agendado / pendente", className: STATUS_ACCENT_MAP.agendado },
    { key: "cancelado", label: "Cancelado", className: STATUS_ACCENT_MAP.cancelado },
    { key: "remarcado", label: "Remarcado", className: STATUS_ACCENT_MAP.remarcado },
    { key: "concluido", label: "Concluido", className: STATUS_ACCENT_MAP.concluido },
  ];
}
