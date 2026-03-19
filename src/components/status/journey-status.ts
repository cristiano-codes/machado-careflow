export const JOURNEY_STATUS_SEQUENCE = [
  "em_fila_espera",
  "entrevista_realizada",
  "em_avaliacao",
  "em_analise_vaga",
  "aprovado",
  "encaminhado",
  "matriculado",
  "ativo",
  "inativo_assistencial",
  "desligado",
] as const;

export type JourneyStatus = (typeof JOURNEY_STATUS_SEQUENCE)[number];

export type JourneyStatusSource = {
  status_jornada?: string | null;
  journey_status?: string | null;
  statusJornada?: string | null;
  journeyStatus?: string | null;
  status?: string | null;
};

export type JourneyBadgeVariant = "default" | "secondary" | "destructive" | "outline";

const JOURNEY_STATUS_SET = new Set<string>(JOURNEY_STATUS_SEQUENCE);

export const JOURNEY_STATUS_LABELS: Record<JourneyStatus, string> = {
  em_fila_espera: "Em fila de espera",
  entrevista_realizada: "Entrevista realizada",
  em_avaliacao: "Em avaliacao",
  em_analise_vaga: "Em analise de vaga",
  aprovado: "Aprovado",
  matriculado: "Matriculado",
  ativo: "Ativo",
  inativo_assistencial: "Inativo assistencial",
  desligado: "Desligado",
  encaminhado: "Encaminhado",
};

export const JOURNEY_STATUS_VARIANTS: Record<JourneyStatus, JourneyBadgeVariant> = {
  em_fila_espera: "secondary",
  entrevista_realizada: "outline",
  em_avaliacao: "default",
  em_analise_vaga: "default",
  aprovado: "default",
  matriculado: "default",
  ativo: "outline",
  inativo_assistencial: "secondary",
  desligado: "destructive",
  encaminhado: "secondary",
};

export const JOURNEY_STATUS_TRANSITIONS: Record<JourneyStatus, readonly JourneyStatus[]> = {
  em_fila_espera: ["entrevista_realizada"],
  entrevista_realizada: ["em_avaliacao"],
  em_avaliacao: ["em_analise_vaga"],
  em_analise_vaga: ["aprovado", "encaminhado"],
  aprovado: ["matriculado"],
  matriculado: ["ativo"],
  ativo: ["inativo_assistencial", "desligado"],
  inativo_assistencial: ["ativo"],
  desligado: [],
  encaminhado: [],
};

export const LEGACY_OPERATIONAL_STATUS_LABELS: Record<string, string> = {
  pre_cadastro: "Pre-cadastro",
  ativo: "Ativo",
  inativo: "Inativo",
  inativo_assistencial: "Inativo assistencial",
  desligado: "Desligado",
};

function normalizeSeparators(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function humanizeStatus(value: string): string {
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function coerceStatusText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeJourneyStatus(value: unknown): JourneyStatus | null {
  const text = coerceStatusText(value);
  if (!text) return null;

  const normalized = normalizeSeparators(text);
  return JOURNEY_STATUS_SET.has(normalized) ? (normalized as JourneyStatus) : null;
}

export function isJourneyStatus(value: unknown): value is JourneyStatus {
  return normalizeJourneyStatus(value) !== null;
}

export function getAllowedJourneyTransitions(
  currentStatus: string | null | undefined
): readonly JourneyStatus[] {
  const normalized = normalizeJourneyStatus(currentStatus);
  if (!normalized) return [];
  return JOURNEY_STATUS_TRANSITIONS[normalized] || [];
}

export function isJourneyTransitionAllowed(
  currentStatus: string | null | undefined,
  nextStatus: string | null | undefined
): boolean {
  const normalizedCurrent = normalizeJourneyStatus(currentStatus);
  const normalizedNext = normalizeJourneyStatus(nextStatus);
  if (!normalizedCurrent || !normalizedNext) return false;
  if (normalizedCurrent === normalizedNext) return true;
  return getAllowedJourneyTransitions(normalizedCurrent).includes(normalizedNext);
}

export function resolveOfficialJourneyStatus(source?: JourneyStatusSource | null): string | null {
  return (
    coerceStatusText(source?.status_jornada) ??
    coerceStatusText(source?.journey_status) ??
    coerceStatusText(source?.statusJornada) ??
    coerceStatusText(source?.journeyStatus) ??
    null
  );
}

export function resolveLegacyOperationalStatus(source?: JourneyStatusSource | null): string | null {
  return coerceStatusText(source?.status);
}

export function resolveJourneyStatusWithLegacyFallback(
  source?: JourneyStatusSource | null
): string | null {
  return resolveOfficialJourneyStatus(source) ?? resolveLegacyOperationalStatus(source);
}

export function getJourneyStatusLabel(value: string | null | undefined): string {
  const normalized = normalizeJourneyStatus(value);
  if (normalized) {
    return JOURNEY_STATUS_LABELS[normalized];
  }

  const raw = coerceStatusText(value);
  if (!raw) return "Sem status da jornada";
  return humanizeStatus(raw);
}

export function formatLegacyOperationalStatus(value: string | null | undefined): string {
  const raw = coerceStatusText(value);
  if (!raw) return "Sem status operacional";
  return LEGACY_OPERATIONAL_STATUS_LABELS[raw] ?? humanizeStatus(raw);
}

export function getJourneyStatusBadgeVariant(value: string | null | undefined): JourneyBadgeVariant {
  const normalized = normalizeJourneyStatus(value);
  return normalized ? JOURNEY_STATUS_VARIANTS[normalized] : "secondary";
}

export function isOfficialJourneyStatusVisible(source?: JourneyStatusSource | null): boolean {
  return normalizeJourneyStatus(resolveOfficialJourneyStatus(source)) !== null;
}
