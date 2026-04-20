// src/services/api.ts
// Centraliza todas as chamadas HTTP do frontend (login, verify, users, settings, etc.)

import {
  JOURNEY_STATUS_LABELS as SHARED_JOURNEY_STATUS_LABELS,
  JOURNEY_STATUS_SEQUENCE,
  coerceStatusText,
  resolveOfficialJourneyStatus,
  type JourneyStatus as SharedJourneyStatus,
} from "@/components/status/journey-status";

/**
 * Descobre o melhor BASE URL para a API.
 * Preferencia:
 * 1) VITE_API_BASE_URL (ex.: "/api")
 * 2) Fallback por host publicado (frontend Railway separado do backend)
 * 3) Fallback padrao "/api"
 */
function resolveApiBase(): string {
  const envBase = import.meta.env?.VITE_API_BASE_URL as string | undefined;
  if (envBase && envBase.trim().length > 0) {
    return envBase.trim().replace(/\/+$/, "");
  }

  // Publicacao atual usa dois servicos Railway:
  // - Frontend: home-production-7dda.up.railway.app
  // - Backend API: friendly-insight-production.up.railway.app
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === "home-production-7dda.up.railway.app") {
      return "https://friendly-insight-production.up.railway.app/api";
    }
  }

  return "/api";
}

const API_BASE_URL = resolveApiBase();
export const AUTH_UNAUTHORIZED_EVENT = "auth:unauthorized";

function normalizeStoredToken(raw: string | null): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;

  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string") {
        value = parsed.trim();
      }
    } catch {
      // Mantem valor original quando nao for JSON valido.
    }
  }

  const lower = value.toLowerCase();
  if (!value || lower === "null" || lower === "undefined") {
    return null;
  }

  return value;
}

export type LoginResponse = {
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: string | number;
    username: string;
    email: string;
    name: string;
    role: string;
    status?: string;
    first_access?: boolean;
    must_change_password?: boolean;
    professional_id?: string | number | null;
    can_view_all_professionals?: boolean;
    allow_professional_view_others?: boolean;
    permissions?: string[];
    created_at?: string;
    updated_at?: string;
  };
};

export type User = {
  id: string | number;
  username: string;
  email: string;
  name: string;
  role: string;
  status?: string;
  first_access?: boolean;
  must_change_password?: boolean;
  professional_id?: string | number | null;
  professional_label?: string | null;
  can_view_all_professionals?: boolean;
  allow_professional_view_others?: boolean;
  permissions?: string[];
  created_at?: string;
  updated_at?: string;
};

export type ManagedUser = User & {
  status: string;
  created_at: string;
};

export type LinkableProfessionalUser = {
  id: string;
  name: string;
  email?: string | null;
  username?: string | null;
  status?: string | null;
  professional_id?: string | null;
};

export type PatientDTO = {
  id: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  dataNascimento?: string | null;
  status?: string | null;
  status_jornada?: string | null;
  statusJornada?: string | null;
  journey_status?: string | null;
  journeyStatus?: string | null;
};

export type PatientCreatePayload = {
  name: string;
  date_of_birth?: string | null;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status_jornada?: string | null;
  status?: string | null;
  source_pre_appointment_id?: string | null;
  link_existing_patient_id?: string | null;
};

export type PatientUpdatePayload = {
  name?: string | null;
  date_of_birth?: string | null;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status_jornada?: string | null;
};

export type PatientDetailDTO = PatientDTO & {
  rg?: string | null;
  mobile?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  profession?: string | null;
  marital_status?: string | null;
  education?: string | null;
  insurance_plan?: string | null;
  insurance_number?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PatientPreAppointmentConversionInfo = {
  pre_appointment_id?: string | null;
  converted_to_patient_id?: string | null;
  linked_existing_patient?: boolean;
};

export type PatientCreateResponse = {
  success: boolean;
  paciente?: PatientDTO;
  existing_patient_id?: string;
  linked_existing_patient?: boolean;
  source_pre_appointment_id?: string;
  pre_appointment_conversion?: PatientPreAppointmentConversionInfo;
  message?: string;
};

export type PreAppointmentImportRecord = {
  id: string;
  name: string;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  responsible_name?: string | null;
  referred_by?: string | null;
  how_heard?: string | null;
  cid?: string | null;
  notes?: string | null;
  status?: string | null;
  preferred_date?: string | null;
  created_at?: string | null;
  converted_to_patient_id?: string | null;
  converted_at?: string | null;
};

export type PreAppointmentTriageStatus =
  | "pending"
  | "in_review"
  | "selected_for_pre_cadastro"
  | "converted"
  | "not_eligible"
  | "archived";

export type PreAppointmentSearchFilters = {
  q?: string | null;
  child_name?: string | null;
  responsible_name?: string | null;
  phone?: string | null;
  cpf?: string | null;
  date?: string | null;
  limit?: number | null;
};

export type PreAppointmentQueueFilters = {
  q?: string | null;
  child_name?: string | null;
  responsible_name?: string | null;
  phone?: string | null;
  cpf?: string | null;
  date?: string | null;
  service_type?: string | null;
  cid?: string | null;
  referred_by?: string | null;
  status?: PreAppointmentTriageStatus | string | null;
  priority?: "prioritario" | "normal" | string | null;
  sort?: "oldest" | "newest" | "priority" | "name" | string | null;
  limit?: number | null;
  offset?: number | null;
};

export type PreAppointmentQueueSummary = {
  pending: number;
  in_review: number;
  converted: number;
  not_eligible: number;
};

export type PreAppointmentQueueRecord = PreAppointmentImportRecord & {
  status_operacional?: PreAppointmentTriageStatus | string | null;
  status_normalized?: PreAppointmentTriageStatus | string | null;
  status_raw?: string | null;
  urgency?: string | null;
  service_type?: string | null;
  requested_services?: string | null;
  observacao_resumida?: string | null;
  converted_by?: string | null;
};

export type PreAppointmentQueueResponse = {
  items: PreAppointmentQueueRecord[];
  total: number;
  limit: number;
  offset: number;
  sort: "oldest" | "newest" | "priority" | "name";
  summary: PreAppointmentQueueSummary;
};

export type PreAppointmentTriageUpdatePayload = {
  status?: PreAppointmentTriageStatus | string | null;
  note?: string | null;
  append_note?: boolean;
};

export type ReceptionSearchScenario = "found" | "possible_duplicate" | "not_found";

export type ReceptionSearchMatch = {
  patient_id: string;
  child_name: string;
  responsible_name?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  status_jornada?: string | null;
  entry_date?: string | null;
  recent_note?: string | null;
  match_reasons: string[];
};

export type ReceptionSearchFilters = {
  cpf?: string | null;
  phone?: string | null;
  name?: string | null;
  date_of_birth?: string | null;
};

export type ReceptionSearchResponse = {
  scenario: ReceptionSearchScenario;
  found: boolean;
  exact_matches: ReceptionSearchMatch[];
  similar_matches: ReceptionSearchMatch[];
  message?: string;
};

export type SocialTriageStatus =
  | "novo"
  | "sem_contato"
  | "tentativa_contato"
  | "aguardando_retorno"
  | "em_atendimento_social"
  | "pre_cadastro_em_andamento"
  | "aguardando_documentos"
  | "apto_para_agendamento"
  | "entrevista_agendada"
  | "pausa_operacional";

export type SocialTriagePriority = "normal" | "prioritario" | "urgente";

export type SocialTriageQueueFilters = {
  q?: string | null;
  child_name?: string | null;
  responsible_name?: string | null;
  phone?: string | null;
  neighborhood?: string | null;
  triagem_responsavel?: string | null;
  triagem_status?: SocialTriageStatus | string | null;
  triagem_prioridade?: SocialTriagePriority | string | null;
  has_report?: boolean | null;
  service_type?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  interview_scheduled?: boolean | null;
  sort?: "oldest" | "newest" | "priority" | "name" | "next_action" | string | null;
  limit?: number | null;
  offset?: number | null;
};

export type SocialTriageQueueSummary = {
  total_em_fila: number;
  novos_casos: number;
  sem_contato: number;
  em_andamento: number;
  apto_para_agendamento: number;
  entrevista_agendada: number;
};

export type SocialTriageQueueItem = {
  patient_id: string;
  child_name: string;
  date_of_birth?: string | null;
  age_years?: number | null;
  responsible_name?: string | null;
  main_phone?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  entry_channel?: string | null;
  entry_created_at?: string | null;
  service_interest?: string | null;
  requested_service_ids?: string[];
  has_report?: boolean;
  cid?: string | null;
  status_jornada?: string | null;
  triagem_status?: SocialTriageStatus | string | null;
  triagem_prioridade?: SocialTriagePriority | string | null;
  triagem_responsavel_id?: string | null;
  triagem_responsavel_nome?: string | null;
  triagem_last_contact_at?: string | null;
  triagem_next_action_at?: string | null;
  triagem_notes_summary?: string | null;
  entrevista_agendada?: boolean;
  linked_appointment_id?: string | null;
  linked_appointment_at?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  appointment_status?: string | null;
  appointment_service_name?: string | null;
  next_suggested_action?: string | null;
};

export type SocialTriageQueueResponse = {
  items: SocialTriageQueueItem[];
  total: number;
  limit: number;
  offset: number;
  sort: "oldest" | "newest" | "priority" | "name" | "next_action";
  summary: SocialTriageQueueSummary;
};

export type SocialTriageHistoryItem = {
  id: string;
  action_type?: string | null;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  acted_by?: string | null;
  acted_by_name?: string | null;
  acted_at?: string | null;
};

export type SocialTriageHistoryResponse = {
  patient_id: string;
  total: number;
  items: SocialTriageHistoryItem[];
};

export type SocialTriagePatchPayload = {
  action_type?: string | null;
  note?: string | null;
  triagem_status?: SocialTriageStatus | string | null;
  triagem_prioridade?: SocialTriagePriority | string | null;
  triagem_responsavel_id?: string | null;
  triagem_responsavel_nome?: string | null;
  triagem_last_contact_at?: string | null;
  triagem_next_action_at?: string | null;
  triagem_notes_summary?: string | null;
  entrevista_agendada_flag?: boolean | null;
  linked_appointment_id?: string | null;
  linked_appointment_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type VagaEligiblePatientFilters = {
  q?: string | null;
  child_name?: string | null;
  responsible_name?: string | null;
  phone?: string | null;
  cpf?: string | null;
  status_jornada?: string | null;
  specialty?: string | null;
  cid?: string | null;
  age_min?: number | null;
  age_max?: number | null;
  ready_for_vaga?: boolean | null;
  has_social_interview?: boolean | null;
  has_completed_evaluation?: boolean | null;
  sent_to_vaga?: boolean | null;
  limit?: number | null;
  offset?: number | null;
};

export type VagaEligiblePatientRecord = {
  id: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  celular?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  status?: string | null;
  status_jornada?: string | null;
  responsible_name?: string | null;
  contato_principal?: string | null;
  cid?: string | null;
  necessidade_principal?: string | null;
  completed_evaluation_count?: number;
  has_completed_evaluation?: boolean;
  has_consolidation_ready?: boolean;
  has_social_interview?: boolean;
  latest_social_interview_date?: string | null;
  sent_to_vaga_at?: string | null;
  ready_for_vaga?: boolean;
  eligibility_indicator?: string | null;
  observacao_resumida?: string | null;
};

export type VagaEligiblePatientListResponse = {
  items: VagaEligiblePatientRecord[];
  total: number;
  limit: number;
  offset: number;
};

type PatientRecordLike = {
  id?: string | number | null;
  patient_id?: string | number | null;
  paciente_id?: string | number | null;
  nome?: string | null;
  name?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  phone?: string | null;
  email?: string | null;
  dataNascimento?: string | null;
  data_nascimento?: string | null;
  date_of_birth?: string | null;
  status?: string | null;
  status_jornada?: string | null;
  statusJornada?: string | null;
  journey_status?: string | null;
  journeyStatus?: string | null;
  rg?: string | null;
  mobile?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  profession?: string | null;
  marital_status?: string | null;
  education?: string | null;
  insurance_plan?: string | null;
  insurance_number?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PreAppointmentRecordLike = {
  id?: string | number | null;
  name?: string | null;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  responsible_name?: string | null;
  referred_by?: string | null;
  how_heard?: string | null;
  cid?: string | null;
  notes?: string | null;
  status?: string | null;
  preferred_date?: string | null;
  created_at?: string | null;
  converted_to_patient_id?: string | number | null;
  converted_at?: string | null;
};

type PreAppointmentQueueRecordLike = PreAppointmentRecordLike & {
  status_operacional?: string | null;
  status_normalized?: string | null;
  status_raw?: string | null;
  urgency?: string | null;
  service_type?: string | null;
  requested_services?: string | null;
  observacao_resumida?: string | null;
  converted_by?: string | number | null;
};

type ReceptionSearchMatchLike = {
  patient_id?: string | number | null;
  child_name?: string | null;
  responsible_name?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  status_jornada?: string | null;
  statusJornada?: string | null;
  journey_status?: string | null;
  journeyStatus?: string | null;
  entry_date?: string | null;
  recent_note?: string | null;
  match_reasons?: unknown;
};

type SocialTriageQueueItemLike = {
  patient_id?: string | number | null;
  child_name?: string | null;
  date_of_birth?: string | null;
  age_years?: number | string | null;
  responsible_name?: string | null;
  main_phone?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  entry_channel?: string | null;
  entry_created_at?: string | null;
  service_interest?: string | null;
  requested_service_ids?: unknown;
  has_report?: boolean | string | number | null;
  cid?: string | null;
  status_jornada?: string | null;
  triagem_status?: string | null;
  triagem_prioridade?: string | null;
  triagem_responsavel_id?: string | number | null;
  triagem_responsavel_nome?: string | null;
  triagem_last_contact_at?: string | null;
  triagem_next_action_at?: string | null;
  triagem_notes_summary?: string | null;
  entrevista_agendada?: boolean | string | number | null;
  linked_appointment_id?: string | number | null;
  linked_appointment_at?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  appointment_status?: string | null;
  appointment_service_name?: string | null;
  next_suggested_action?: string | null;
};

type SocialTriageHistoryItemLike = {
  id?: string | number | null;
  action_type?: string | null;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  note?: string | null;
  metadata?: unknown;
  acted_by?: string | number | null;
  acted_by_name?: string | null;
  acted_at?: string | null;
};

type VagaEligiblePatientRecordLike = {
  id?: string | number | null;
  nome?: string | null;
  name?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  phone?: string | null;
  celular?: string | null;
  mobile?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  date_of_birth?: string | null;
  status?: string | null;
  status_jornada?: string | null;
  responsible_name?: string | null;
  responsavel?: string | null;
  contato_principal?: string | null;
  cid?: string | null;
  necessidade_principal?: string | null;
  completed_evaluation_count?: number | string | null;
  has_completed_evaluation?: boolean | string | number | null;
  has_consolidation_ready?: boolean | string | number | null;
  has_social_interview?: boolean | string | number | null;
  latest_social_interview_date?: string | null;
  sent_to_vaga_at?: string | null;
  ready_for_vaga?: boolean | string | number | null;
  eligibility_indicator?: string | null;
  observacao_resumida?: string | null;
};

function normalizePatientRecord(raw: unknown): PatientDTO | null {
  if (!raw || typeof raw !== "object") return null;

  const payload = raw as PatientRecordLike;
  const idCandidate = payload.id ?? payload.patient_id ?? payload.paciente_id;
  if (idCandidate === null || idCandidate === undefined) return null;

  const officialJourneyStatus = resolveOfficialJourneyStatus(payload);
  const legacyStatus = coerceStatusText(payload.status);

  return {
    id: String(idCandidate),
    nome: coerceStatusText(payload.nome) ?? coerceStatusText(payload.name) ?? "",
    cpf: coerceStatusText(payload.cpf),
    telefone: coerceStatusText(payload.telefone) ?? coerceStatusText(payload.phone),
    email: coerceStatusText(payload.email),
    dataNascimento:
      coerceStatusText(payload.dataNascimento) ??
      coerceStatusText(payload.data_nascimento) ??
      coerceStatusText(payload.date_of_birth),
    status: legacyStatus,
    status_jornada: officialJourneyStatus,
    statusJornada: officialJourneyStatus,
    journey_status: officialJourneyStatus,
    journeyStatus: officialJourneyStatus,
  };
}

function normalizePatientList(raw: unknown): PatientDTO[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).pacientes)
      ? ((raw as Record<string, unknown>).pacientes as unknown[])
      : [];

  return list
    .map((item) => normalizePatientRecord(item))
    .filter((item): item is PatientDTO => item !== null);
}

function normalizePatientDetailRecord(raw: unknown): PatientDetailDTO | null {
  const base = normalizePatientRecord(raw);
  if (!base || !raw || typeof raw !== "object") return base;

  const payload = raw as PatientRecordLike;
  return {
    ...base,
    rg: coerceStatusText(payload.rg),
    mobile: coerceStatusText(payload.mobile),
    address: coerceStatusText(payload.address),
    number: coerceStatusText(payload.number),
    complement: coerceStatusText(payload.complement),
    neighborhood: coerceStatusText(payload.neighborhood),
    city: coerceStatusText(payload.city),
    state: coerceStatusText(payload.state),
    zip_code: coerceStatusText(payload.zip_code),
    profession: coerceStatusText(payload.profession),
    marital_status: coerceStatusText(payload.marital_status),
    education: coerceStatusText(payload.education),
    insurance_plan: coerceStatusText(payload.insurance_plan),
    insurance_number: coerceStatusText(payload.insurance_number),
    notes: coerceStatusText(payload.notes),
    created_at: coerceStatusText(payload.created_at),
    updated_at: coerceStatusText(payload.updated_at),
  };
}

function normalizePreAppointmentRecord(raw: unknown): PreAppointmentImportRecord | null {
  if (!raw || typeof raw !== "object") return null;

  const payload = raw as PreAppointmentRecordLike;
  if (payload.id === null || payload.id === undefined) return null;

  const convertedToPatientId =
    payload.converted_to_patient_id === null || payload.converted_to_patient_id === undefined
      ? null
      : String(payload.converted_to_patient_id);

  return {
    id: String(payload.id),
    name: coerceStatusText(payload.name) ?? "",
    cpf: coerceStatusText(payload.cpf),
    phone: coerceStatusText(payload.phone),
    email: coerceStatusText(payload.email),
    date_of_birth: coerceStatusText(payload.date_of_birth),
    responsible_name: coerceStatusText(payload.responsible_name),
    referred_by: coerceStatusText(payload.referred_by),
    how_heard: coerceStatusText(payload.how_heard),
    cid: coerceStatusText(payload.cid),
    notes: coerceStatusText(payload.notes),
    status: coerceStatusText(payload.status),
    preferred_date: coerceStatusText(payload.preferred_date),
    created_at: coerceStatusText(payload.created_at),
    converted_to_patient_id: convertedToPatientId,
    converted_at: coerceStatusText(payload.converted_at),
  };
}

function normalizePreAppointmentQueueRecord(raw: unknown): PreAppointmentQueueRecord | null {
  const base = normalizePreAppointmentRecord(raw);
  if (!base) return null;

  const payload = raw as PreAppointmentQueueRecordLike;

  return {
    ...base,
    status_operacional: coerceStatusText(payload.status_operacional),
    status_normalized: coerceStatusText(payload.status_normalized),
    status_raw: coerceStatusText(payload.status_raw),
    urgency: coerceStatusText(payload.urgency),
    service_type: coerceStatusText(payload.service_type),
    requested_services: coerceStatusText(payload.requested_services),
    observacao_resumida: coerceStatusText(payload.observacao_resumida),
    converted_by:
      payload.converted_by === null || payload.converted_by === undefined
        ? null
        : String(payload.converted_by),
  };
}

function normalizeReceptionSearchMatch(raw: unknown): ReceptionSearchMatch | null {
  if (!raw || typeof raw !== "object") return null;

  const payload = raw as ReceptionSearchMatchLike;
  if (payload.patient_id === undefined || payload.patient_id === null) {
    return null;
  }

  const reasons = Array.isArray(payload.match_reasons)
    ? payload.match_reasons
        .map((value) => coerceStatusText(value))
        .filter((value): value is string => Boolean(value))
    : [];

  return {
    patient_id: String(payload.patient_id),
    child_name: coerceStatusText(payload.child_name) ?? "",
    responsible_name: coerceStatusText(payload.responsible_name),
    phone: coerceStatusText(payload.phone),
    date_of_birth: coerceStatusText(payload.date_of_birth),
    status_jornada: resolveOfficialJourneyStatus(payload),
    entry_date: coerceStatusText(payload.entry_date),
    recent_note: coerceStatusText(payload.recent_note),
    match_reasons: reasons,
  };
}

function normalizeSocialTriageQueueItem(raw: unknown): SocialTriageQueueItem | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as SocialTriageQueueItemLike;
  if (payload.patient_id === null || payload.patient_id === undefined) return null;

  const requestedServiceIds = Array.isArray(payload.requested_service_ids)
    ? payload.requested_service_ids
        .map((entry) => coerceStatusText(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];

  return {
    patient_id: String(payload.patient_id),
    child_name: coerceStatusText(payload.child_name) ?? "",
    date_of_birth: coerceStatusText(payload.date_of_birth),
    age_years:
      payload.age_years === null || payload.age_years === undefined
        ? null
        : toNumber(payload.age_years, 0),
    responsible_name: coerceStatusText(payload.responsible_name),
    main_phone: coerceStatusText(payload.main_phone),
    neighborhood: coerceStatusText(payload.neighborhood),
    city: coerceStatusText(payload.city),
    state: coerceStatusText(payload.state),
    entry_channel: coerceStatusText(payload.entry_channel),
    entry_created_at: coerceStatusText(payload.entry_created_at),
    service_interest: coerceStatusText(payload.service_interest),
    requested_service_ids: requestedServiceIds,
    has_report: toBoolean(payload.has_report),
    cid: coerceStatusText(payload.cid),
    status_jornada: resolveOfficialJourneyStatus(payload),
    triagem_status: coerceStatusText(payload.triagem_status),
    triagem_prioridade: coerceStatusText(payload.triagem_prioridade),
    triagem_responsavel_id:
      payload.triagem_responsavel_id === undefined || payload.triagem_responsavel_id === null
        ? null
        : String(payload.triagem_responsavel_id),
    triagem_responsavel_nome: coerceStatusText(payload.triagem_responsavel_nome),
    triagem_last_contact_at: coerceStatusText(payload.triagem_last_contact_at),
    triagem_next_action_at: coerceStatusText(payload.triagem_next_action_at),
    triagem_notes_summary: coerceStatusText(payload.triagem_notes_summary),
    entrevista_agendada: toBoolean(payload.entrevista_agendada),
    linked_appointment_id:
      payload.linked_appointment_id === undefined || payload.linked_appointment_id === null
        ? null
        : String(payload.linked_appointment_id),
    linked_appointment_at: coerceStatusText(payload.linked_appointment_at),
    appointment_date: coerceStatusText(payload.appointment_date),
    appointment_time: coerceStatusText(payload.appointment_time),
    appointment_status: coerceStatusText(payload.appointment_status),
    appointment_service_name: coerceStatusText(payload.appointment_service_name),
    next_suggested_action: coerceStatusText(payload.next_suggested_action),
  };
}

function normalizeSocialTriageHistoryItem(raw: unknown): SocialTriageHistoryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as SocialTriageHistoryItemLike;
  if (payload.id === undefined || payload.id === null) return null;

  const metadata =
    payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};

  return {
    id: String(payload.id),
    action_type: coerceStatusText(payload.action_type),
    field_name: coerceStatusText(payload.field_name),
    old_value: coerceStatusText(payload.old_value),
    new_value: coerceStatusText(payload.new_value),
    note: coerceStatusText(payload.note),
    metadata,
    acted_by:
      payload.acted_by === undefined || payload.acted_by === null
        ? null
        : String(payload.acted_by),
    acted_by_name: coerceStatusText(payload.acted_by_name),
    acted_at: coerceStatusText(payload.acted_at),
  };
}

function normalizePreAppointmentList(raw: unknown): PreAppointmentImportRecord[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizePreAppointmentRecord(item))
      .filter((item): item is PreAppointmentImportRecord => item !== null);
  }

  if (raw && typeof raw === "object") {
    const payload = raw as Record<string, unknown>;
    const list = Array.isArray(payload.preAppointments)
      ? payload.preAppointments
      : Array.isArray(payload.filaEspera)
        ? payload.filaEspera
      : Array.isArray(payload.items)
        ? payload.items
        : [];

    return list
      .map((item) => normalizePreAppointmentRecord(item))
      .filter((item): item is PreAppointmentImportRecord => item !== null);
  }

  return [];
}

function toBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "t", "sim", "yes", "y"].includes(normalized);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeVagaEligiblePatientRecord(raw: unknown): VagaEligiblePatientRecord | null {
  if (!raw || typeof raw !== "object") return null;

  const payload = raw as VagaEligiblePatientRecordLike;
  if (payload.id === null || payload.id === undefined) return null;

  return {
    id: String(payload.id),
    nome: coerceStatusText(payload.nome) ?? coerceStatusText(payload.name) ?? "",
    cpf: coerceStatusText(payload.cpf),
    telefone: coerceStatusText(payload.telefone) ?? coerceStatusText(payload.phone),
    celular: coerceStatusText(payload.celular) ?? coerceStatusText(payload.mobile),
    email: coerceStatusText(payload.email),
    data_nascimento:
      coerceStatusText(payload.data_nascimento) ?? coerceStatusText(payload.date_of_birth),
    status: coerceStatusText(payload.status),
    status_jornada: resolveOfficialJourneyStatus(payload),
    responsible_name:
      coerceStatusText(payload.responsible_name) ?? coerceStatusText(payload.responsavel),
    contato_principal: coerceStatusText(payload.contato_principal),
    cid: coerceStatusText(payload.cid),
    necessidade_principal: coerceStatusText(payload.necessidade_principal),
    completed_evaluation_count: toNumber(payload.completed_evaluation_count, 0),
    has_completed_evaluation: toBoolean(payload.has_completed_evaluation),
    has_consolidation_ready: toBoolean(payload.has_consolidation_ready),
    has_social_interview: toBoolean(payload.has_social_interview),
    latest_social_interview_date: coerceStatusText(payload.latest_social_interview_date),
    sent_to_vaga_at: coerceStatusText(payload.sent_to_vaga_at),
    ready_for_vaga: toBoolean(payload.ready_for_vaga),
    eligibility_indicator: coerceStatusText(payload.eligibility_indicator),
    observacao_resumida: coerceStatusText(payload.observacao_resumida),
  };
}

export type SocialInterviewDTO = {
  id: string;
  patient_id?: string | null;
  assistente_social?: string | null;
  assistente_social_id?: string | null;
  interview_date?: string | null;
  interview_time?: string | null;
  parecer_social?: string | null;
  resultado_terapeutas?: string | null;
  data_resultado_terapeutas?: string | null;
  is_draft?: boolean;
  payload?: Record<string, unknown> | null;
  created_by?: string | number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SocialInterviewStatusTransition = {
  attempted?: boolean;
  changed?: boolean;
  previous_status?: string | null;
  new_status?: string | null;
  regression_prevented?: boolean;
  reason?: string | null;
};

export type SocialInterviewMutationResponse = {
  success: boolean;
  message?: string;
  interview?: SocialInterviewDTO;
  status_transition?: SocialInterviewStatusTransition | null;
};

export type EvaluationTechnicalStatus =
  | "agendada"
  | "em_andamento"
  | "concluida"
  | "cancelada";

export type EvaluationDTO = {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  status_jornada?: string | null;
  professional_id?: string | null;
  professional_name?: string | null;
  type: string;
  start_date: string;
  end_date?: string | null;
  status: EvaluationTechnicalStatus;
  status_db?: string | null;
  result?: string | null;
  report?: string | null;
  notes?: string | null;
  is_stage_consolidation?: boolean;
  checklist_ready_for_vaga?: boolean;
  sent_to_vaga_at?: string | null;
  devolutiva_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EvaluationListFilters = {
  patient_id?: string | null;
  professional_id?: string | null;
  status?: EvaluationTechnicalStatus | string | null;
  type?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  include_consolidation?: boolean | null;
};

export type EvaluationUpsertPayload = {
  patient_id: string;
  professional_id?: string | null;
  type: string;
  start_date: string;
  end_date?: string | null;
  status?: EvaluationTechnicalStatus | string | null;
  result?: string | null;
  report?: string | null;
  notes?: string | null;
  is_stage_consolidation?: boolean;
  checklist_ready_for_vaga?: boolean;
  devolutiva_date?: string | null;
};

export type EvaluationMutationResponse = {
  success: boolean;
  message?: string;
  evaluation?: EvaluationDTO;
  status_transition?: SocialInterviewStatusTransition | null;
};

export type VagaDecisionValue = "aprovado" | "encaminhado";

export type VagaDecisionPayload = {
  assistido_id: string;
  decisao: VagaDecisionValue;
  justificativa: string;
};

export type VagaDecisionResponse = {
  success: boolean;
  decisionId?: string | number;
  assistido_id?: string;
  decisao?: VagaDecisionValue | string;
  status_jornada_atual?: string | null;
  message?: string;
};

export const JOURNEY_STATUS_FLOW = JOURNEY_STATUS_SEQUENCE;

export type JourneyStatus = SharedJourneyStatus;

export const JOURNEY_STATUS_LABELS: Record<JourneyStatus, string> =
  SHARED_JOURNEY_STATUS_LABELS;

export type DashboardJourneySummaryItem = {
  status: JourneyStatus;
  label: string;
  total: number;
};

export type DashboardStats = {
  totalAssistidos: number;
  unknownStatusCount: number;
  journeyTotals: {
    em_triagem: number;
    em_avaliacao_e_vaga: number;
    decisao_vaga: number;
    em_acompanhamento: number;
    encerrados: number;
    em_fluxo_institucional: number;
  };
  journeyStatusSummary: DashboardJourneySummaryItem[];
  updatedAt?: string | null;
};

export type DashboardStatsResponse = {
  success: boolean;
  stats?: DashboardStats | null;
  message?: string;
};

export type ApiRequestError = Error & {
  status?: number;
  existing_patient_id?: string | null;
  requires_link_confirmation?: boolean;
  source_pre_appointment_id?: string | null;
  payload?: Record<string, unknown>;
};

export type RegistrationMode = "ADMIN_ONLY" | "PUBLIC_SIGNUP" | "INVITE_ONLY";
export type PublicSignupDefaultStatus = "pendente" | "ativo";
export type LinkPolicy =
  | "MANUAL_LINK_ADMIN"
  | "AUTO_LINK_BY_EMAIL"
  | "SELF_CLAIM_WITH_APPROVAL";

export type SettingsPayload = {
  instituicao_nome: string;
  instituicao_email: string;
  instituicao_telefone: string;
  instituicao_endereco: string;
  instituicao_cnpj: string;
  instituicao_cep: string;
  instituicao_cidade: string;
  instituicao_estado: string;
  instituicao_logo_base64?: string | null;
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  weekly_reports: boolean;
  two_factor_auth: boolean;
  password_expiry_days: number;
  max_login_attempts: number;
  session_timeout: number;
  backup_frequency: "daily" | "weekly" | "monthly" | string;
  data_retention_days: number;
  auto_updates: boolean;
  debug_mode: boolean;
  registration_mode: RegistrationMode;
  public_signup_default_status: PublicSignupDefaultStatus;
  link_policy: LinkPolicy;
  allow_create_user_from_professional: boolean;
  block_duplicate_email: boolean;
  allow_public_registration: boolean;
  allow_professional_view_others: boolean;
  business_hours: BusinessHours;
  professionals_config: ProfessionalsConfig;
};

export type OperatingDays = {
  seg: boolean;
  ter: boolean;
  qua: boolean;
  qui: boolean;
  sex: boolean;
  sab: boolean;
  dom: boolean;
};

export type BusinessHours = {
  opening_time: string;
  closing_time: string;
  lunch_break_minutes: number;
  operating_days: OperatingDays;
};

export type ProfessionalsConfig = {
  allowed_contract_types: string[];
  suggested_weekly_hours: number[];
};

export type WeekScale = {
  seg: boolean;
  ter: boolean;
  qua: boolean;
  qui: boolean;
  sex: boolean;
};

export type ProfessionalRole = {
  id: number;
  nome: string;
  ativo: boolean;
  show_in_pre_appointment: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ConvenioStatus = "ativo" | "inativo";

export type Convenio = {
  id: string;
  nome: string;
  numero_projeto?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  status: ConvenioStatus;
  quantidade_atendidos: number;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ConvenioPayload = {
  nome: string;
  numero_projeto?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  status: ConvenioStatus;
  quantidade_atendidos: number;
};

export type ProfessionalPayload = {
  name: string;
  email: string;
  username: string;
  phone?: string;
  role?: string;
  crp?: string;
  specialty?: string;
  funcao?: string;
  role_id?: number | null;
  horas_semanais?: number | null;
  data_nascimento?: string | null;
  tipo_contrato: string;
  escala_semanal?: WeekScale;
  status?: "ATIVO" | "INATIVO";
};

type SettingsResponse = {
  success: boolean;
  settings?: SettingsPayload;
  data?: SettingsPayload;
  message?: string;
};

export type ProfessionalSummary = {
  id: string;
  user_name?: string | null;
  role_nome?: string | null;
  funcao?: string | null;
  status?: string;
};

export type ProfessionalMeResponse = {
  success: boolean;
  professional_id: string | null;
  can_view_all_professionals: boolean;
  allow_professional_view_others: boolean;
  access_mode?: AgendaReadAccessMode | null;
  compatibility_mode?: boolean;
  compatibility_notice?: string | null;
  primary_scope_required?: string | null;
  legacy_scope_required?: string | null;
  legacy_scope_fallback_enabled?: boolean;
  legacy_scope_active?: boolean;
  legacy_scope_reason?: AgendaLegacyScopeReason | null;
  legacy_scope_deprecation_phase?: string | null;
  legacy_scope_requires_migration?: boolean;
  legacy_scope_removal_ready?: boolean;
  institutional_taxonomy_version?: string | null;
  coherence_matrix_version?: string | null;
  write_validation_ready?: boolean;
  write_validation_mode?: AgendaWriteValidationMode | null;
  write_validation_effective_mode?: AgendaWriteValidationMode | null;
  write_validation_rollout_phase?: string | null;
  write_validation_hard_block_enabled?: boolean;
  write_validation_legacy_mode_alias?: AgendaWriteValidationMode | null;
  write_validation_supported_levels?: AgendaWriteValidationLevel[] | null;
  write_validation_blocking_active?: boolean;
  write_validation_enforcement_ready?: boolean;
  professional: ProfessionalSummary | null;
  message?: string;
};

export type AgendaReadAccessMode =
  | "agenda_scope"
  | "legacy_profissionais_scope"
  | "admin_role_compat"
  | string;

export type AgendaLegacyScopeReason =
  | "legacy_profissionais_scope_permission"
  | "admin_role_compatibility"
  | string;

export type AgendaWriteValidationMode =
  | "pre_enforcement"
  | "observe_only"
  | "soft_block"
  | "hard_block"
  | string;

export type AgendaWriteValidationLevel = "info" | "warning" | "block_ready" | string;

export type AgendaAppointmentStatus =
  | "scheduled"
  | "agendado"
  | "confirmed"
  | "confirmado"
  | "completed"
  | "concluido"
  | "cancelled"
  | "cancelado"
  | string;

export type AgendaInstitutionalEventType =
  | "entrevista_social"
  | "avaliacao_multidisciplinar"
  | "analise_vaga"
  | "devolutiva_institucional"
  | "matricula_institucional"
  | "acompanhamento_continuado"
  | "devolutiva_matricula"
  | string;

export type AgendaInstitutionalEventTypeSource =
  | "explicit_event_type"
  | "journey_status_rule"
  | "service_name_catalog"
  | string;

export type AgendaAppointmentItem = {
  id: string;
  appointment_id?: string | number | null;
  professional_id?: string | number | null;
  professional_name?: string | null;
  professional_role?: string | null;
  professional_specialty?: string | null;
  appointment_date: string;
  appointment_time: string;
  appointment_status?: AgendaAppointmentStatus | null;
  status?: AgendaAppointmentStatus | null;
  notes?: string | null;
  patient_id?: string | number | null;
  patient_name?: string | null;
  status_jornada?: string | null;
  journey_status?: string | null;
  service_id?: string | number | null;
  service_name?: string | null;
  event_type_institutional?: AgendaInstitutionalEventType | null;
  event_type_institutional_source?: AgendaInstitutionalEventTypeSource | null;
  journey_consistency_status?: "ok" | "warning" | "unknown" | string | null;
  journey_consistency_code?: string | null;
  journey_consistency_message?: string | null;
  journey_consistency_expected_statuses?: string[] | null;
  write_validation_ready?: boolean;
  write_validation_mode?: AgendaWriteValidationMode | null;
  write_validation_effective_mode?: AgendaWriteValidationMode | null;
  write_validation_rollout_phase?: string | null;
  write_validation_hard_block_enabled?: boolean;
  write_validation_legacy_mode_alias?: AgendaWriteValidationMode | null;
  write_validation_level?: AgendaWriteValidationLevel | null;
  write_validation_action?: string | null;
  write_validation_code?: string | null;
  write_validation_message?: string | null;
  write_validation_supported_levels?: AgendaWriteValidationLevel[] | null;
  write_validation_would_block?: boolean;
  write_validation_blocking_active?: boolean;
  write_validation_enforcement_ready?: boolean;
  write_validation_should_warn?: boolean;
  write_validation_should_block?: boolean;
  sector_responsible?: string | null;
  responsible_name?: string | null;
};

export type AgendaWriteValidationSummary = {
  mode?: AgendaWriteValidationMode | null;
  effective_mode?: AgendaWriteValidationMode | null;
  rollout_phase?: string | null;
  hard_block_enabled?: boolean;
  legacy_mode_alias?: AgendaWriteValidationMode | null;
  total?: number;
  info_count?: number;
  warning_count?: number;
  block_ready_count?: number;
  would_block_count?: number;
  blocking_count?: number;
  blocking_active?: boolean;
  enforcement_ready?: boolean;
};

export type AgendaWriteValidationPayload = {
  mode?: AgendaWriteValidationMode | null;
  effective_mode?: AgendaWriteValidationMode | null;
  rollout_phase?: string | null;
  hard_block_enabled?: boolean;
  legacy_mode_alias?: AgendaWriteValidationMode | null;
  level?: AgendaWriteValidationLevel | null;
  action?: string | null;
  reason_code?: string | null;
  message?: string | null;
  supported_levels?: AgendaWriteValidationLevel[] | null;
  should_warn?: boolean;
  should_block?: boolean;
  would_block_when_enforced?: boolean;
  blocking_active?: boolean;
  enforcement_ready?: boolean;
  taxonomy_version?: string | null;
  coherence_matrix_version?: string | null;
};

export type AgendaWriteValidationRequest = {
  patient_id?: string | number | null;
  service_id?: string | number | null;
  journey_status?: string | null;
  service_name?: string | null;
  explicit_event_type?: string | null;
  enforcement_mode?: AgendaWriteValidationMode | null;
};

export type AgendaWriteValidationResolvedContext = {
  professional_id?: string | null;
  professional_name?: string | null;
  appointment_id?: string | null;
  patient_id?: string | null;
  patient_name?: string | null;
  journey_status?: string | null;
  journey_status_source?: string | null;
  journey_status_found?: boolean | null;
  service_id?: string | null;
  service_name?: string | null;
  service_name_source?: string | null;
  service_found?: boolean | null;
  explicit_event_type?: string | null;
  requested_action?: string | null;
  current_status?: AgendaAppointmentStatus | null;
  target_status?: AgendaAppointmentStatus | null;
  guard_block_bypassed_for_cancellation?: boolean;
};

export type AgendaWriteValidationOverrideInfo = {
  requested_enforcement_mode?: AgendaWriteValidationMode | null;
  override_allowed?: boolean;
  override_ignored?: boolean;
  configured_mode?: AgendaWriteValidationMode | null;
  effective_mode?: AgendaWriteValidationMode | null;
};

export type AgendaWriteValidationResponse = {
  success: boolean;
  dry_run: boolean;
  endpoint?: string | null;
  blocked: boolean;
  can_proceed: boolean;
  code?: string | null;
  message?: string;
  validation?: AgendaWriteValidationPayload | null;
  resolved_context?: AgendaWriteValidationResolvedContext | null;
  override?: AgendaWriteValidationOverrideInfo | null;
  scope?: AgendaScopeContext | null;
  http_status?: number;
};

export type AgendaSlotConflictInfo = {
  appointment_id?: string | null;
  appointment_status?: AgendaAppointmentStatus | null;
};

export type AgendaCreateRequest = {
  patient_id: string | number;
  service_id: string | number;
  appointment_date: string;
  appointment_time: string;
  notes?: string | null;
  status?: AgendaAppointmentStatus | null;
  appointment_status?: AgendaAppointmentStatus | null;
  journey_status?: string | null;
  explicit_event_type?: string | null;
  enforcement_mode?: AgendaWriteValidationMode | null;
};

export type AgendaCreateStatusPolicy = {
  default_status?: AgendaAppointmentStatus | null;
  allow_confirmed_on_create?: boolean;
  allowed_statuses?: AgendaAppointmentStatus[] | null;
};

export type AgendaCreateResponse = {
  success: boolean;
  dry_run: boolean;
  endpoint?: string | null;
  persisted: boolean;
  blocked: boolean;
  can_proceed: boolean;
  code?: string | null;
  message?: string;
  validation?: AgendaWriteValidationPayload | null;
  resolved_context?: AgendaWriteValidationResolvedContext | null;
  override?: AgendaWriteValidationOverrideInfo | null;
  create_status_policy?: AgendaCreateStatusPolicy | null;
  scope?: AgendaScopeContext | null;
  appointment?: AgendaAppointmentItem | null;
  conflict?: AgendaSlotConflictInfo | null;
  http_status?: number;
};

export type AgendaStatusUpdateRequest = {
  action?: "confirm" | "cancel" | string | null;
  status?: AgendaAppointmentStatus | null;
  appointment_status?: AgendaAppointmentStatus | null;
  journey_status?: string | null;
  explicit_event_type?: string | null;
  enforcement_mode?: AgendaWriteValidationMode | null;
};

export type AgendaStatusUpdatePolicy = {
  allowed_actions?: string[] | null;
  allowed_target_statuses?: AgendaAppointmentStatus[] | null;
  immutable_statuses?: AgendaAppointmentStatus[] | null;
  cancellation_guard_bypass_controlled?: boolean;
};

export type AgendaStatusUpdateResponse = {
  success: boolean;
  dry_run: boolean;
  endpoint?: string | null;
  persisted: boolean;
  blocked: boolean;
  can_proceed: boolean;
  code?: string | null;
  message?: string;
  validation?: AgendaWriteValidationPayload | null;
  resolved_context?: AgendaWriteValidationResolvedContext | null;
  override?: AgendaWriteValidationOverrideInfo | null;
  status_update_policy?: AgendaStatusUpdatePolicy | null;
  scope?: AgendaScopeContext | null;
  appointment?: AgendaAppointmentItem | null;
  http_status?: number;
};

export type AgendaScopeContext = {
  professional_id?: string | null;
  can_view_all_professionals?: boolean;
  allow_professional_view_others?: boolean;
  access_mode?: AgendaReadAccessMode | null;
  compatibility_mode?: boolean;
  compatibility_notice?: string | null;
  primary_scope_required?: string | null;
  legacy_scope_required?: string | null;
  legacy_scope_fallback_enabled?: boolean;
  legacy_scope_active?: boolean;
  legacy_scope_reason?: AgendaLegacyScopeReason | null;
  legacy_scope_deprecation_phase?: string | null;
  legacy_scope_requires_migration?: boolean;
  legacy_scope_removal_ready?: boolean;
  institutional_taxonomy_version?: string | null;
  coherence_matrix_version?: string | null;
  write_validation_ready?: boolean;
  write_validation_mode?: AgendaWriteValidationMode | null;
  write_validation_effective_mode?: AgendaWriteValidationMode | null;
  write_validation_rollout_phase?: string | null;
  write_validation_hard_block_enabled?: boolean;
  write_validation_legacy_mode_alias?: AgendaWriteValidationMode | null;
  write_validation_supported_levels?: AgendaWriteValidationLevel[] | null;
  write_validation_blocking_active?: boolean;
  write_validation_enforcement_ready?: boolean;
  write_validation_summary?: AgendaWriteValidationSummary | null;
};

export type ProfessionalAgendaResponse = {
  success: boolean;
  agenda: AgendaAppointmentItem[];
  scope?: AgendaScopeContext | null;
  message?: string;
};

export type AgendaRangeProfessional = {
  id: string;
  professional_name?: string | null;
  professional_role?: string | null;
  professional_specialty?: string | null;
};

export type AgendaRangeResponse = {
  success: boolean;
  appointments: AgendaAppointmentItem[];
  professionals: AgendaRangeProfessional[];
  date_from: string;
  date_to: string;
  scope?: AgendaScopeContext | null;
  message?: string;
};

export type ServiceOption = {
  id: string;
  name: string;
  active?: boolean;
};

export type ProfessionalLinkRequestStatus = "pending" | "approved" | "rejected";

export type ProfessionalLinkRequest = {
  id: string;
  user_id: string;
  professional_id: string;
  status: ProfessionalLinkRequestStatus;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  decided_at?: string | null;
  decided_by_user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  professional_name?: string | null;
  professional_email?: string | null;
  decided_by_name?: string | null;
};

type PublicSettingsResponse = {
  success: boolean;
  registration_mode?: RegistrationMode;
  allow_public_registration: boolean;
  instituicao_nome?: string | null;
  instituicao_logo_url?: string | null;
  instituicao_logo_base64?: string | null;
  message?: string;
};

class ApiService {
  private getStoredToken(): string | null {
    const fromLocal = normalizeStoredToken(localStorage.getItem("token"));
    if (fromLocal) return fromLocal;
    return normalizeStoredToken(sessionStorage.getItem("token"));
  }

  private clearStoredSession() {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");
  }

  private notifyUnauthorized() {
    this.clearStoredSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }
  }

  private extractPayloadMessage(payload: unknown): string | null {
    if (
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).message === "string"
    ) {
      const message = ((payload as Record<string, unknown>).message as string).trim();
      if (message.length > 0) return message;
    }

    return null;
  }

  private getAuthHeaders() {
    const token = this.getStoredToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async parseJsonSafe(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  private resolveHttpErrorMessage(
    response: Response,
    payload: unknown,
    fallbackMessage: string
  ): string {
    if (response.status === 401) {
      const payloadMessage = this.extractPayloadMessage(payload);
      if (payloadMessage) return payloadMessage;
      return "Token invalido ou expirado";
    }

    if (response.status === 403) {
      const payloadMessage = this.extractPayloadMessage(payload);
      if (payloadMessage) return payloadMessage;
      return "Acesso negado para esta operacao";
    }

    const payloadMessage = this.extractPayloadMessage(payload);
    if (payloadMessage) return payloadMessage;

    return fallbackMessage;
  }

  private async parseResponseOrThrow<T = unknown>(
    response: Response,
    fallbackMessage: string
  ): Promise<T> {
    const payload = await this.parseJsonSafe(response);
    if (!response.ok) {
      if (response.status === 401) {
        this.notifyUnauthorized();
      }
      throw new Error(this.resolveHttpErrorMessage(response, payload, fallbackMessage));
    }
    return payload as T;
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parseAgendaWriteValidationSummary(raw: unknown): AgendaWriteValidationSummary | null {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as Record<string, unknown>;
    return {
      mode:
        this.toNonEmptyString(payload.mode) as AgendaWriteValidationMode | null,
      effective_mode:
        this.toNonEmptyString(payload.effective_mode) as AgendaWriteValidationMode | null,
      rollout_phase: this.toNonEmptyString(payload.rollout_phase),
      hard_block_enabled: payload.hard_block_enabled === true,
      legacy_mode_alias:
        this.toNonEmptyString(payload.legacy_mode_alias) as AgendaWriteValidationMode | null,
      total: typeof payload.total === "number" ? payload.total : undefined,
      info_count: typeof payload.info_count === "number" ? payload.info_count : undefined,
      warning_count: typeof payload.warning_count === "number" ? payload.warning_count : undefined,
      block_ready_count:
        typeof payload.block_ready_count === "number" ? payload.block_ready_count : undefined,
      would_block_count:
        typeof payload.would_block_count === "number" ? payload.would_block_count : undefined,
      blocking_count:
        typeof payload.blocking_count === "number" ? payload.blocking_count : undefined,
      blocking_active: payload.blocking_active === true,
      enforcement_ready: payload.enforcement_ready === true,
    };
  }

  private parseAgendaScopeContext(raw: unknown): AgendaScopeContext | null {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as Record<string, unknown>;
    return {
      professional_id:
        payload.professional_id === null || payload.professional_id === undefined
          ? null
          : String(payload.professional_id),
      can_view_all_professionals: payload.can_view_all_professionals === true,
      allow_professional_view_others: payload.allow_professional_view_others === true,
      access_mode: this.toNonEmptyString(payload.access_mode) as AgendaReadAccessMode | null,
      compatibility_mode: payload.compatibility_mode === true,
      compatibility_notice: this.toNonEmptyString(payload.compatibility_notice),
      primary_scope_required: this.toNonEmptyString(payload.primary_scope_required),
      legacy_scope_required: this.toNonEmptyString(payload.legacy_scope_required),
      legacy_scope_fallback_enabled: payload.legacy_scope_fallback_enabled === true,
      legacy_scope_active: payload.legacy_scope_active === true,
      legacy_scope_reason:
        this.toNonEmptyString(payload.legacy_scope_reason) as AgendaLegacyScopeReason | null,
      legacy_scope_deprecation_phase: this.toNonEmptyString(payload.legacy_scope_deprecation_phase),
      legacy_scope_requires_migration: payload.legacy_scope_requires_migration === true,
      legacy_scope_removal_ready: payload.legacy_scope_removal_ready === true,
      institutional_taxonomy_version: this.toNonEmptyString(payload.institutional_taxonomy_version),
      coherence_matrix_version: this.toNonEmptyString(payload.coherence_matrix_version),
      write_validation_ready: payload.write_validation_ready === true,
      write_validation_mode:
        this.toNonEmptyString(payload.write_validation_mode) as AgendaWriteValidationMode | null,
      write_validation_effective_mode:
        this.toNonEmptyString(payload.write_validation_effective_mode) as
          | AgendaWriteValidationMode
          | null,
      write_validation_rollout_phase: this.toNonEmptyString(payload.write_validation_rollout_phase),
      write_validation_hard_block_enabled: payload.write_validation_hard_block_enabled === true,
      write_validation_legacy_mode_alias:
        this.toNonEmptyString(payload.write_validation_legacy_mode_alias) as
          | AgendaWriteValidationMode
          | null,
      write_validation_supported_levels: Array.isArray(payload.write_validation_supported_levels)
        ? (payload.write_validation_supported_levels
            .filter((level): level is string => typeof level === "string")
            .map((level) => level as AgendaWriteValidationLevel) as AgendaWriteValidationLevel[])
        : null,
      write_validation_blocking_active: payload.write_validation_blocking_active === true,
      write_validation_enforcement_ready: payload.write_validation_enforcement_ready === true,
      write_validation_summary: this.parseAgendaWriteValidationSummary(
        payload.write_validation_summary
      ),
    };
  }

  private parseAgendaAppointmentItem(raw: unknown): AgendaAppointmentItem | null {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as Record<string, unknown>;
    const idCandidate = payload.id ?? payload.appointment_id;
    if (idCandidate === null || idCandidate === undefined) return null;

    const toIdString = (value: unknown): string | number | null =>
      value === null || value === undefined ? null : String(value);

    const appointmentDate = this.toNonEmptyString(payload.appointment_date) || "";
    const appointmentTime = this.toNonEmptyString(payload.appointment_time) || "";

    return {
      id: String(idCandidate),
      appointment_id: toIdString(payload.appointment_id),
      professional_id: toIdString(payload.professional_id),
      professional_name: this.toNonEmptyString(payload.professional_name),
      professional_role: this.toNonEmptyString(payload.professional_role),
      professional_specialty: this.toNonEmptyString(payload.professional_specialty),
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      appointment_status:
        this.toNonEmptyString(payload.appointment_status) as AgendaAppointmentStatus | null,
      status: this.toNonEmptyString(payload.status) as AgendaAppointmentStatus | null,
      notes: this.toNonEmptyString(payload.notes),
      patient_id: toIdString(payload.patient_id),
      patient_name: this.toNonEmptyString(payload.patient_name),
      status_jornada: this.toNonEmptyString(payload.status_jornada),
      journey_status: this.toNonEmptyString(payload.journey_status),
      service_id: toIdString(payload.service_id),
      service_name: this.toNonEmptyString(payload.service_name),
      event_type_institutional:
        this.toNonEmptyString(payload.event_type_institutional) as
          | AgendaInstitutionalEventType
          | null,
      event_type_institutional_source:
        this.toNonEmptyString(payload.event_type_institutional_source) as
          | AgendaInstitutionalEventTypeSource
          | null,
      journey_consistency_status:
        this.toNonEmptyString(payload.journey_consistency_status) as
          | "ok"
          | "warning"
          | "unknown"
          | string
          | null,
      journey_consistency_code: this.toNonEmptyString(payload.journey_consistency_code),
      journey_consistency_message: this.toNonEmptyString(payload.journey_consistency_message),
      journey_consistency_expected_statuses: Array.isArray(
        payload.journey_consistency_expected_statuses
      )
        ? payload.journey_consistency_expected_statuses
            .filter((status): status is string => typeof status === "string")
            .map((status) => status.trim())
            .filter((status) => status.length > 0)
        : null,
      write_validation_ready: payload.write_validation_ready === true,
      write_validation_mode:
        this.toNonEmptyString(payload.write_validation_mode) as AgendaWriteValidationMode | null,
      write_validation_effective_mode:
        this.toNonEmptyString(payload.write_validation_effective_mode) as
          | AgendaWriteValidationMode
          | null,
      write_validation_rollout_phase: this.toNonEmptyString(payload.write_validation_rollout_phase),
      write_validation_hard_block_enabled: payload.write_validation_hard_block_enabled === true,
      write_validation_legacy_mode_alias:
        this.toNonEmptyString(payload.write_validation_legacy_mode_alias) as
          | AgendaWriteValidationMode
          | null,
      write_validation_level:
        this.toNonEmptyString(payload.write_validation_level) as AgendaWriteValidationLevel | null,
      write_validation_action: this.toNonEmptyString(payload.write_validation_action),
      write_validation_code: this.toNonEmptyString(payload.write_validation_code),
      write_validation_message: this.toNonEmptyString(payload.write_validation_message),
      write_validation_supported_levels: Array.isArray(payload.write_validation_supported_levels)
        ? payload.write_validation_supported_levels
            .filter((level): level is string => typeof level === "string")
            .map((level) => level as AgendaWriteValidationLevel)
        : null,
      write_validation_would_block: payload.write_validation_would_block === true,
      write_validation_blocking_active: payload.write_validation_blocking_active === true,
      write_validation_enforcement_ready: payload.write_validation_enforcement_ready === true,
      write_validation_should_warn: payload.write_validation_should_warn === true,
      write_validation_should_block: payload.write_validation_should_block === true,
      sector_responsible: this.toNonEmptyString(payload.sector_responsible),
      responsible_name: this.toNonEmptyString(payload.responsible_name),
    };
  }

  private parseAgendaWriteValidationPayload(raw: unknown): AgendaWriteValidationPayload | null {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as Record<string, unknown>;
    return {
      mode:
        this.toNonEmptyString(payload.mode) as AgendaWriteValidationMode | null,
      effective_mode:
        this.toNonEmptyString(payload.effective_mode) as AgendaWriteValidationMode | null,
      rollout_phase: this.toNonEmptyString(payload.rollout_phase),
      hard_block_enabled: payload.hard_block_enabled === true,
      legacy_mode_alias:
        this.toNonEmptyString(payload.legacy_mode_alias) as AgendaWriteValidationMode | null,
      level:
        this.toNonEmptyString(payload.level) as AgendaWriteValidationLevel | null,
      action: this.toNonEmptyString(payload.action),
      reason_code: this.toNonEmptyString(payload.reason_code),
      message: this.toNonEmptyString(payload.message),
      supported_levels: Array.isArray(payload.supported_levels)
        ? (payload.supported_levels
            .filter((level): level is string => typeof level === "string")
            .map((level) => level as AgendaWriteValidationLevel) as AgendaWriteValidationLevel[])
        : null,
      should_warn: payload.should_warn === true,
      should_block: payload.should_block === true,
      would_block_when_enforced: payload.would_block_when_enforced === true,
      blocking_active: payload.blocking_active === true,
      enforcement_ready: payload.enforcement_ready === true,
      taxonomy_version: this.toNonEmptyString(payload.taxonomy_version),
      coherence_matrix_version: this.toNonEmptyString(payload.coherence_matrix_version),
    };
  }

  private parseAgendaWriteValidationResolvedContext(
    raw: unknown
  ): AgendaWriteValidationResolvedContext | null {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as Record<string, unknown>;
    return {
      professional_id: this.toNonEmptyString(payload.professional_id),
      professional_name: this.toNonEmptyString(payload.professional_name),
      appointment_id: this.toNonEmptyString(payload.appointment_id),
      patient_id: this.toNonEmptyString(payload.patient_id),
      patient_name: this.toNonEmptyString(payload.patient_name),
      journey_status: this.toNonEmptyString(payload.journey_status),
      journey_status_source: this.toNonEmptyString(payload.journey_status_source),
      journey_status_found:
        typeof payload.journey_status_found === "boolean"
          ? payload.journey_status_found
          : payload.journey_status_found === null
            ? null
            : undefined,
      service_id: this.toNonEmptyString(payload.service_id),
      service_name: this.toNonEmptyString(payload.service_name),
      service_name_source: this.toNonEmptyString(payload.service_name_source),
      service_found:
        typeof payload.service_found === "boolean"
          ? payload.service_found
          : payload.service_found === null
            ? null
            : undefined,
      explicit_event_type: this.toNonEmptyString(payload.explicit_event_type),
      requested_action: this.toNonEmptyString(payload.requested_action),
      current_status:
        this.toNonEmptyString(payload.current_status) as AgendaAppointmentStatus | null,
      target_status:
        this.toNonEmptyString(payload.target_status) as AgendaAppointmentStatus | null,
      guard_block_bypassed_for_cancellation:
        payload.guard_block_bypassed_for_cancellation === true,
    };
  }

  private parseAgendaWriteValidationOverrideInfo(
    raw: unknown
  ): AgendaWriteValidationOverrideInfo | null {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as Record<string, unknown>;
    return {
      requested_enforcement_mode:
        this.toNonEmptyString(payload.requested_enforcement_mode) as
          | AgendaWriteValidationMode
          | null,
      override_allowed: payload.override_allowed === true,
      override_ignored: payload.override_ignored === true,
      configured_mode:
        this.toNonEmptyString(payload.configured_mode) as AgendaWriteValidationMode | null,
      effective_mode:
        this.toNonEmptyString(payload.effective_mode) as AgendaWriteValidationMode | null,
    };
  }

  private parseAgendaSlotConflict(raw: unknown): AgendaSlotConflictInfo | null {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as Record<string, unknown>;
    return {
      appointment_id: this.toNonEmptyString(payload.appointment_id),
      appointment_status:
        this.toNonEmptyString(payload.appointment_status) as AgendaAppointmentStatus | null,
    };
  }

  private parseAgendaCreateStatusPolicy(raw: unknown): AgendaCreateStatusPolicy | null {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as Record<string, unknown>;
    return {
      default_status:
        this.toNonEmptyString(payload.default_status) as AgendaAppointmentStatus | null,
      allow_confirmed_on_create: payload.allow_confirmed_on_create === true,
      allowed_statuses: Array.isArray(payload.allowed_statuses)
        ? (payload.allowed_statuses
            .filter((status): status is string => typeof status === "string")
            .map((status) => status as AgendaAppointmentStatus) as AgendaAppointmentStatus[])
        : null,
    };
  }

  private parseAgendaStatusUpdatePolicy(raw: unknown): AgendaStatusUpdatePolicy | null {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as Record<string, unknown>;
    return {
      allowed_actions: Array.isArray(payload.allowed_actions)
        ? payload.allowed_actions.filter((action): action is string => typeof action === "string")
        : null,
      allowed_target_statuses: Array.isArray(payload.allowed_target_statuses)
        ? (payload.allowed_target_statuses
            .filter((status): status is string => typeof status === "string")
            .map((status) => status as AgendaAppointmentStatus) as AgendaAppointmentStatus[])
        : null,
      immutable_statuses: Array.isArray(payload.immutable_statuses)
        ? (payload.immutable_statuses
            .filter((status): status is string => typeof status === "string")
            .map((status) => status as AgendaAppointmentStatus) as AgendaAppointmentStatus[])
        : null,
      cancellation_guard_bypass_controlled:
        payload.cancellation_guard_bypass_controlled === true,
    };
  }

  private parseAgendaWriteCommonResponse(
    data: Record<string, unknown>,
    response: Response
  ): AgendaWriteValidationResponse {
    return {
      success: data?.success === true,
      dry_run: data?.dry_run === true,
      endpoint: this.toNonEmptyString(data?.endpoint),
      blocked: data?.blocked === true,
      can_proceed: data?.can_proceed === true,
      code: this.toNonEmptyString(data?.code),
      message: this.toNonEmptyString(data?.message) || undefined,
      validation: this.parseAgendaWriteValidationPayload(data?.validation),
      resolved_context: this.parseAgendaWriteValidationResolvedContext(data?.resolved_context),
      override: this.parseAgendaWriteValidationOverrideInfo(data?.override),
      scope: this.parseAgendaScopeContext(data?.scope),
      http_status: response.status,
    };
  }

  // ---------- AUTH ----------
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = (await response.json()) as LoginResponse;

    if (data?.success && data?.token) {
      localStorage.setItem("token", data.token);
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
    }

    return data;
  }

  async verifyToken(): Promise<{ valid: boolean; user?: User }> {
    const token = this.getStoredToken();
    if (!token) return { valid: false };

    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      headers: this.getAuthHeaders(),
    });

    const data = await response.json().catch(() => ({}));

    if (data?.success) {
      return { valid: true, user: data.user as User };
    } else {
      this.clearStoredSession();
      return { valid: false };
    }
  }

  logout() {
    this.clearStoredSession();
  }

  async checkFirstAccess(): Promise<{ firstAccess: boolean }> {
    const resp = await fetch(`${API_BASE_URL}/auth/first-access`, {
      headers: this.getAuthHeaders(),
    });
    return resp.json();
  }

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const resp = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return resp.json();
  }

  // ---------- USERS ----------
  async getUsers(): Promise<{ users: ManagedUser[]; message?: string }> {
    const response = await fetch(`${API_BASE_URL}/users`, {
      headers: this.getAuthHeaders(),
    });
    const data = await response.json();
    if (Array.isArray(data)) {
      return { users: data as ManagedUser[] };
    }
    return {
      users: Array.isArray(data?.users) ? (data.users as ManagedUser[]) : [],
      message: data?.message,
    };
  }

  async deleteUser(id: string | number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: "DELETE",
      headers: this.getAuthHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao excluir usuario");
    }
    return { message: data?.message || "Usuario excluido com sucesso" };
  }

  async forcePasswordChange(id: string | number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/users/${id}/force-password-change`, {
      method: "PATCH",
      headers: this.getAuthHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao forcar redefinicao de senha");
    }
    return {
      message: data?.message || "Usuario devera redefinir a senha no proximo login",
    };
  }

  async linkUserToProfessional(
    userId: string | number,
    professionalId: string
  ): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/link-professional`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ professional_id: professionalId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao vincular usuario ao profissional");
    }
    return { message: data?.message || "Vinculo atualizado com sucesso" };
  }

  async unlinkUserFromProfessional(
    userId: string | number,
    professionalId?: string
  ): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/unlink-professional`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(
        professionalId ? { professional_id: professionalId } : {}
      ),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao desvincular usuario do profissional");
    }
    return { message: data?.message || "Vinculo removido com sucesso" };
  }

  async getLinkableProfessionalUsers(
    professionalId?: string
  ): Promise<LinkableProfessionalUser[]> {
    const query = professionalId
      ? `?professional_id=${encodeURIComponent(professionalId)}`
      : "";
    const response = await fetch(
      `${API_BASE_URL}/profissionais/linkable-users${query}`,
      {
        headers: this.getAuthHeaders(),
      }
    );
    const data = await this.parseResponseOrThrow<{ users?: unknown[] }>(
      response,
      "Falha ao carregar usuarios elegiveis para vinculo"
    );
    const users = Array.isArray(data?.users) ? data.users : [];
    return users.map((item) => {
      const payload = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        id: String(payload.id ?? ""),
        name: (payload.name || "").toString(),
        email: typeof payload.email === "string" ? payload.email : null,
        username: typeof payload.username === "string" ? payload.username : null,
        status: typeof payload.status === "string" ? payload.status : null,
        professional_id:
          payload.professional_id === null || payload.professional_id === undefined
            ? null
            : String(payload.professional_id),
      };
    });
  }

  async linkProfessionalUser(
    professionalId: string,
    userId: string | number
  ): Promise<{ message: string }> {
    const response = await fetch(
      `${API_BASE_URL}/profissionais/${professionalId}/link-user`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ userId }),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao vincular usuario ao profissional");
    }
    return { message: data?.message || "Vinculo atualizado com sucesso" };
  }

  async unlinkProfessionalUser(
    professionalId: string
  ): Promise<{ message: string }> {
    const response = await fetch(
      `${API_BASE_URL}/profissionais/${professionalId}/unlink-user`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao desvincular usuario do profissional");
    }
    return { message: data?.message || "Vinculo removido com sucesso" };
  }

  async createProfessionalLinkRequest(
    professionalId: string,
    notes?: string
  ): Promise<{ message: string; request?: ProfessionalLinkRequest }> {
    const response = await fetch(
      `${API_BASE_URL}/profissionais/${professionalId}/link-requests`,
      {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(notes ? { notes } : {}),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao solicitar vinculo");
    }
    return {
      message: data?.message || "Solicitacao de vinculo enviada com sucesso",
      request: data?.request,
    };
  }

  async getProfessionalLinkRequests(
    status?: ProfessionalLinkRequestStatus
  ): Promise<ProfessionalLinkRequest[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await fetch(`${API_BASE_URL}/profissionais/link-requests${query}`, {
      headers: this.getAuthHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao carregar solicitacoes de vinculo");
    }
    return Array.isArray(data?.requests) ? data.requests : [];
  }

  async approveProfessionalLinkRequest(
    requestId: string,
    notes?: string
  ): Promise<{ message: string; request?: ProfessionalLinkRequest }> {
    const response = await fetch(
      `${API_BASE_URL}/profissionais/link-requests/${requestId}/approve`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(notes ? { notes } : {}),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao aprovar solicitacao de vinculo");
    }
    return {
      message: data?.message || "Solicitacao aprovada com sucesso",
      request: data?.request,
    };
  }

  async rejectProfessionalLinkRequest(
    requestId: string,
    notes?: string
  ): Promise<{ message: string; request?: ProfessionalLinkRequest }> {
    const response = await fetch(
      `${API_BASE_URL}/profissionais/link-requests/${requestId}/reject`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(notes ? { notes } : {}),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao rejeitar solicitacao de vinculo");
    }
    return {
      message: data?.message || "Solicitacao rejeitada com sucesso",
      request: data?.request,
    };
  }

  // ---------- SETTINGS ----------
  /**
   * Busca as configurações atuais
   */
  async getSettings(): Promise<SettingsResponse> {
    const r = await fetch(`${API_BASE_URL}/settings`, {
      headers: this.getAuthHeaders(),
    });
    if (!r.ok) {
      throw new Error("Falha ao carregar configurações");
    }
    return r.json();
  }

  /**
   * Salva as configurações no backend (usa exatamente as chaves snake_case
   * que o backend espera no body).
   */
  async saveSettings(payload: SettingsPayload): Promise<SettingsResponse> {
    const r = await fetch(`${API_BASE_URL}/settings`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const txt = await r.text();
      let message = `Falha ao salvar configurações (HTTP ${r.status})`;
      try {
        const parsed = JSON.parse(txt);
        if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
          message = parsed.message;
        }
      } catch {
        if (txt.trim()) {
          message = `${message}: ${txt}`;
        }
      }
      throw new Error(message);
    }
    return r.json();
  }

  async getPublicSettings(): Promise<PublicSettingsResponse> {
    const response = await fetch(`${API_BASE_URL}/settings/public`, {
      headers: { "Content-Type": "application/json" },
    });
    let raw: unknown = {};

    try {
      raw = await response.json();
    } catch {
      raw = {};
    }

    const parsed = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const fromSettings =
      parsed.settings && typeof parsed.settings === "object"
        ? (parsed.settings as Record<string, unknown>)
        : null;
    const fromData =
      parsed.data && typeof parsed.data === "object"
        ? (parsed.data as Record<string, unknown>)
        : null;

    function pick(field: string): unknown {
      if (Object.prototype.hasOwnProperty.call(parsed, field)) return parsed[field];
      if (fromSettings && Object.prototype.hasOwnProperty.call(fromSettings, field)) {
        return fromSettings[field];
      }
      if (fromData && Object.prototype.hasOwnProperty.call(fromData, field)) {
        return fromData[field];
      }
      return undefined;
    }

    function parseOptionalString(
      value: unknown
    ): string | null | undefined {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    const allowRaw = pick("allow_public_registration");
    const allow = typeof allowRaw === "boolean" ? allowRaw : false;
    const registrationModeRaw = pick("registration_mode");
    const registrationMode =
      registrationModeRaw === "ADMIN_ONLY" ||
      registrationModeRaw === "PUBLIC_SIGNUP" ||
      registrationModeRaw === "INVITE_ONLY"
        ? registrationModeRaw
        : undefined;
    const instituicaoNome = parseOptionalString(pick("instituicao_nome"));
    const instituicaoLogoUrl = parseOptionalString(pick("instituicao_logo_url"));
    const instituicaoLogoBase64 = parseOptionalString(pick("instituicao_logo_base64"));

    const message = typeof parsed.message === "string" ? parsed.message : undefined;

    return {
      success: response.ok && parsed.success !== false,
      registration_mode: registrationMode,
      allow_public_registration: allow,
      instituicao_nome: instituicaoNome,
      instituicao_logo_url: instituicaoLogoUrl,
      instituicao_logo_base64: instituicaoLogoBase64,
      message,
    };
  }

  // ---------- SETTINGS: PROFESSIONAL ROLES ----------
  async getProfessionalRoles(includeInactive = false): Promise<{
    success: boolean;
    roles: ProfessionalRole[];
    message?: string;
  }> {
    const suffix = includeInactive ? "?all=1" : "";
    const response = await fetch(`${API_BASE_URL}/settings/professional-roles${suffix}`, {
      headers: this.getAuthHeaders(),
    });
    const data = await this.parseResponseOrThrow<{
      success?: boolean;
      roles?: ProfessionalRole[];
      message?: string;
    }>(response, "Falha ao carregar funcoes profissionais");
    return {
      success: Boolean(data?.success),
      roles: Array.isArray(data?.roles) ? data.roles : [],
      message: data?.message,
    };
  }

  async createProfessionalRole(payload: {
    nome: string;
    show_in_pre_appointment?: boolean;
  }): Promise<{
    success: boolean;
    role?: ProfessionalRole;
    message?: string;
  }> {
    const nome = this.toNonEmptyString(payload?.nome) || "";
    const showInPreAppointment =
      typeof payload?.show_in_pre_appointment === "boolean"
        ? payload.show_in_pre_appointment
        : true;
    const response = await fetch(`${API_BASE_URL}/settings/professional-roles`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        nome,
        show_in_pre_appointment: showInPreAppointment,
      }),
    });
    return this.parseResponseOrThrow<{
      success: boolean;
      role?: ProfessionalRole;
      message?: string;
    }>(response, "Falha ao criar funcao profissional");
  }

  async updateProfessionalRole(
    id: number,
    payload: {
      nome: string;
      show_in_pre_appointment?: boolean;
    }
  ): Promise<{
    success: boolean;
    role?: ProfessionalRole;
    message?: string;
  }> {
    const nome = this.toNonEmptyString(payload?.nome) || "";
    const body: Record<string, unknown> = { nome };
    if (typeof payload?.show_in_pre_appointment === "boolean") {
      body.show_in_pre_appointment = payload.show_in_pre_appointment;
    }

    const response = await fetch(`${API_BASE_URL}/settings/professional-roles/${id}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    });
    return this.parseResponseOrThrow<{
      success: boolean;
      role?: ProfessionalRole;
      message?: string;
    }>(response, "Falha ao editar funcao profissional");
  }

  async setProfessionalRoleActive(id: number, ativo: boolean): Promise<{
    success: boolean;
    role?: ProfessionalRole;
    message?: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/settings/professional-roles/${id}/ativo`, {
      method: "PATCH",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ ativo }),
    });
    return this.parseResponseOrThrow<{
      success: boolean;
      role?: ProfessionalRole;
      message?: string;
    }>(
      response,
      "Falha ao atualizar status da funcao profissional"
    );
  }

  async setProfessionalRolePreAppointmentVisibility(
    id: number,
    show_in_pre_appointment: boolean
  ): Promise<{
    success: boolean;
    role?: ProfessionalRole;
    message?: string;
  }> {
    const response = await fetch(
      `${API_BASE_URL}/settings/professional-roles/${id}/show-in-pre-appointment`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ show_in_pre_appointment }),
      }
    );
    return this.parseResponseOrThrow<{
      success: boolean;
      role?: ProfessionalRole;
      message?: string;
    }>(
      response,
      "Falha ao atualizar visibilidade da funcao na fila de espera"
    );
  }

  async deleteProfessionalRole(id: number): Promise<{
    success: boolean;
    role?: ProfessionalRole;
    message?: string;
    code?: string;
    linked_professionals?: number;
  }> {
    const response = await fetch(`${API_BASE_URL}/settings/professional-roles/${id}`, {
      method: "DELETE",
      headers: this.getAuthHeaders(),
    });
    return this.parseResponseOrThrow<{
      success: boolean;
      role?: ProfessionalRole;
      message?: string;
      code?: string;
      linked_professionals?: number;
    }>(response, "Falha ao excluir funcao profissional");
  }

  // ---------- SETTINGS: CONVENIOS ----------
  async getConvenios(includeInactive = true): Promise<{
    success: boolean;
    convenios: Convenio[];
    message?: string;
  }> {
    const suffix = includeInactive ? "?all=1" : "?all=0";
    const response = await fetch(`${API_BASE_URL}/settings/convenios${suffix}`, {
      headers: this.getAuthHeaders(),
    });
    const data = await this.parseResponseOrThrow<{
      success?: boolean;
      convenios?: unknown[];
      message?: string;
    }>(response, "Falha ao carregar convenios");

    const convenios = Array.isArray(data?.convenios)
      ? data.convenios
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            const statusRaw = this.toNonEmptyString(record.status)?.toLowerCase();
            const status: ConvenioStatus = statusRaw === "inativo" ? "inativo" : "ativo";
            return {
              id: this.toNonEmptyString(record.id) || "",
              nome: this.toNonEmptyString(record.nome) || "",
              numero_projeto: this.toNonEmptyString(record.numero_projeto),
              data_inicio: this.toNonEmptyString(record.data_inicio),
              data_fim: this.toNonEmptyString(record.data_fim),
              status,
              quantidade_atendidos:
                typeof record.quantidade_atendidos === "number"
                  ? Math.max(0, Math.trunc(record.quantidade_atendidos))
                  : Number(record.quantidade_atendidos) >= 0
                    ? Math.trunc(Number(record.quantidade_atendidos))
                    : 0,
              created_at: this.toNonEmptyString(record.created_at),
              updated_at: this.toNonEmptyString(record.updated_at),
              created_by: this.toNonEmptyString(record.created_by),
              updated_by: this.toNonEmptyString(record.updated_by),
            } satisfies Convenio;
          })
          .filter((item): item is Convenio => Boolean(item?.id))
      : [];

    return {
      success: Boolean(data?.success),
      convenios,
      message: data?.message,
    };
  }

  async createConvenio(payload: ConvenioPayload): Promise<{
    success: boolean;
    convenio?: Convenio;
    message?: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/settings/convenios`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return this.parseResponseOrThrow<{
      success: boolean;
      convenio?: Convenio;
      message?: string;
    }>(response, "Falha ao criar convenio");
  }

  async updateConvenio(id: string, payload: ConvenioPayload): Promise<{
    success: boolean;
    convenio?: Convenio;
    message?: string;
  }> {
    const convenioId = this.toNonEmptyString(id);
    if (!convenioId) {
      throw new Error("Id do convenio invalido");
    }

    const response = await fetch(`${API_BASE_URL}/settings/convenios/${encodeURIComponent(convenioId)}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return this.parseResponseOrThrow<{
      success: boolean;
      convenio?: Convenio;
      message?: string;
    }>(response, "Falha ao atualizar convenio");
  }

  async setConvenioStatus(id: string, status: ConvenioStatus): Promise<{
    success: boolean;
    convenio?: Convenio;
    message?: string;
  }> {
    const convenioId = this.toNonEmptyString(id);
    if (!convenioId) {
      throw new Error("Id do convenio invalido");
    }

    const response = await fetch(
      `${API_BASE_URL}/settings/convenios/${encodeURIComponent(convenioId)}/status`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ status }),
      }
    );
    return this.parseResponseOrThrow<{
      success: boolean;
      convenio?: Convenio;
      message?: string;
    }>(response, "Falha ao atualizar status do convenio");
  }

  // ---------- PROFISSIONAIS ----------
  async getServices(activeOnly = true): Promise<ServiceOption[]> {
    const query = activeOnly ? "?active=true" : "";
    const response = await fetch(`${API_BASE_URL}/services${query}`, {
      headers: this.getAuthHeaders(),
    });
    const data = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar servicos"
    );
    const rawServices = Array.isArray(data?.services) ? data.services : [];
    return rawServices
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const payload = item as Record<string, unknown>;
        const id = this.toNonEmptyString(payload.id);
        const name = this.toNonEmptyString(payload.name);
        if (!id || !name) return null;
        return {
          id,
          name,
          active: payload.active === true,
        } as ServiceOption;
      })
      .filter((item): item is ServiceOption => item !== null);
  }

  async getProfessionals(options?: string | { date?: string; forAgenda?: boolean }) {
    const date = typeof options === "string" ? options : options?.date;
    const forAgenda =
      typeof options === "object" && options !== null ? options.forAgenda === true : false;
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (forAgenda) params.set("for_agenda", "1");
    const query = params.toString().length > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/profissionais${query}`, {
      headers: this.getAuthHeaders(),
    });
    return this.parseResponseOrThrow(response, "Falha ao carregar profissionais");
  }

  async createProfessional(payload: ProfessionalPayload) {
    const response = await fetch(`${API_BASE_URL}/profissionais`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  async updateProfessional(id: string, payload: Partial<ProfessionalPayload>) {
    const response = await fetch(`${API_BASE_URL}/profissionais/${id}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  async updateProfessionalStatus(id: string, status: "ATIVO" | "INATIVO") {
    const response = await fetch(`${API_BASE_URL}/profissionais/${id}/status`, {
      method: "PATCH",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    return response.json();
  }

  async deleteProfessional(id: string) {
    const response = await fetch(`${API_BASE_URL}/profissionais/${id}`, {
      method: "DELETE",
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async getProfessionalAgenda(
    id: string,
    date?: string
  ): Promise<ProfessionalAgendaResponse> {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const response = await fetch(`${API_BASE_URL}/profissionais/${id}/agenda${query}`, {
      headers: this.getAuthHeaders(),
    });
    const data = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar agenda do profissional"
    );

    const agenda = Array.isArray(data?.agenda)
      ? data.agenda
          .map((item) => this.parseAgendaAppointmentItem(item))
          .filter((item): item is AgendaAppointmentItem => item !== null)
      : [];

    const scope = this.parseAgendaScopeContext(data?.scope ?? null);

    const message = typeof data?.message === "string" ? data.message : undefined;

    return {
      success: data?.success === true,
      agenda,
      scope,
      message,
    };
  }

  async getAgendaRange(params: {
    date_from: string;
    date_to: string;
    professional_id?: string | null;
    professional_ids?: string[] | null;
  }): Promise<AgendaRangeResponse> {
    const dateFrom = this.toNonEmptyString(params?.date_from);
    const dateTo = this.toNonEmptyString(params?.date_to);
    if (!dateFrom || !dateTo) {
      throw new Error("Periodo invalido para carregar agenda");
    }

    const query = new URLSearchParams();
    query.set("date_from", dateFrom);
    query.set("date_to", dateTo);
    const professionalId = this.toNonEmptyString(params?.professional_id);
    if (professionalId) {
      query.set("professional_id", professionalId);
    }
    const professionalIds = Array.isArray(params?.professional_ids)
      ? params.professional_ids
          .map((value) => this.toNonEmptyString(value))
          .filter((value): value is string => Boolean(value))
      : [];
    if (professionalIds.length > 0) {
      query.set("professional_ids", professionalIds.join(","));
    }

    const response = await fetch(
      `${API_BASE_URL}/profissionais/agenda/range?${query.toString()}`,
      {
        headers: this.getAuthHeaders(),
      }
    );

    const data = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar agenda do periodo"
    );

    const appointments = Array.isArray(data?.appointments)
      ? data.appointments
          .map((item) => this.parseAgendaAppointmentItem(item))
          .filter((item): item is AgendaAppointmentItem => item !== null)
      : [];

    const professionals = Array.isArray(data?.professionals)
      ? data.professionals
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const payload = item as Record<string, unknown>;
            const id = this.toNonEmptyString(payload.id);
            if (!id) return null;
            return {
              id,
              professional_name: this.toNonEmptyString(
                payload.professional_name ?? payload.user_name
              ),
              professional_role: this.toNonEmptyString(
                payload.professional_role ?? payload.role_nome
              ),
              professional_specialty: this.toNonEmptyString(payload.professional_specialty),
            } as AgendaRangeProfessional;
          })
          .filter((item): item is AgendaRangeProfessional => item !== null)
      : [];

    return {
      success: data?.success === true,
      appointments,
      professionals,
      date_from: this.toNonEmptyString(data?.date_from) || dateFrom,
      date_to: this.toNonEmptyString(data?.date_to) || dateTo,
      scope: this.parseAgendaScopeContext(data?.scope ?? null),
      message: this.toNonEmptyString(data?.message),
    };
  }

  async validateProfessionalAgendaWrite(
    id: string,
    payload: AgendaWriteValidationRequest
  ): Promise<AgendaWriteValidationResponse> {
    const response = await fetch(`${API_BASE_URL}/profissionais/${id}/agenda/validate-write`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload || {}),
    });
    const rawPayload = await this.parseJsonSafe(response);
    const data =
      rawPayload && typeof rawPayload === "object"
        ? (rawPayload as Record<string, unknown>)
        : {};

    if (!response.ok && response.status !== 409) {
      if (response.status === 401) {
        this.notifyUnauthorized();
      }
      throw new Error(
        this.resolveHttpErrorMessage(
          response,
          data,
          "Falha ao validar escrita da agenda institucional"
        )
      );
    }

    return this.parseAgendaWriteCommonResponse(data, response);
  }

  async createProfessionalAgendaAppointment(
    id: string,
    payload: AgendaCreateRequest
  ): Promise<AgendaCreateResponse> {
    const response = await fetch(`${API_BASE_URL}/profissionais/${id}/agenda`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload || {}),
    });
    const rawPayload = await this.parseJsonSafe(response);
    const data =
      rawPayload && typeof rawPayload === "object"
        ? (rawPayload as Record<string, unknown>)
        : {};

    if (!response.ok && response.status !== 409) {
      if (response.status === 401) {
        this.notifyUnauthorized();
      }
      throw new Error(
        this.resolveHttpErrorMessage(
          response,
          data,
          "Falha ao criar agendamento institucional"
        )
      );
    }

    const parsedCommon = this.parseAgendaWriteCommonResponse(data, response);
    return {
      ...parsedCommon,
      persisted: data?.persisted === true,
      create_status_policy: this.parseAgendaCreateStatusPolicy(data?.create_status_policy),
      appointment: this.parseAgendaAppointmentItem(data?.appointment),
      conflict: this.parseAgendaSlotConflict(data?.conflict),
    };
  }

  async updateProfessionalAgendaAppointmentStatus(
    id: string,
    appointmentId: string,
    payload: AgendaStatusUpdateRequest
  ): Promise<AgendaStatusUpdateResponse> {
    const response = await fetch(
      `${API_BASE_URL}/profissionais/${id}/agenda/${appointmentId}/status`,
      {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload || {}),
      }
    );
    const rawPayload = await this.parseJsonSafe(response);
    const data =
      rawPayload && typeof rawPayload === "object"
        ? (rawPayload as Record<string, unknown>)
        : {};

    if (!response.ok && response.status !== 409) {
      if (response.status === 401) {
        this.notifyUnauthorized();
      }
      throw new Error(
        this.resolveHttpErrorMessage(
          response,
          data,
          "Falha ao atualizar status do agendamento institucional"
        )
      );
    }

    const parsedCommon = this.parseAgendaWriteCommonResponse(data, response);
    return {
      ...parsedCommon,
      persisted: data?.persisted === true,
      status_update_policy: this.parseAgendaStatusUpdatePolicy(data?.status_update_policy),
      appointment: this.parseAgendaAppointmentItem(data?.appointment),
    };
  }

  async getProfessionalMe(): Promise<ProfessionalMeResponse> {
    const response = await fetch(`${API_BASE_URL}/profissionais/me`, {
      headers: this.getAuthHeaders(),
    });
    const data = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar contexto profissional"
    );
    const message = typeof data?.message === "string" ? data.message : undefined;
    const professional =
      data?.professional === null || data?.professional === undefined
        ? null
        : (data.professional as ProfessionalSummary);
    const scope = this.parseAgendaScopeContext(data);
    return {
      success: data?.success === true,
      professional_id:
        data?.professional_id === null || data?.professional_id === undefined
          ? null
          : String(data.professional_id),
      can_view_all_professionals: data?.can_view_all_professionals === true,
      allow_professional_view_others: data?.allow_professional_view_others === true,
      // Compatibilidade temporaria: backend pode sinalizar leitura via
      // profissionais:view enquanto perfis migram para agenda:view.
      access_mode: scope?.access_mode ?? null,
      compatibility_mode: scope?.compatibility_mode === true,
      compatibility_notice: scope?.compatibility_notice ?? null,
      primary_scope_required: scope?.primary_scope_required ?? null,
      legacy_scope_required: scope?.legacy_scope_required ?? null,
      legacy_scope_fallback_enabled: scope?.legacy_scope_fallback_enabled === true,
      legacy_scope_active: scope?.legacy_scope_active === true,
      legacy_scope_reason: scope?.legacy_scope_reason ?? null,
      legacy_scope_deprecation_phase: scope?.legacy_scope_deprecation_phase ?? null,
      legacy_scope_requires_migration: scope?.legacy_scope_requires_migration === true,
      legacy_scope_removal_ready: scope?.legacy_scope_removal_ready === true,
      institutional_taxonomy_version: scope?.institutional_taxonomy_version ?? null,
      coherence_matrix_version: scope?.coherence_matrix_version ?? null,
      write_validation_ready: scope?.write_validation_ready === true,
      write_validation_mode: scope?.write_validation_mode ?? null,
      write_validation_effective_mode: scope?.write_validation_effective_mode ?? null,
      write_validation_rollout_phase: scope?.write_validation_rollout_phase ?? null,
      write_validation_hard_block_enabled: scope?.write_validation_hard_block_enabled === true,
      write_validation_legacy_mode_alias: scope?.write_validation_legacy_mode_alias ?? null,
      write_validation_supported_levels: scope?.write_validation_supported_levels ?? null,
      write_validation_blocking_active: scope?.write_validation_blocking_active === true,
      write_validation_enforcement_ready: scope?.write_validation_enforcement_ready === true,
      professional,
      message,
    };
  }

  async getProfessionalsStats(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const response = await fetch(`${API_BASE_URL}/profissionais/stats/resumo${query}`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async getDashboardStats(): Promise<DashboardStatsResponse> {
    const response = await fetch(`${API_BASE_URL}/stats`, {
      headers: this.getAuthHeaders(),
    });

    return this.parseResponseOrThrow<DashboardStatsResponse>(
      response,
      "Falha ao carregar estatisticas do dashboard"
    );
  }

  // ---------- PRE-AGENDAMENTOS ----------
  async searchReceptionCases(
    filters?: ReceptionSearchFilters
  ): Promise<ReceptionSearchResponse> {
    const params = new URLSearchParams();

    if (this.toNonEmptyString(filters?.cpf)) {
      params.set("cpf", String(filters?.cpf).trim());
    }
    if (this.toNonEmptyString(filters?.phone)) {
      params.set("phone", String(filters?.phone).trim());
    }
    if (this.toNonEmptyString(filters?.name)) {
      params.set("name", String(filters?.name).trim());
    }
    if (this.toNonEmptyString(filters?.date_of_birth)) {
      params.set("date_of_birth", String(filters?.date_of_birth).trim());
    }

    const query = params.toString().length > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/fila-espera/reception-search${query}`, {
      headers: this.getAuthHeaders(),
    });

    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao consultar cadastro existente na recepcao"
    );

    const exactMatchesRaw = Array.isArray(raw.exact_matches) ? raw.exact_matches : [];
    const similarMatchesRaw = Array.isArray(raw.similar_matches) ? raw.similar_matches : [];
    const exactMatches = exactMatchesRaw
      .map((item) => normalizeReceptionSearchMatch(item))
      .filter((item): item is ReceptionSearchMatch => item !== null);
    const similarMatches = similarMatchesRaw
      .map((item) => normalizeReceptionSearchMatch(item))
      .filter((item): item is ReceptionSearchMatch => item !== null);

    const scenarioRaw =
      typeof raw.scenario === "string" ? raw.scenario.trim().toLowerCase() : "not_found";
    const scenario: ReceptionSearchScenario =
      scenarioRaw === "found" ||
      scenarioRaw === "possible_duplicate" ||
      scenarioRaw === "not_found"
        ? scenarioRaw
        : "not_found";

    return {
      scenario,
      found: raw.found === true || exactMatches.length > 0,
      exact_matches: exactMatches,
      similar_matches: similarMatches,
      message: typeof raw.message === "string" ? raw.message : undefined,
    };
  }

  async getEligiblePreAppointments(
    filters?: PreAppointmentSearchFilters
  ): Promise<PreAppointmentImportRecord[]> {
    const params = new URLSearchParams();

    if (this.toNonEmptyString(filters?.q)) params.set("q", String(filters?.q).trim());
    if (this.toNonEmptyString(filters?.child_name)) {
      params.set("child_name", String(filters?.child_name).trim());
    }
    if (this.toNonEmptyString(filters?.responsible_name)) {
      params.set("responsible_name", String(filters?.responsible_name).trim());
    }
    if (this.toNonEmptyString(filters?.phone)) {
      params.set("phone", String(filters?.phone).trim());
    }
    if (this.toNonEmptyString(filters?.cpf)) params.set("cpf", String(filters?.cpf).trim());
    if (this.toNonEmptyString(filters?.date)) params.set("date", String(filters?.date).trim());
    if (typeof filters?.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0) {
      params.set("limit", String(Math.min(Math.floor(filters.limit), 100)));
    }

    const query = params.toString().length > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/fila-espera/eligible${query}`, {
      headers: this.getAuthHeaders(),
    });

    const raw = await this.parseResponseOrThrow<unknown>(
      response,
      "Falha ao buscar registros elegiveis da fila de espera"
    );

    return normalizePreAppointmentList(raw);
  }

  async getPreAppointmentById(id: string): Promise<PreAppointmentImportRecord | null> {
    const normalizedId = this.toNonEmptyString(id);
    if (!normalizedId) return null;

    const response = await fetch(
      `${API_BASE_URL}/fila-espera/${encodeURIComponent(normalizedId)}`,
      {
        headers: this.getAuthHeaders(),
      }
    );

    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar registro da fila de espera"
    );

    return normalizePreAppointmentRecord(raw.preAppointment ?? null);
  }

  async getPreAppointmentTriageQueue(
    filters?: PreAppointmentQueueFilters
  ): Promise<PreAppointmentQueueResponse> {
    const params = new URLSearchParams();

    if (this.toNonEmptyString(filters?.q)) params.set("q", String(filters?.q).trim());
    if (this.toNonEmptyString(filters?.child_name)) {
      params.set("child_name", String(filters?.child_name).trim());
    }
    if (this.toNonEmptyString(filters?.responsible_name)) {
      params.set("responsible_name", String(filters?.responsible_name).trim());
    }
    if (this.toNonEmptyString(filters?.phone)) {
      params.set("phone", String(filters?.phone).trim());
    }
    if (this.toNonEmptyString(filters?.cpf)) params.set("cpf", String(filters?.cpf).trim());
    if (this.toNonEmptyString(filters?.date)) params.set("date", String(filters?.date).trim());
    if (this.toNonEmptyString(filters?.service_type)) {
      params.set("service_type", String(filters?.service_type).trim());
    }
    if (this.toNonEmptyString(filters?.cid)) params.set("cid", String(filters?.cid).trim());
    if (this.toNonEmptyString(filters?.referred_by)) {
      params.set("referred_by", String(filters?.referred_by).trim());
    }
    if (this.toNonEmptyString(filters?.status)) {
      params.set("status", String(filters?.status).trim());
    }
    if (this.toNonEmptyString(filters?.priority)) {
      params.set("priority", String(filters?.priority).trim());
    }
    if (this.toNonEmptyString(filters?.sort)) {
      params.set("sort", String(filters?.sort).trim());
    }
    if (typeof filters?.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0) {
      params.set("limit", String(Math.min(Math.floor(filters.limit), 100)));
    }
    if (
      typeof filters?.offset === "number" &&
      Number.isFinite(filters.offset) &&
      filters.offset >= 0
    ) {
      params.set("offset", String(Math.floor(filters.offset)));
    }

    const query = params.toString().length > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/fila-espera/triage-queue${query}`, {
      headers: this.getAuthHeaders(),
    });

    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar fila de triagem da fila de espera"
    );

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = rawItems
      .map((item) => normalizePreAppointmentQueueRecord(item))
      .filter((item): item is PreAppointmentQueueRecord => item !== null);

    const summaryPayload =
      raw.summary && typeof raw.summary === "object"
        ? (raw.summary as Record<string, unknown>)
        : {};
    const sortRaw =
      typeof raw.sort === "string" ? raw.sort.trim().toLowerCase() : "oldest";
    const sort: "oldest" | "newest" | "priority" | "name" =
      sortRaw === "newest" || sortRaw === "priority" || sortRaw === "name"
        ? sortRaw
        : "oldest";

    return {
      items,
      total: toNumber(raw.total, items.length),
      limit: toNumber(raw.limit, items.length || 30),
      offset: toNumber(raw.offset, 0),
      sort,
      summary: {
        pending: toNumber(summaryPayload.pending, 0),
        in_review: toNumber(summaryPayload.in_review, 0),
        converted: toNumber(summaryPayload.converted, 0),
        not_eligible: toNumber(summaryPayload.not_eligible, 0),
      },
    };
  }

  async updatePreAppointmentTriage(
    id: string,
    payload: PreAppointmentTriageUpdatePayload
  ): Promise<PreAppointmentQueueRecord | null> {
    const normalizedId = this.toNonEmptyString(id);
    if (!normalizedId) return null;

    const body: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(payload || {}, "status")) {
      body.status = payload?.status ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, "note")) {
      body.note = payload?.note ?? null;
    }
    if (typeof payload?.append_note === "boolean") {
      body.append_note = payload.append_note;
    }

    const response = await fetch(
      `${API_BASE_URL}/fila-espera/${encodeURIComponent(normalizedId)}/triage`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      }
    );

    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao atualizar triagem da fila de espera"
    );

    return normalizePreAppointmentQueueRecord(raw.preAppointment ?? null);
  }

  // ---------- PACIENTES ----------
  async createPatient(payload: PatientCreatePayload): Promise<PatientCreateResponse> {
    const response = await fetch(`${API_BASE_URL}/pacientes`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload || {}),
    });
    const raw = await this.parseJsonSafe(response);
    const data =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    if (!response.ok) {
      if (response.status === 401) {
        this.notifyUnauthorized();
      }
      const error = new Error(
        this.resolveHttpErrorMessage(response, data, "Falha ao criar pre-cadastro")
      ) as ApiRequestError;
      error.status = response.status;
      error.existing_patient_id =
        typeof data.existing_patient_id === "string" ? data.existing_patient_id : null;
      error.requires_link_confirmation = data.requires_link_confirmation === true;
      error.source_pre_appointment_id =
        typeof data.source_pre_appointment_id === "string"
          ? data.source_pre_appointment_id
          : null;
      error.payload = data;
      throw error;
    }

    const conversionPayload =
      data.pre_appointment_conversion &&
      typeof data.pre_appointment_conversion === "object"
        ? (data.pre_appointment_conversion as Record<string, unknown>)
        : null;

    return {
      success: data.success === true,
      paciente: normalizePatientRecord(data.paciente ?? null) ?? undefined,
      existing_patient_id:
        typeof data.existing_patient_id === "string" ? data.existing_patient_id : undefined,
      linked_existing_patient: data.linked_existing_patient === true,
      source_pre_appointment_id:
        typeof data.source_pre_appointment_id === "string"
          ? data.source_pre_appointment_id
          : undefined,
      pre_appointment_conversion: conversionPayload
        ? {
            pre_appointment_id:
              typeof conversionPayload.pre_appointment_id === "string"
                ? conversionPayload.pre_appointment_id
                : null,
            converted_to_patient_id:
              typeof conversionPayload.converted_to_patient_id === "string"
                ? conversionPayload.converted_to_patient_id
                : null,
            linked_existing_patient: conversionPayload.linked_existing_patient === true,
          }
        : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  }

  async getPatients(): Promise<PatientDTO[]> {
    const response = await fetch(`${API_BASE_URL}/pacientes`, {
      headers: this.getAuthHeaders(),
    });
    const data = await response.json();
    return normalizePatientList(data);
  }

  async getPatientById(id: string): Promise<PatientDetailDTO | null> {
    const normalizedId = this.toNonEmptyString(id);
    if (!normalizedId) return null;

    const response = await fetch(`${API_BASE_URL}/pacientes/${encodeURIComponent(normalizedId)}`, {
      headers: this.getAuthHeaders(),
    });

    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar cadastro do assistido"
    );

    return normalizePatientDetailRecord(raw.paciente ?? null);
  }

  async updatePatient(id: string, payload: PatientUpdatePayload): Promise<PatientDetailDTO | null> {
    const normalizedId = this.toNonEmptyString(id);
    if (!normalizedId) return null;

    const response = await fetch(`${API_BASE_URL}/pacientes/${encodeURIComponent(normalizedId)}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload || {}),
    });

    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao atualizar cadastro do assistido"
    );

    return normalizePatientDetailRecord(raw.paciente ?? null);
  }

  async getSocialTriageQueue(
    filters?: SocialTriageQueueFilters
  ): Promise<SocialTriageQueueResponse> {
    const params = new URLSearchParams();

    if (this.toNonEmptyString(filters?.q)) params.set("q", String(filters?.q).trim());
    if (this.toNonEmptyString(filters?.child_name)) {
      params.set("child_name", String(filters?.child_name).trim());
    }
    if (this.toNonEmptyString(filters?.responsible_name)) {
      params.set("responsible_name", String(filters?.responsible_name).trim());
    }
    if (this.toNonEmptyString(filters?.phone)) params.set("phone", String(filters?.phone).trim());
    if (this.toNonEmptyString(filters?.neighborhood)) {
      params.set("neighborhood", String(filters?.neighborhood).trim());
    }
    if (this.toNonEmptyString(filters?.triagem_responsavel)) {
      params.set("triagem_responsavel", String(filters?.triagem_responsavel).trim());
    }
    if (this.toNonEmptyString(filters?.triagem_status)) {
      params.set("triagem_status", String(filters?.triagem_status).trim());
    }
    if (this.toNonEmptyString(filters?.triagem_prioridade)) {
      params.set("triagem_prioridade", String(filters?.triagem_prioridade).trim());
    }
    if (typeof filters?.has_report === "boolean") {
      params.set("has_report", filters.has_report ? "true" : "false");
    }
    if (this.toNonEmptyString(filters?.service_type)) {
      params.set("service_type", String(filters?.service_type).trim());
    }
    if (this.toNonEmptyString(filters?.date_from)) {
      params.set("date_from", String(filters?.date_from).trim());
    }
    if (this.toNonEmptyString(filters?.date_to)) {
      params.set("date_to", String(filters?.date_to).trim());
    }
    if (typeof filters?.interview_scheduled === "boolean") {
      params.set("interview_scheduled", filters.interview_scheduled ? "true" : "false");
    }
    if (this.toNonEmptyString(filters?.sort)) params.set("sort", String(filters?.sort).trim());
    if (typeof filters?.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0) {
      params.set("limit", String(Math.min(Math.floor(filters.limit), 100)));
    }
    if (
      typeof filters?.offset === "number" &&
      Number.isFinite(filters.offset) &&
      filters.offset >= 0
    ) {
      params.set("offset", String(Math.floor(filters.offset)));
    }

    const query = params.toString().length > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/social-triage${query}`, {
      headers: this.getAuthHeaders(),
    });
    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar fila da triagem social"
    );

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = rawItems
      .map((item) => normalizeSocialTriageQueueItem(item))
      .filter((item): item is SocialTriageQueueItem => item !== null);

    const summaryPayload =
      raw.summary && typeof raw.summary === "object"
        ? (raw.summary as Record<string, unknown>)
        : {};
    const sortRaw = this.toNonEmptyString(raw.sort) || "oldest";
    const sort: SocialTriageQueueResponse["sort"] =
      sortRaw === "newest" ||
      sortRaw === "priority" ||
      sortRaw === "name" ||
      sortRaw === "next_action"
        ? sortRaw
        : "oldest";

    return {
      items,
      total: toNumber(raw.total, items.length),
      limit: toNumber(raw.limit, 30),
      offset: toNumber(raw.offset, 0),
      sort,
      summary: {
        total_em_fila: toNumber(summaryPayload.total_em_fila, 0),
        novos_casos: toNumber(summaryPayload.novos_casos, 0),
        sem_contato: toNumber(summaryPayload.sem_contato, 0),
        em_andamento: toNumber(summaryPayload.em_andamento, 0),
        apto_para_agendamento: toNumber(summaryPayload.apto_para_agendamento, 0),
        entrevista_agendada: toNumber(summaryPayload.entrevista_agendada, 0),
      },
    };
  }

  async patchSocialTriage(
    patientId: string,
    payload: SocialTriagePatchPayload
  ): Promise<SocialTriageQueueItem | null> {
    const normalizedPatientId = this.toNonEmptyString(patientId);
    if (!normalizedPatientId) return null;

    const response = await fetch(
      `${API_BASE_URL}/social-triage/${encodeURIComponent(normalizedPatientId)}`,
      {
        method: "PATCH",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload || {}),
      }
    );
    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao atualizar triagem social"
    );

    return normalizeSocialTriageQueueItem(raw.triage_case ?? null);
  }

  async startSocialTriageAgenda(patientId: string, note?: string | null): Promise<void> {
    const normalizedPatientId = this.toNonEmptyString(patientId);
    if (!normalizedPatientId) return;

    const response = await fetch(
      `${API_BASE_URL}/social-triage/${encodeURIComponent(normalizedPatientId)}/agenda/start`,
      {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ note: this.toNonEmptyString(note) }),
      }
    );
    await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao iniciar agendamento pela triagem social"
    );
  }

  async getSocialTriageHistory(
    patientId: string,
    limit = 50
  ): Promise<SocialTriageHistoryResponse> {
    const normalizedPatientId = this.toNonEmptyString(patientId);
    if (!normalizedPatientId) {
      return {
        patient_id: "",
        total: 0,
        items: [],
      };
    }

    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const response = await fetch(
      `${API_BASE_URL}/social-triage/${encodeURIComponent(
        normalizedPatientId
      )}/history?limit=${safeLimit}`,
      {
        headers: this.getAuthHeaders(),
      }
    );
    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar historico da triagem social"
    );

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = rawItems
      .map((item) => normalizeSocialTriageHistoryItem(item))
      .filter((item): item is SocialTriageHistoryItem => item !== null);

    return {
      patient_id: this.toNonEmptyString(raw.patient_id) || normalizedPatientId,
      total: toNumber(raw.total, items.length),
      items,
    };
  }

  async getVagaEligiblePatients(
    filters?: VagaEligiblePatientFilters
  ): Promise<VagaEligiblePatientListResponse> {
    const params = new URLSearchParams();

    if (this.toNonEmptyString(filters?.q)) params.set("q", String(filters?.q).trim());
    if (this.toNonEmptyString(filters?.child_name)) {
      params.set("child_name", String(filters?.child_name).trim());
    }
    if (this.toNonEmptyString(filters?.responsible_name)) {
      params.set("responsible_name", String(filters?.responsible_name).trim());
    }
    if (this.toNonEmptyString(filters?.phone)) {
      params.set("phone", String(filters?.phone).trim());
    }
    if (this.toNonEmptyString(filters?.cpf)) params.set("cpf", String(filters?.cpf).trim());
    if (this.toNonEmptyString(filters?.status_jornada)) {
      params.set("status_jornada", String(filters?.status_jornada).trim());
    }
    if (this.toNonEmptyString(filters?.specialty)) {
      params.set("specialty", String(filters?.specialty).trim());
    }
    if (this.toNonEmptyString(filters?.cid)) params.set("cid", String(filters?.cid).trim());

    if (typeof filters?.age_min === "number" && Number.isFinite(filters.age_min)) {
      params.set("age_min", String(Math.max(0, Math.floor(filters.age_min))));
    }
    if (typeof filters?.age_max === "number" && Number.isFinite(filters.age_max)) {
      params.set("age_max", String(Math.max(0, Math.floor(filters.age_max))));
    }

    if (typeof filters?.ready_for_vaga === "boolean") {
      params.set("ready_for_vaga", filters.ready_for_vaga ? "true" : "false");
    }
    if (typeof filters?.has_social_interview === "boolean") {
      params.set("has_social_interview", filters.has_social_interview ? "true" : "false");
    }
    if (typeof filters?.has_completed_evaluation === "boolean") {
      params.set(
        "has_completed_evaluation",
        filters.has_completed_evaluation ? "true" : "false"
      );
    }
    if (typeof filters?.sent_to_vaga === "boolean") {
      params.set("sent_to_vaga", filters.sent_to_vaga ? "true" : "false");
    }

    if (typeof filters?.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0) {
      params.set("limit", String(Math.min(Math.floor(filters.limit), 100)));
    }
    if (
      typeof filters?.offset === "number" &&
      Number.isFinite(filters.offset) &&
      filters.offset >= 0
    ) {
      params.set("offset", String(Math.floor(filters.offset)));
    }

    const query = params.toString().length > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/pacientes/vaga-elegiveis${query}`, {
      headers: this.getAuthHeaders(),
    });

    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar lista elegivel para vaga"
    );

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = rawItems
      .map((item) => normalizeVagaEligiblePatientRecord(item))
      .filter((item): item is VagaEligiblePatientRecord => item !== null);

    return {
      items,
      total: toNumber(raw.total, items.length),
      limit: toNumber(raw.limit, items.length || 20),
      offset: toNumber(raw.offset, 0),
    };
  }

  // ---------- ENTREVISTAS SOCIAIS ----------
  async getSocialInterviews(patientId?: string): Promise<SocialInterviewDTO[]> {
    const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
    const response = await fetch(`${API_BASE_URL}/social-interviews${query}`, {
      headers: this.getAuthHeaders(),
    });

    const raw = await this.parseResponseOrThrow<unknown>(
      response,
      "Falha ao carregar entrevistas sociais"
    );

    if (Array.isArray(raw)) {
      return raw as SocialInterviewDTO[];
    }

    if (raw && typeof raw === "object") {
      const payload = raw as Record<string, unknown>;
      if (Array.isArray(payload.interviews)) {
        return payload.interviews as SocialInterviewDTO[];
      }
      if (Array.isArray(payload.entrevistas)) {
        return payload.entrevistas as SocialInterviewDTO[];
      }
      if (payload.interview && typeof payload.interview === "object") {
        return [payload.interview as SocialInterviewDTO];
      }
    }

    return [];
  }

  async createSocialInterview(
    payload: Record<string, unknown>
  ): Promise<SocialInterviewMutationResponse> {
    const response = await fetch(`${API_BASE_URL}/social-interviews`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    return this.parseResponseOrThrow<SocialInterviewMutationResponse>(
      response,
      "Erro ao criar entrevista social"
    );
  }

  async updateSocialInterview(
    id: string,
    payload: Record<string, unknown>
  ): Promise<SocialInterviewMutationResponse> {
    const response = await fetch(`${API_BASE_URL}/social-interviews/${id}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    return this.parseResponseOrThrow<SocialInterviewMutationResponse>(
      response,
      "Erro ao atualizar entrevista social"
    );
  }

  // ---------- AVALIACOES MULTIDISCIPLINARES ----------
  async getEvaluations(filters?: EvaluationListFilters): Promise<EvaluationDTO[]> {
    const params = new URLSearchParams();
    if (filters?.patient_id) params.set("patient_id", String(filters.patient_id));
    if (filters?.professional_id) params.set("professional_id", String(filters.professional_id));
    if (filters?.status) params.set("status", String(filters.status));
    if (filters?.type) params.set("type", String(filters.type));
    if (filters?.date_from) params.set("date_from", String(filters.date_from));
    if (filters?.date_to) params.set("date_to", String(filters.date_to));
    if (typeof filters?.include_consolidation === "boolean") {
      params.set("include_consolidation", filters.include_consolidation ? "true" : "false");
    }

    const query = params.toString().length > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/evaluations${query}`, {
      headers: this.getAuthHeaders(),
    });

    const raw = await this.parseResponseOrThrow<unknown>(
      response,
      "Falha ao carregar avaliacoes"
    );

    if (Array.isArray(raw)) {
      return raw as EvaluationDTO[];
    }

    if (raw && typeof raw === "object") {
      const payload = raw as Record<string, unknown>;
      if (Array.isArray(payload.evaluations)) {
        return payload.evaluations as EvaluationDTO[];
      }
      if (payload.evaluation && typeof payload.evaluation === "object") {
        return [payload.evaluation as EvaluationDTO];
      }
    }

    return [];
  }

  async getEvaluationById(id: string): Promise<EvaluationDTO | null> {
    const response = await fetch(`${API_BASE_URL}/evaluations/${encodeURIComponent(id)}`, {
      headers: this.getAuthHeaders(),
    });

    const raw = await this.parseResponseOrThrow<Record<string, unknown>>(
      response,
      "Falha ao carregar avaliacao"
    );

    if (raw?.evaluation && typeof raw.evaluation === "object") {
      return raw.evaluation as EvaluationDTO;
    }

    return null;
  }

  async createEvaluation(payload: EvaluationUpsertPayload): Promise<EvaluationMutationResponse> {
    const response = await fetch(`${API_BASE_URL}/evaluations`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload || {}),
    });

    return this.parseResponseOrThrow<EvaluationMutationResponse>(
      response,
      "Erro ao criar avaliacao"
    );
  }

  async updateEvaluation(
    id: string,
    payload: EvaluationUpsertPayload
  ): Promise<EvaluationMutationResponse> {
    const response = await fetch(`${API_BASE_URL}/evaluations/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload || {}),
    });

    return this.parseResponseOrThrow<EvaluationMutationResponse>(
      response,
      "Erro ao atualizar avaliacao"
    );
  }

  async completeEvaluation(
    id: string,
    payload: Partial<EvaluationUpsertPayload> = {}
  ): Promise<EvaluationMutationResponse> {
    const response = await fetch(
      `${API_BASE_URL}/evaluations/${encodeURIComponent(id)}/complete`,
      {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload || {}),
      }
    );

    return this.parseResponseOrThrow<EvaluationMutationResponse>(
      response,
      "Erro ao concluir avaliacao"
    );
  }

  async sendEvaluationToVaga(
    id: string,
    payload: { justificativa?: string | null } = {}
  ): Promise<EvaluationMutationResponse> {
    const response = await fetch(
      `${API_BASE_URL}/evaluations/${encodeURIComponent(id)}/send-to-vaga`,
      {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload || {}),
      }
    );

    return this.parseResponseOrThrow<EvaluationMutationResponse>(
      response,
      "Erro ao enviar avaliacao para analise de vaga"
    );
  }

  async createVagaDecision(payload: VagaDecisionPayload): Promise<VagaDecisionResponse> {
    const response = await fetch(`${API_BASE_URL}/vaga-decisions`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload || {}),
    });

    return this.parseResponseOrThrow<VagaDecisionResponse>(
      response,
      "Erro ao registrar decisao de vaga"
    );
  }
}

export const apiService = new ApiService();
export { API_BASE_URL };
