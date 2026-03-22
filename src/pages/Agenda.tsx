import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getJourneyStatusLabel } from "@/components/status";
import { ProtectedRoute as ModuleProtectedRoute } from "@/components/common/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { AGENDA_READ_REQUIRED_SCOPES } from "@/permissions/permissionMap";
import {
  apiService,
  type AgendaAppointmentItem,
  type AgendaAppointmentStatus,
  type AgendaWriteValidationLevel,
} from "@/services/api";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, User } from "lucide-react";

type AgendaStatus = AgendaAppointmentStatus;
type AgendaItem = AgendaAppointmentItem;

type ProfessionalOption = {
  id: string;
  user_name?: string | null;
  role_nome?: string | null;
  funcao?: string | null;
  status?: string;
};

type AgendaAccessContext = {
  professionalId: string | null;
  canViewAllProfessionals: boolean;
  accessMode: string | null;
  compatibilityMode: boolean;
  compatibilityNotice: string | null;
  primaryScopeRequired: string | null;
  legacyScopeRequired: string | null;
  legacyScopeFallbackEnabled: boolean;
  legacyScopeActive: boolean;
  legacyScopeReason: string | null;
  legacyScopeDeprecationPhase: string | null;
  legacyScopeRequiresMigration: boolean;
  legacyScopeRemovalReady: boolean;
  taxonomyVersion: string | null;
  coherenceMatrixVersion: string | null;
  writeValidationMode: string | null;
  writeValidationEffectiveMode: string | null;
  writeValidationRolloutPhase: string | null;
  writeValidationHardBlockEnabled: boolean;
  writeValidationLegacyModeAlias: string | null;
  writeValidationBlockingActive: boolean;
  writeValidationEnforcementReady: boolean;
  writeValidationWarningCount: number;
  writeValidationBlockReadyCount: number;
  writeValidationBlockingCount: number;
};

type AgendaQuickCreateForm = {
  patientId: string;
  serviceId: string;
  appointmentTime: string;
  notes: string;
};

function createDefaultAccessContext(): AgendaAccessContext {
  return {
    professionalId: null,
    canViewAllProfessionals: false,
    accessMode: null,
    compatibilityMode: false,
    compatibilityNotice: null,
    primaryScopeRequired: null,
    legacyScopeRequired: null,
    legacyScopeFallbackEnabled: false,
    legacyScopeActive: false,
    legacyScopeReason: null,
    legacyScopeDeprecationPhase: null,
    legacyScopeRequiresMigration: false,
    legacyScopeRemovalReady: false,
    taxonomyVersion: null,
    coherenceMatrixVersion: null,
    writeValidationMode: null,
    writeValidationEffectiveMode: null,
    writeValidationRolloutPhase: null,
    writeValidationHardBlockEnabled: false,
    writeValidationLegacyModeAlias: null,
    writeValidationBlockingActive: false,
    writeValidationEnforcementReady: false,
    writeValidationWarningCount: 0,
    writeValidationBlockReadyCount: 0,
    writeValidationBlockingCount: 0,
  };
}

function withAccessContextDefaults(
  overrides: Partial<AgendaAccessContext>
): AgendaAccessContext {
  return {
    ...createDefaultAccessContext(),
    ...overrides,
  };
}

const ALL_FILTER_VALUE = "all";
const MISSING_FILTER_VALUE = "__missing__";

const EVENT_TYPE_LABELS: Record<string, string> = {
  entrevista_social: "Entrevista social",
  avaliacao_multidisciplinar: "Avaliacao multidisciplinar",
  analise_vaga: "Analise de vaga",
  devolutiva_institucional: "Devolutiva institucional",
  matricula_institucional: "Matricula institucional",
  devolutiva_matricula: "Devolutiva e matricula (legado)",
  acompanhamento_continuado: "Acompanhamento continuado",
};
const EVENT_TYPE_SOURCE_LABELS: Record<string, string> = {
  explicit_event_type: "Definicao explicita",
  journey_status_rule: "Regra por status_jornada",
  service_name_catalog: "Catalogo de servicos",
};

const WRITE_VALIDATION_LEVEL_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Alerta",
  block_ready: "Pronto para bloqueio",
};

const WRITE_VALIDATION_MODE_LABELS: Record<string, string> = {
  pre_enforcement: "Pre-enforcement (legado)",
  observe_only: "Observacao",
  soft_block: "Soft block",
  hard_block: "Hard block",
};

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DEFAULT_QUICK_CREATE_FORM: AgendaQuickCreateForm = {
  patientId: "",
  serviceId: "",
  appointmentTime: "",
  notes: "",
};

function formatDateLong(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeStatus(rawStatus: AgendaStatus | null | undefined) {
  const normalized = normalizeAppointmentStatusKey(rawStatus);
  if (normalized === "confirmado") {
    return { variant: "default" as const, label: "Confirmado" };
  }
  if (normalized === "concluido") {
    return { variant: "outline" as const, label: "Concluido" };
  }
  if (normalized === "cancelado") {
    return { variant: "destructive" as const, label: "Cancelado" };
  }
  if (normalized === "agendado") {
    return { variant: "secondary" as const, label: "Agendado" };
  }
  if (normalized === "nao_informado") {
    return { variant: "outline" as const, label: "Nao informado" };
  }
  const normalizedLabel = normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  if (normalizedLabel) {
    return { variant: "secondary" as const, label: normalizedLabel };
  }
  return { variant: "outline" as const, label: "Nao informado" };
}

function normalizeAppointmentStatusKey(rawStatus: AgendaStatus | null | undefined) {
  const normalized = (rawStatus || "").toString().trim().toLowerCase();
  if (["scheduled", "agendado"].includes(normalized)) return "agendado";
  if (["confirmed", "confirmado"].includes(normalized)) return "confirmado";
  if (["completed", "concluido"].includes(normalized)) return "concluido";
  if (["cancelled", "cancelado"].includes(normalized)) return "cancelado";
  return normalized || "nao_informado";
}

function formatJourneyStatus(rawStatus: string | null | undefined) {
  return getJourneyStatusLabel(rawStatus);
}

function formatInstitutionalField(rawValue: string | null | undefined) {
  const normalized = (rawValue || "").toString().trim();
  if (!normalized) return "Nao informado";
  return normalized;
}

function formatEventType(rawValue: string | null | undefined) {
  const normalized = (rawValue || "").toString().trim().toLowerCase();
  if (!normalized) return "Nao informado";
  if (EVENT_TYPE_LABELS[normalized]) return EVENT_TYPE_LABELS[normalized];
  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEventTypeSource(rawValue: string | null | undefined) {
  const normalized = (rawValue || "").toString().trim().toLowerCase();
  if (!normalized) return "Nao informado";
  if (EVENT_TYPE_SOURCE_LABELS[normalized]) return EVENT_TYPE_SOURCE_LABELS[normalized];
  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeJourneyConsistencyStatus(rawStatus: string | null | undefined) {
  const normalized = (rawStatus || "").toString().trim().toLowerCase();
  if (!normalized) return "unknown";
  if (["ok", "warning", "unknown"].includes(normalized)) return normalized;
  return "unknown";
}

function normalizeWriteValidationLevel(rawLevel: AgendaWriteValidationLevel | null | undefined) {
  const normalized = (rawLevel || "").toString().trim().toLowerCase();
  if (["info", "warning", "block_ready"].includes(normalized)) return normalized;
  return "info";
}

function formatWriteValidationLevel(rawLevel: AgendaWriteValidationLevel | null | undefined) {
  const normalized = normalizeWriteValidationLevel(rawLevel);
  return WRITE_VALIDATION_LEVEL_LABELS[normalized] || normalized;
}

function formatWriteValidationMode(rawMode: string | null | undefined) {
  const normalized = (rawMode || "").toString().trim().toLowerCase();
  if (!normalized) return "Nao informado";
  return WRITE_VALIDATION_MODE_LABELS[normalized] || normalized;
}

function resolveAppointmentStatus(item: AgendaItem) {
  return item.appointment_status ?? item.status;
}

function resolveJourneyStatus(item: AgendaItem) {
  return item.status_jornada ?? item.journey_status ?? null;
}

function formatAppointmentTime(value: string | null | undefined) {
  const normalized = (value || "").toString().trim();
  if (!normalized) return "--:--";
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    return normalized.slice(0, 5);
  }
  return normalized;
}

function professionalName(item: ProfessionalOption) {
  return item.user_name || item.role_nome || item.funcao || `Profissional ${item.id}`;
}

export default function Agenda() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { userProfile } = useAuth();
  const { settings } = useSettings();
  const { hasPermission, hasAnyScope } = usePermissions();
  const { toast } = useToast();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("");
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<string>(ALL_FILTER_VALUE);
  const [journeyStatusFilter, setJourneyStatusFilter] = useState<string>(ALL_FILTER_VALUE);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateForm, setQuickCreateForm] = useState<AgendaQuickCreateForm>(
    DEFAULT_QUICK_CREATE_FORM
  );
  const [creatingAppointment, setCreatingAppointment] = useState(false);
  const [statusActionLoadingKey, setStatusActionLoadingKey] = useState<string | null>(null);
  const [accessContext, setAccessContext] = useState<AgendaAccessContext>(() =>
    createDefaultAccessContext()
  );

  const triageEntryPatientId = useMemo(
    () => (searchParams.get("patient_id") || "").toString().trim(),
    [searchParams]
  );
  const isTriageEntry = useMemo(
    () => (searchParams.get("entry") || "").toString().trim().toLowerCase() === "triagem_social",
    [searchParams]
  );

  const dateParam = useMemo(() => toIsoDate(currentDate), [currentDate]);
  const canViewAgenda =
    // Compatibilidade temporaria: manter leitura com profissionais:view
    // enquanto os perfis migram para o escopo explicito agenda:view.
    hasAnyScope(AGENDA_READ_REQUIRED_SCOPES) ||
    hasPermission("agenda", "view");

  const canViewOtherProfessionals = useMemo(() => {
    if (!accessContext.professionalId) return true;
    return accessContext.canViewAllProfessionals && settings.allow_professional_view_others;
  }, [
    accessContext.canViewAllProfessionals,
    accessContext.professionalId,
    settings.allow_professional_view_others,
  ]);

  const shouldForceOwnAgenda = Boolean(accessContext.professionalId) && !canViewOtherProfessionals;
  const showProfessionalSelector = canViewOtherProfessionals && professionals.length > 1;

  const availableAppointmentStatusKeys = useMemo(() => {
    const values = new Set<string>();
    for (const item of agenda) {
      values.add(normalizeAppointmentStatusKey(resolveAppointmentStatus(item)));
    }

    const displayOrder = ["agendado", "confirmado", "concluido", "cancelado", "nao_informado"];
    return Array.from(values).sort((left, right) => {
      const leftIndex = displayOrder.indexOf(left);
      const rightIndex = displayOrder.indexOf(right);
      if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
  }, [agenda]);

  const availableJourneyStatuses = useMemo(() => {
    const statuses = new Set<string>();
    let hasMissing = false;

    for (const item of agenda) {
      const rawJourneyStatus = (resolveJourneyStatus(item) || "").toString().trim().toLowerCase();
      if (!rawJourneyStatus) {
        hasMissing = true;
        continue;
      }
      statuses.add(rawJourneyStatus);
    }

    return {
      values: Array.from(statuses).sort((left, right) => left.localeCompare(right)),
      hasMissing,
    };
  }, [agenda]);

  const filteredAgenda = useMemo(() => {
    return agenda.filter((item) => {
      if (appointmentStatusFilter !== ALL_FILTER_VALUE) {
        const currentStatus = normalizeAppointmentStatusKey(resolveAppointmentStatus(item));
        if (currentStatus !== appointmentStatusFilter) return false;
      }

      if (journeyStatusFilter !== ALL_FILTER_VALUE) {
        const rawJourneyStatus = (resolveJourneyStatus(item) || "").toString().trim().toLowerCase();
        if (journeyStatusFilter === MISSING_FILTER_VALUE) {
          if (rawJourneyStatus) return false;
        } else if (rawJourneyStatus !== journeyStatusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [agenda, appointmentStatusFilter, journeyStatusFilter]);

  const counts = useMemo(() => {
    const total = filteredAgenda.length;
    const confirmed = filteredAgenda.filter((item) =>
      normalizeAppointmentStatusKey(resolveAppointmentStatus(item)) === "confirmado"
    ).length;
    const pending = filteredAgenda.filter((item) =>
      normalizeAppointmentStatusKey(resolveAppointmentStatus(item)) === "agendado"
    ).length;
    return { total, confirmed, pending };
  }, [filteredAgenda]);

  const refreshAccessContext = useCallback(async () => {
    if (!canViewAgenda) {
      setAccessContext(createDefaultAccessContext());
      return;
    }

    try {
      const me = await apiService.getProfessionalMe();
      setAccessContext(
        withAccessContextDefaults({
        professionalId: me.professional_id ? String(me.professional_id) : null,
        canViewAllProfessionals: me.can_view_all_professionals === true,
        accessMode:
          typeof me.access_mode === "string" && me.access_mode.trim().length > 0
            ? me.access_mode
            : null,
        compatibilityMode: me.compatibility_mode === true,
        compatibilityNotice: me.compatibility_notice || null,
        primaryScopeRequired: me.primary_scope_required || null,
        legacyScopeRequired: me.legacy_scope_required || null,
        legacyScopeFallbackEnabled: me.legacy_scope_fallback_enabled === true,
        legacyScopeActive: me.legacy_scope_active === true,
        legacyScopeReason: me.legacy_scope_reason || null,
        legacyScopeDeprecationPhase: me.legacy_scope_deprecation_phase || null,
        legacyScopeRequiresMigration: me.legacy_scope_requires_migration === true,
        legacyScopeRemovalReady: me.legacy_scope_removal_ready === true,
        taxonomyVersion: me.institutional_taxonomy_version || null,
        coherenceMatrixVersion: me.coherence_matrix_version || null,
        writeValidationMode: me.write_validation_mode || null,
        writeValidationEffectiveMode: me.write_validation_effective_mode || null,
        writeValidationRolloutPhase: me.write_validation_rollout_phase || null,
        writeValidationHardBlockEnabled: me.write_validation_hard_block_enabled === true,
        writeValidationLegacyModeAlias: me.write_validation_legacy_mode_alias || null,
        writeValidationBlockingActive: me.write_validation_blocking_active === true,
        writeValidationEnforcementReady: me.write_validation_enforcement_ready === true,
        writeValidationWarningCount: 0,
        writeValidationBlockReadyCount: 0,
        writeValidationBlockingCount: 0,
        })
      );
      return;
    } catch {
      const fallbackProfessionalId = userProfile?.professional_id
        ? String(userProfile.professional_id)
        : null;
      setAccessContext(
        withAccessContextDefaults({
        professionalId: fallbackProfessionalId,
        canViewAllProfessionals: userProfile?.can_view_all_professionals === true,
        })
      );
    }
  }, [canViewAgenda, userProfile?.can_view_all_professionals, userProfile?.professional_id]);

  const refreshProfessionals = useCallback(async () => {
    if (!canViewAgenda) {
      setLoadingProfessionals(false);
      setProfessionals([]);
      setSelectedProfessionalId("");
      return;
    }

    try {
      setLoadingProfessionals(true);
      const response = await apiService.getProfessionals({
        date: dateParam,
        forAgenda: true,
      });

      const list = Array.isArray(response?.professionals)
        ? (response.professionals as ProfessionalOption[])
        : Array.isArray(response)
          ? (response as ProfessionalOption[])
          : [];

      setProfessionals(list);

      setSelectedProfessionalId((current) => {
        if (shouldForceOwnAgenda && accessContext.professionalId) {
          return accessContext.professionalId;
        }

        if (current && list.some((item) => String(item.id) === String(current))) {
          return current;
        }

        if (
          accessContext.professionalId &&
          list.some((item) => String(item.id) === String(accessContext.professionalId))
        ) {
          return String(accessContext.professionalId);
        }

        return list[0]?.id ? String(list[0].id) : "";
      });
    } catch (error) {
      setProfessionals([]);
      setSelectedProfessionalId("");
      toast({
        title: "Agenda",
        description: error instanceof Error ? error.message : "Nao foi possivel carregar profissionais.",
        variant: "destructive",
      });
    } finally {
      setLoadingProfessionals(false);
    }
  }, [accessContext.professionalId, canViewAgenda, dateParam, shouldForceOwnAgenda, toast]);

  const refreshAgenda = useCallback(async () => {
    if (!canViewAgenda) {
      setLoadingAgenda(false);
      setAgenda([]);
      return;
    }

    if (!selectedProfessionalId) {
      setLoadingAgenda(false);
      setAgenda([]);
      return;
    }

    try {
      setLoadingAgenda(true);
      const response = await apiService.getProfessionalAgenda(selectedProfessionalId, dateParam);
      const items = Array.isArray(response?.agenda) ? response.agenda : [];
      setAgenda(items);
      if (response?.scope) {
        setAccessContext((current) => ({
          ...current,
          accessMode:
            typeof response.scope?.access_mode === "string" &&
            response.scope.access_mode.trim().length > 0
              ? response.scope.access_mode
              : current.accessMode,
          compatibilityMode:
            typeof response.scope?.compatibility_mode === "boolean"
              ? response.scope.compatibility_mode
              : current.compatibilityMode,
          compatibilityNotice:
            typeof response.scope?.compatibility_notice === "string" &&
            response.scope.compatibility_notice.trim().length > 0
              ? response.scope.compatibility_notice
              : current.compatibilityNotice,
          primaryScopeRequired:
            typeof response.scope?.primary_scope_required === "string" &&
            response.scope.primary_scope_required.trim().length > 0
              ? response.scope.primary_scope_required
              : current.primaryScopeRequired,
          legacyScopeRequired:
            typeof response.scope?.legacy_scope_required === "string" &&
            response.scope.legacy_scope_required.trim().length > 0
              ? response.scope.legacy_scope_required
              : current.legacyScopeRequired,
          legacyScopeFallbackEnabled:
            typeof response.scope?.legacy_scope_fallback_enabled === "boolean"
              ? response.scope.legacy_scope_fallback_enabled
              : current.legacyScopeFallbackEnabled,
          legacyScopeActive:
            typeof response.scope?.legacy_scope_active === "boolean"
              ? response.scope.legacy_scope_active
              : current.legacyScopeActive,
          legacyScopeReason:
            typeof response.scope?.legacy_scope_reason === "string" &&
            response.scope.legacy_scope_reason.trim().length > 0
              ? response.scope.legacy_scope_reason
              : current.legacyScopeReason,
          legacyScopeDeprecationPhase:
            typeof response.scope?.legacy_scope_deprecation_phase === "string" &&
            response.scope.legacy_scope_deprecation_phase.trim().length > 0
              ? response.scope.legacy_scope_deprecation_phase
              : current.legacyScopeDeprecationPhase,
          legacyScopeRequiresMigration:
            typeof response.scope?.legacy_scope_requires_migration === "boolean"
              ? response.scope.legacy_scope_requires_migration
              : current.legacyScopeRequiresMigration,
          legacyScopeRemovalReady:
            typeof response.scope?.legacy_scope_removal_ready === "boolean"
              ? response.scope.legacy_scope_removal_ready
              : current.legacyScopeRemovalReady,
          taxonomyVersion:
            typeof response.scope?.institutional_taxonomy_version === "string" &&
            response.scope.institutional_taxonomy_version.trim().length > 0
              ? response.scope.institutional_taxonomy_version
              : current.taxonomyVersion,
          coherenceMatrixVersion:
            typeof response.scope?.coherence_matrix_version === "string" &&
            response.scope.coherence_matrix_version.trim().length > 0
              ? response.scope.coherence_matrix_version
              : current.coherenceMatrixVersion,
          writeValidationMode:
            typeof response.scope?.write_validation_mode === "string" &&
            response.scope.write_validation_mode.trim().length > 0
              ? response.scope.write_validation_mode
              : current.writeValidationMode,
          writeValidationEffectiveMode:
            typeof response.scope?.write_validation_effective_mode === "string" &&
            response.scope.write_validation_effective_mode.trim().length > 0
              ? response.scope.write_validation_effective_mode
              : current.writeValidationEffectiveMode,
          writeValidationRolloutPhase:
            typeof response.scope?.write_validation_rollout_phase === "string" &&
            response.scope.write_validation_rollout_phase.trim().length > 0
              ? response.scope.write_validation_rollout_phase
              : current.writeValidationRolloutPhase,
          writeValidationHardBlockEnabled:
            typeof response.scope?.write_validation_hard_block_enabled === "boolean"
              ? response.scope.write_validation_hard_block_enabled
              : current.writeValidationHardBlockEnabled,
          writeValidationLegacyModeAlias:
            typeof response.scope?.write_validation_legacy_mode_alias === "string" &&
            response.scope.write_validation_legacy_mode_alias.trim().length > 0
              ? response.scope.write_validation_legacy_mode_alias
              : current.writeValidationLegacyModeAlias,
          writeValidationBlockingActive:
            typeof response.scope?.write_validation_blocking_active === "boolean"
              ? response.scope.write_validation_blocking_active
              : current.writeValidationBlockingActive,
          writeValidationEnforcementReady:
            typeof response.scope?.write_validation_enforcement_ready === "boolean"
              ? response.scope.write_validation_enforcement_ready
              : current.writeValidationEnforcementReady,
          writeValidationWarningCount:
            typeof response.scope?.write_validation_summary?.warning_count === "number"
              ? response.scope.write_validation_summary.warning_count
              : 0,
          writeValidationBlockReadyCount:
            typeof response.scope?.write_validation_summary?.block_ready_count === "number"
              ? response.scope.write_validation_summary.block_ready_count
              : 0,
          writeValidationBlockingCount:
            typeof response.scope?.write_validation_summary?.blocking_count === "number"
              ? response.scope.write_validation_summary.blocking_count
              : 0,
        }));
      }
    } catch (error) {
      setAgenda([]);
      toast({
        title: "Agenda",
        description: error instanceof Error ? error.message : "Nao foi possivel carregar agenda.",
        variant: "destructive",
      });
    } finally {
      setLoadingAgenda(false);
    }
  }, [canViewAgenda, dateParam, selectedProfessionalId, toast]);

  useEffect(() => {
    if (!isTriageEntry || !triageEntryPatientId) return;
    setShowQuickCreate(true);
    setQuickCreateForm((current) =>
      current.patientId === triageEntryPatientId
        ? current
        : { ...current, patientId: triageEntryPatientId }
    );
  }, [isTriageEntry, triageEntryPatientId]);

  const handleQuickCreateFieldChange = useCallback(
    (field: keyof AgendaQuickCreateForm, value: string) => {
      setQuickCreateForm((current) => ({
        ...current,
        [field]: value,
      }));
    },
    []
  );

  const handleCreateAppointment = useCallback(async () => {
    if (!selectedProfessionalId) {
      toast({
        title: "Agenda",
        description: "Selecione um profissional para criar o agendamento.",
        variant: "destructive",
      });
      return;
    }

    const patientId = quickCreateForm.patientId.trim();
    const serviceId = quickCreateForm.serviceId.trim();
    const appointmentTime = quickCreateForm.appointmentTime.trim();
    const notes = quickCreateForm.notes.trim();

    if (!patientId || !serviceId || !appointmentTime) {
      toast({
        title: "Agenda",
        description: "Preencha patient_id, service_id e horario (HH:MM).",
        variant: "destructive",
      });
      return;
    }

    if (!/^\d{2}:\d{2}$/.test(appointmentTime)) {
      toast({
        title: "Agenda",
        description: "Horario invalido. Use HH:MM.",
        variant: "destructive",
      });
      return;
    }

    try {
      setCreatingAppointment(true);
      const response = await apiService.createProfessionalAgendaAppointment(selectedProfessionalId, {
        patient_id: patientId,
        service_id: serviceId,
        appointment_date: dateParam,
        appointment_time: appointmentTime,
        notes: notes || null,
      });

      if (response.success !== true) {
        toast({
          title: "Agenda",
          description:
            response.message ||
            "Nao foi possivel criar o agendamento no modo operacional atual.",
          variant: "destructive",
        });
        return;
      }

      if (isTriageEntry && triageEntryPatientId && triageEntryPatientId === patientId) {
        const linkedAppointmentId = response.appointment?.appointment_id
          ? String(response.appointment.appointment_id)
          : response.appointment?.id
            ? String(response.appointment.id)
            : null;
        const linkedAppointmentAt = `${dateParam}T${appointmentTime}:00`;

        try {
          await apiService.patchSocialTriage(patientId, {
            action_type: "vinculacao_agenda",
            triagem_status: "entrevista_agendada",
            entrevista_agendada_flag: true,
            linked_appointment_id: linkedAppointmentId,
            linked_appointment_at: linkedAppointmentAt,
            note: linkedAppointmentId
              ? `Entrevista vinculada ao agendamento ${linkedAppointmentId}.`
              : "Entrevista vinculada a agenda institucional.",
            metadata: {
              source: "agenda_quick_create",
              selected_professional_id: selectedProfessionalId,
            },
          });
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.delete("entry");
            return next;
          });
        } catch (triageError) {
          toast({
            title: "Triagem Social",
            description:
              triageError instanceof Error
                ? triageError.message
                : "Agendamento criado, mas a vinculacao operacional na triagem falhou.",
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Agenda",
        description: response.message || "Agendamento criado com sucesso.",
      });
      setQuickCreateForm(DEFAULT_QUICK_CREATE_FORM);
      await refreshAgenda();
    } catch (error) {
      toast({
        title: "Agenda",
        description:
          error instanceof Error ? error.message : "Erro ao criar agendamento minimo.",
        variant: "destructive",
      });
    } finally {
      setCreatingAppointment(false);
    }
  }, [
    dateParam,
    isTriageEntry,
    quickCreateForm,
    refreshAgenda,
    selectedProfessionalId,
    setSearchParams,
    toast,
    triageEntryPatientId,
  ]);

  const handleStatusAction = useCallback(
    async (item: AgendaItem, action: "confirm" | "cancel") => {
      if (!selectedProfessionalId) {
        toast({
          title: "Agenda",
          description: "Selecione um profissional para atualizar status.",
          variant: "destructive",
        });
        return;
      }

      const appointmentId = (item.appointment_id ?? item.id)?.toString().trim();
      if (!appointmentId) {
        toast({
          title: "Agenda",
          description: "Agendamento sem identificador valido para atualizar status.",
          variant: "destructive",
        });
        return;
      }

      if (
        action === "cancel" &&
        typeof window !== "undefined" &&
        !window.confirm("Confirmar cancelamento deste agendamento?")
      ) {
        return;
      }

      const actionKey = `${appointmentId}:${action}`;
      try {
        setStatusActionLoadingKey(actionKey);
        const response = await apiService.updateProfessionalAgendaAppointmentStatus(
          selectedProfessionalId,
          appointmentId,
          { action }
        );

        if (response.success !== true) {
          toast({
            title: "Agenda",
            description:
              response.message ||
              "Nao foi possivel atualizar o status no modo operacional atual.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Agenda",
          description: response.message || "Status atualizado com sucesso.",
        });
        await refreshAgenda();
      } catch (error) {
        toast({
          title: "Agenda",
          description:
            error instanceof Error ? error.message : "Erro ao atualizar status do agendamento.",
          variant: "destructive",
        });
      } finally {
        setStatusActionLoadingKey(null);
      }
    },
    [refreshAgenda, selectedProfessionalId, toast]
  );

  useEffect(() => {
    if (!canViewAgenda) return;
    void refreshAccessContext();
  }, [canViewAgenda, refreshAccessContext]);

  useEffect(() => {
    if (!canViewAgenda) return;
    void refreshProfessionals();
  }, [canViewAgenda, refreshProfessionals]);

  useEffect(() => {
    if (!canViewAgenda) return;
    void refreshAgenda();
  }, [canViewAgenda, refreshAgenda]);

  useEffect(() => {
    if (shouldForceOwnAgenda && accessContext.professionalId) {
      setSelectedProfessionalId(String(accessContext.professionalId));
    }
  }, [accessContext.professionalId, shouldForceOwnAgenda]);

  useEffect(() => {
    if (appointmentStatusFilter === ALL_FILTER_VALUE) return;
    if (availableAppointmentStatusKeys.includes(appointmentStatusFilter)) return;
    setAppointmentStatusFilter(ALL_FILTER_VALUE);
  }, [appointmentStatusFilter, availableAppointmentStatusKeys]);

  useEffect(() => {
    if (journeyStatusFilter === ALL_FILTER_VALUE) return;
    if (journeyStatusFilter === MISSING_FILTER_VALUE && availableJourneyStatuses.hasMissing) return;
    if (availableJourneyStatuses.values.includes(journeyStatusFilter)) return;
    setJourneyStatusFilter(ALL_FILTER_VALUE);
  }, [availableJourneyStatuses, journeyStatusFilter]);

  const selectedProfessional = professionals.find(
    (item) => String(item.id) === String(selectedProfessionalId)
  );

  return (
    <ModuleProtectedRoute requiredAnyScopes={AGENDA_READ_REQUIRED_SCOPES}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
            <p className="text-muted-foreground text-sm">
              Visualize os agendamentos por profissional
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {formatDateLong(currentDate)}
                </CardTitle>
                <CardDescription>
                  {counts.total} agendamento(s) exibido(s)
                  {agenda.length !== counts.total ? ` de ${agenda.length}` : ""} no dia
                  {selectedProfessional ? ` - ${professionalName(selectedProfessional)}` : ""}
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {showProfessionalSelector ? (
                  <Select
                    value={selectedProfessionalId}
                    onValueChange={setSelectedProfessionalId}
                    disabled={loadingProfessionals}
                  >
                    <SelectTrigger className="w-[260px]">
                      <SelectValue placeholder="Selecione o profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      {professionals.map((professional) => (
                        <SelectItem key={professional.id} value={String(professional.id)}>
                          {professionalName(professional)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}

                <Select
                  value={appointmentStatusFilter}
                  onValueChange={setAppointmentStatusFilter}
                  disabled={loadingAgenda || agenda.length === 0}
                >
                  <SelectTrigger className="w-[210px]">
                    <SelectValue placeholder="Status do agendamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>Todos os status</SelectItem>
                    {availableAppointmentStatusKeys.map((statusKey) => (
                      <SelectItem key={statusKey} value={statusKey}>
                        {normalizeStatus(statusKey).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={journeyStatusFilter}
                  onValueChange={setJourneyStatusFilter}
                  disabled={loadingAgenda || agenda.length === 0}
                >
                  <SelectTrigger className="w-[230px]">
                    <SelectValue placeholder="Status da jornada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>Todos os status da jornada</SelectItem>
                    {availableJourneyStatuses.values.map((status) => (
                      <SelectItem key={status} value={status}>
                        {formatJourneyStatus(status)}
                      </SelectItem>
                    ))}
                    {availableJourneyStatuses.hasMissing ? (
                      <SelectItem value={MISSING_FILTER_VALUE}>Sem status de jornada</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>

                {shouldForceOwnAgenda ? (
                  <Badge variant="outline">Visualizacao restrita a propria agenda</Badge>
                ) : null}
                {accessContext.compatibilityMode || accessContext.legacyScopeActive ? (
                  <Badge
                    variant="secondary"
                    title={
                      accessContext.compatibilityNotice ||
                      [
                        accessContext.accessMode
                          ? `access_mode: ${accessContext.accessMode}`
                          : "",
                        accessContext.primaryScopeRequired
                          ? `primary_scope: ${accessContext.primaryScopeRequired}`
                          : "",
                        accessContext.legacyScopeRequired
                          ? `legacy_scope: ${accessContext.legacyScopeRequired}`
                          : "",
                        accessContext.legacyScopeReason
                          ? `legacy_reason: ${accessContext.legacyScopeReason}`
                          : "",
                        accessContext.legacyScopeDeprecationPhase
                          ? `deprecation_phase: ${accessContext.legacyScopeDeprecationPhase}`
                          : "",
                        `legacy_fallback_enabled: ${accessContext.legacyScopeFallbackEnabled ? "true" : "false"}`,
                        `legacy_requires_migration: ${accessContext.legacyScopeRequiresMigration ? "true" : "false"}`,
                        `legacy_removal_ready: ${accessContext.legacyScopeRemovalReady ? "true" : "false"}`,
                        `legacy_active: ${accessContext.legacyScopeActive ? "true" : "false"}`,
                      ]
                        .filter(Boolean)
                        .join(" | ") || undefined
                    }
                  >
                    Modo legado: profissionais:view
                  </Badge>
                ) : null}
                {accessContext.taxonomyVersion || accessContext.coherenceMatrixVersion ? (
                  <Badge variant="outline">
                    Regra institucional {accessContext.taxonomyVersion || "-"} / coerencia{" "}
                    {accessContext.coherenceMatrixVersion || "-"}
                  </Badge>
                ) : null}
                {accessContext.writeValidationEnforcementReady ? (
                  <Badge
                    variant={accessContext.writeValidationBlockingActive ? "secondary" : "outline"}
                    title={
                      [
                        accessContext.writeValidationEffectiveMode
                          ? `effective_mode: ${accessContext.writeValidationEffectiveMode}`
                          : "",
                        accessContext.writeValidationRolloutPhase
                          ? `rollout_phase: ${accessContext.writeValidationRolloutPhase}`
                          : "",
                        `hard_block_enabled: ${accessContext.writeValidationHardBlockEnabled ? "true" : "false"}`,
                        accessContext.writeValidationLegacyModeAlias
                          ? `legacy_mode_alias: ${accessContext.writeValidationLegacyModeAlias}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" | ") || undefined
                    }
                  >
                    Enforcement: {formatWriteValidationMode(accessContext.writeValidationMode)}
                  </Badge>
                ) : null}
                {accessContext.writeValidationBlockingActive ? (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                    Bloqueio preparado: modo {formatWriteValidationMode(accessContext.writeValidationEffectiveMode)}
                  </Badge>
                ) : null}
                {accessContext.writeValidationBlockReadyCount > 0 ? (
                  <Badge variant="destructive">
                    {accessContext.writeValidationBlockReadyCount} bloqueio(s) futuros
                  </Badge>
                ) : accessContext.writeValidationWarningCount > 0 ? (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                    {accessContext.writeValidationWarningCount} alerta(s) de fluxo
                  </Badge>
                ) : null}
                {accessContext.writeValidationBlockingCount > 0 ? (
                  <Badge variant="destructive">
                    {accessContext.writeValidationBlockingCount} bloqueio(s) ativos no modo atual
                  </Badge>
                ) : null}

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowQuickCreate((current) => !current)}
                  disabled={!selectedProfessionalId || loadingAgenda || creatingAppointment}
                >
                  {showQuickCreate ? "Fechar criacao minima" : "Criacao minima"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = new Date(currentDate);
                    next.setDate(next.getDate() - 1);
                    setCurrentDate(next);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Hoje
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = new Date(currentDate);
                    next.setDate(next.getDate() + 1);
                    setCurrentDate(next);
                  }}
                >
                  Proximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {showQuickCreate ? (
              <div className="mt-4 rounded-md border border-dashed p-3">
                <p className="text-sm font-medium">Criacao minima (uso controlado)</p>
                <p className="text-xs text-muted-foreground">
                  Cria agendamento no dia selecionado ({dateParam}) com status padrao agendado.
                  Use IDs canonicos de assistido e servico. Agendar nao altera o status principal da
                  jornada.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                  <Input
                    value={quickCreateForm.patientId}
                    onChange={(event) =>
                      handleQuickCreateFieldChange("patientId", event.target.value)
                    }
                    placeholder="patient_id"
                    disabled={creatingAppointment}
                  />
                  <Input
                    value={quickCreateForm.serviceId}
                    onChange={(event) =>
                      handleQuickCreateFieldChange("serviceId", event.target.value)
                    }
                    placeholder="service_id"
                    disabled={creatingAppointment}
                  />
                  <Input
                    value={quickCreateForm.appointmentTime}
                    onChange={(event) =>
                      handleQuickCreateFieldChange("appointmentTime", event.target.value)
                    }
                    placeholder="HH:MM"
                    disabled={creatingAppointment}
                  />
                  <Input
                    value={quickCreateForm.notes}
                    onChange={(event) =>
                      handleQuickCreateFieldChange("notes", event.target.value)
                    }
                    placeholder="Observacao (opcional)"
                    disabled={creatingAppointment}
                  />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      void handleCreateAppointment();
                    }}
                    disabled={creatingAppointment || !selectedProfessionalId}
                  >
                    {creatingAppointment ? "Criando..." : "Criar agendamento"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Regra atual: criacao padrao em agendado; confirmacao usa endpoint de status do
                    agendamento, sem mexer no status_jornada.
                  </p>
                </div>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {loadingAgenda || loadingProfessionals ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Carregando agenda...
              </div>
            ) : !selectedProfessionalId ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nenhum profissional disponivel para visualizacao.
              </div>
            ) : agenda.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Sem agendamentos para esta data.
              </div>
            ) : filteredAgenda.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nenhum agendamento encontrado para os filtros aplicados.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAgenda.map((item) => {
                  const status = normalizeStatus(resolveAppointmentStatus(item));
                  const journeyStatus = resolveJourneyStatus(item);
                  const sector =
                    item.sector_responsible || item.professional_role || item.professional_specialty;
                  const responsible = item.responsible_name || item.professional_name;
                  const consistencyStatus = normalizeJourneyConsistencyStatus(
                    item.journey_consistency_status
                  );
                  const writeValidationLevel = normalizeWriteValidationLevel(
                    item.write_validation_level
                  );
                  const isBlockingNow = item.write_validation_should_block === true;
                  const hasBlockReady =
                    writeValidationLevel === "block_ready" ||
                    item.write_validation_would_block === true;
                  const hasJourneyWarning =
                    isBlockingNow ||
                    hasBlockReady ||
                    writeValidationLevel === "warning" ||
                    consistencyStatus === "warning";
                  const eventTypeSource = formatEventTypeSource(item.event_type_institutional_source);
                  const validationMessage =
                    item.write_validation_message ||
                    item.journey_consistency_message ||
                    "Possivel incoerencia entre etapa da jornada e tipo institucional do evento.";
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-xl font-semibold text-primary">
                          {formatAppointmentTime(item.appointment_time)}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {item.patient_name || "Paciente nao informado"}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {item.service_name || "Servico nao informado"}
                          </p>
                          <div className="grid gap-1 pt-1 text-xs text-muted-foreground md:grid-cols-2 md:gap-x-6">
                            <p>
                              Jornada:{" "}
                              <span className="font-medium text-foreground/80">
                                {formatJourneyStatus(journeyStatus)}
                              </span>
                            </p>
                            <p>
                              Tipo institucional:{" "}
                              <span className="font-medium text-foreground/80">
                                {formatEventType(item.event_type_institutional)}
                              </span>
                            </p>
                            <p>
                              Origem da classificacao:{" "}
                              <span className="font-medium text-foreground/80">
                                {eventTypeSource}
                              </span>
                            </p>
                            <p>
                              Setor:{" "}
                              <span className="font-medium text-foreground/80">
                                {formatInstitutionalField(sector)}
                              </span>
                            </p>
                            <p>
                              Responsavel:{" "}
                              <span className="font-medium text-foreground/80">
                                {formatInstitutionalField(responsible)}
                              </span>
                            </p>
                            <p>
                              Enforcement:{" "}
                              <span className="font-medium text-foreground/80">
                                {formatWriteValidationMode(item.write_validation_mode)}
                              </span>
                            </p>
                            <p>
                              Nivel da validacao:{" "}
                              <span className="font-medium text-foreground/80">
                                {formatWriteValidationLevel(item.write_validation_level)}
                              </span>
                            </p>
                          </div>
                          {hasJourneyWarning ? (
                            <p className="flex items-start gap-2 pt-2 text-xs text-amber-700">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{validationMessage}</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-2 md:items-end">
                        <div className="flex flex-wrap items-center gap-2">
                          {isBlockingNow ? (
                            <Badge variant="destructive">Bloqueado no modo atual</Badge>
                          ) : hasBlockReady ? (
                            <Badge variant="destructive">Pronto para bloqueio</Badge>
                          ) : hasJourneyWarning ? (
                            <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                              Atencao de fluxo
                            </Badge>
                          ) : null}
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {normalizeAppointmentStatusKey(resolveAppointmentStatus(item)) ===
                          "agendado" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                statusActionLoadingKey ===
                                  `${(item.appointment_id ?? item.id)?.toString()}:confirm` ||
                                loadingAgenda ||
                                !selectedProfessionalId ||
                                isBlockingNow
                              }
                              title={isBlockingNow ? "Bloqueado no modo atual de enforcement" : undefined}
                              onClick={() => {
                                void handleStatusAction(item, "confirm");
                              }}
                            >
                              Confirmar
                            </Button>
                          ) : null}
                          {["agendado", "confirmado"].includes(
                            normalizeAppointmentStatusKey(resolveAppointmentStatus(item))
                          ) ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={
                                statusActionLoadingKey ===
                                  `${(item.appointment_id ?? item.id)?.toString()}:cancel` ||
                                loadingAgenda ||
                                !selectedProfessionalId
                              }
                              onClick={() => {
                                void handleStatusAction(item, "cancel");
                              }}
                            >
                              Cancelar
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Agendamentos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{counts.total}</div>
              <p className="text-sm text-muted-foreground">Total exibido</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Confirmados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{counts.confirmed}</div>
              <p className="text-sm text-muted-foreground">Confirmados exibidos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{counts.pending}</div>
              <p className="text-sm text-muted-foreground">Pendentes exibidos</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ModuleProtectedRoute>
  );
}
