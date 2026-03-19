import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getJourneyStatusLabel } from "@/components/status";
import { usePermissions, useModulePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import {
  apiService,
  type EvaluationDTO,
  type EvaluationTechnicalStatus,
  type EvaluationUpsertPayload,
  type SocialInterviewDTO,
} from "@/services/api";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, Plus, Send, User } from "lucide-react";

type JsonRecord = Record<string, unknown>;

type PacienteOption = {
  id: string;
  nome: string;
  dataNascimento: string;
  responsavel: string;
  telefone: string;
  email: string;
  statusJornada: string;
};

type ProfessionalOption = {
  id: string;
  label: string;
};

type SocialInterviewSummary = {
  date: string;
  socialWorker: string;
  parecer: string;
  resultadoTerapeutico: string;
};

type EvaluationFormDraft = {
  patient_id: string;
  professional_id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: EvaluationTechnicalStatus;
  result: string;
  report: string;
  notes: string;
  is_stage_consolidation: boolean;
  checklist_ready_for_vaga: boolean;
  devolutiva_date: string;
};

type ViewMode = "list" | "view" | "create" | "edit";

const TECH_STATUS_LABELS: Record<EvaluationTechnicalStatus, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  concluida: "Concluida",
  cancelada: "Cancelada",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecord(value: unknown): JsonRecord {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function coerceString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return "";
}

function coerceDate(value: unknown): string {
  const normalized = coerceString(value);
  if (!normalized) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return "";
}

function formatJourneyStatus(rawStatus: string | undefined): string {
  return getJourneyStatusLabel(rawStatus);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR");
}

function getStatusBadge(status: EvaluationTechnicalStatus) {
  if (status === "concluida") return <Badge variant="outline">{TECH_STATUS_LABELS[status]}</Badge>;
  if (status === "cancelada") return <Badge variant="destructive">{TECH_STATUS_LABELS[status]}</Badge>;
  if (status === "em_andamento") return <Badge variant="default">{TECH_STATUS_LABELS[status]}</Badge>;
  return <Badge variant="secondary">{TECH_STATUS_LABELS[status]}</Badge>;
}

function normalizePatient(dto: unknown): PacienteOption | null {
  const record = parseRecord(dto);
  const id = coerceString(record.id);
  if (!id) return null;

  return {
    id,
    nome: coerceString(record.nome || record.name),
    dataNascimento: coerceDate(record.dataNascimento || record.date_of_birth),
    responsavel: coerceString(record.responsavel),
    telefone: coerceString(record.telefones || record.telefone || record.phone || record.mobile),
    email: coerceString(record.email),
    statusJornada: coerceString(record.status_jornada || record.statusJornada),
  };
}

function normalizeProfessionals(raw: unknown): ProfessionalOption[] {
  const source = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.professionals)
      ? raw.professionals
      : [];

  return source
    .map((item) => {
      const record = parseRecord(item);
      const id = coerceString(record.id);
      if (!id) return null;
      const label =
        coerceString(record.user_name) ||
        coerceString(record.name) ||
        coerceString(record.role_nome) ||
        coerceString(record.funcao) ||
        `Profissional ${id}`;
      return { id, label };
    })
    .filter((item): item is ProfessionalOption => item !== null);
}

function normalizeTechnicalStatus(rawStatus: unknown): EvaluationTechnicalStatus {
  const normalized = coerceString(rawStatus).toLowerCase();
  if (normalized === "concluida") return "concluida";
  if (normalized === "cancelada") return "cancelada";
  if (normalized === "em_andamento") return "em_andamento";
  return "agendada";
}

function normalizeEvaluation(dto: EvaluationDTO): EvaluationDTO {
  return {
    ...dto,
    status: normalizeTechnicalStatus(dto.status),
    type: coerceString(dto.type),
    patient_id: coerceString(dto.patient_id),
    patient_name: coerceString(dto.patient_name),
    professional_id: coerceString(dto.professional_id),
    professional_name: coerceString(dto.professional_name),
    start_date: coerceDate(dto.start_date),
    end_date: coerceDate(dto.end_date),
    result: coerceString(dto.result),
    report: coerceString(dto.report),
    notes: coerceString(dto.notes),
    is_stage_consolidation: dto.is_stage_consolidation === true,
    checklist_ready_for_vaga: dto.checklist_ready_for_vaga === true,
    devolutiva_date: coerceDate(dto.devolutiva_date),
  };
}

function createEmptyDraft(patientId = "", isStageConsolidation = false): EvaluationFormDraft {
  return {
    patient_id: patientId,
    professional_id: "",
    type: isStageConsolidation ? "Consolidacao multiprofissional" : "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    status: isStageConsolidation ? "em_andamento" : "agendada",
    result: "",
    report: "",
    notes: "",
    is_stage_consolidation: isStageConsolidation,
    checklist_ready_for_vaga: false,
    devolutiva_date: "",
  };
}

function createDraftFromEvaluation(evaluation: EvaluationDTO): EvaluationFormDraft {
  return {
    patient_id: coerceString(evaluation.patient_id),
    professional_id: coerceString(evaluation.professional_id),
    type: coerceString(evaluation.type),
    start_date: coerceDate(evaluation.start_date),
    end_date: coerceDate(evaluation.end_date),
    status: normalizeTechnicalStatus(evaluation.status),
    result: coerceString(evaluation.result),
    report: coerceString(evaluation.report),
    notes: coerceString(evaluation.notes),
    is_stage_consolidation: evaluation.is_stage_consolidation === true,
    checklist_ready_for_vaga: evaluation.checklist_ready_for_vaga === true,
    devolutiva_date: coerceDate(evaluation.devolutiva_date),
  };
}

function mapDraftToPayload(draft: EvaluationFormDraft): EvaluationUpsertPayload {
  return {
    patient_id: draft.patient_id,
    professional_id: draft.professional_id || null,
    type: draft.type,
    start_date: draft.start_date,
    end_date: draft.end_date || null,
    status: draft.status,
    result: draft.result || null,
    report: draft.report || null,
    notes: draft.notes || null,
    is_stage_consolidation: draft.is_stage_consolidation,
    checklist_ready_for_vaga: draft.checklist_ready_for_vaga,
    devolutiva_date: draft.devolutiva_date || null,
  };
}

function summarizeSocialInterview(interviews: SocialInterviewDTO[]): SocialInterviewSummary | null {
  if (!Array.isArray(interviews) || interviews.length === 0) return null;
  const sorted = [...interviews].sort((left, right) => {
    const leftDate = coerceString(left.interview_date);
    const rightDate = coerceString(right.interview_date);
    return rightDate.localeCompare(leftDate);
  });
  const latest = sorted[0];
  const payload = parseRecord(latest.payload);
  const parecer =
    coerceString(latest.parecer_social) ||
    coerceString(payload.parecer_social) ||
    coerceString(payload.parecerSocial);
  const resultadoTerapeutas =
    coerceString(latest.resultado_terapeutas) ||
    coerceString(payload.resultado_terapeutas) ||
    coerceString(payload.resultadoTerapeutas);

  return {
    date: coerceDate(latest.interview_date),
    socialWorker:
      coerceString(latest.assistente_social) ||
      coerceString(latest.assistente_social_id) ||
      "Nao informado",
    parecer,
    resultadoTerapeutico: resultadoTerapeutas,
  };
}

export default function Avaliacoes() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const modulePermissions = useModulePermissions("avaliacoes");

  const [patients, setPatients] = useState<PacienteOption[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [evaluations, setEvaluations] = useState<EvaluationDTO[]>([]);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
  const [socialInterviewSummary, setSocialInterviewSummary] = useState<SocialInterviewSummary | null>(
    null
  );

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [draft, setDraft] = useState<EvaluationFormDraft>(createEmptyDraft());

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [professionalFilter, setProfessionalFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");

  const [patientsLoading, setPatientsLoading] = useState(false);
  const [professionalsLoading, setProfessionalsLoading] = useState(false);
  const [evaluationsLoading, setEvaluationsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [sendingToVaga, setSendingToVaga] = useState(false);

  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [evaluationsError, setEvaluationsError] = useState<string | null>(null);

  const selectedPatient = useMemo(
    () => patients.find((item) => item.id === selectedPatientId) || null,
    [patients, selectedPatientId]
  );
  const selectedEvaluation = useMemo(
    () => evaluations.find((item) => item.id === selectedEvaluationId) || null,
    [evaluations, selectedEvaluationId]
  );

  const canCreateEvaluation = modulePermissions.canCreate;
  const canEditEvaluation = modulePermissions.canEdit;
  const canAdvanceToVaga =
    canEditEvaluation ||
    hasPermission("analise_vagas", "edit") ||
    hasPermission("analise_vagas", "create") ||
    hasPermission("vagas", "edit") ||
    hasPermission("vagas", "create");
  const canViewInterviews = hasPermission("entrevistas", "view");

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const data = await apiService.getPatients();
      const normalized = (Array.isArray(data) ? data : [])
        .map(normalizePatient)
        .filter((item): item is PacienteOption => item !== null);

      setPatients(normalized);
      if (normalized.length === 0) {
        setSelectedPatientId("");
        setEvaluations([]);
        setSelectedEvaluationId(null);
        setDraft(createEmptyDraft());
        setViewMode("list");
      } else {
        setSelectedPatientId((current) =>
          current && normalized.some((item) => item.id === current) ? current : normalized[0].id
        );
      }
    } catch (error) {
      setPatients([]);
      setSelectedPatientId("");
      setPatientsError("Nao foi possivel carregar assistidos.");
      toast({
        title: "Avaliacoes",
        description: error instanceof Error ? error.message : "Falha ao carregar assistidos.",
        variant: "destructive",
      });
    } finally {
      setPatientsLoading(false);
    }
  }, [toast]);

  const loadProfessionals = useCallback(async () => {
    setProfessionalsLoading(true);
    try {
      const data = await apiService.getProfessionals();
      setProfessionals(normalizeProfessionals(data));
    } catch (error) {
      setProfessionals([]);
      toast({
        title: "Avaliacoes",
        description: error instanceof Error ? error.message : "Falha ao carregar profissionais.",
        variant: "destructive",
      });
    } finally {
      setProfessionalsLoading(false);
    }
  }, [toast]);

  const loadEvaluations = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setEvaluations([]);
        setSelectedEvaluationId(null);
        setSocialInterviewSummary(null);
        setEvaluationsError(null);
        return;
      }

      setEvaluationsLoading(true);
      setEvaluationsError(null);
      try {
        const [evaluationsData, interviewsData] = await Promise.all([
          apiService.getEvaluations({ patient_id: patientId }),
          apiService.getSocialInterviews(patientId),
        ]);

        const normalizedEvaluations = evaluationsData.map((item) => normalizeEvaluation(item));
        setEvaluations(normalizedEvaluations);
        setSocialInterviewSummary(summarizeSocialInterview(interviewsData));

        if (normalizedEvaluations.length === 0) {
          setSelectedEvaluationId(null);
          setViewMode("list");
          setDraft(createEmptyDraft(patientId));
          return;
        }

        setSelectedEvaluationId((current) => {
          if (current && normalizedEvaluations.some((item) => item.id === current)) {
            return current;
          }
          return normalizedEvaluations[0].id;
        });
      } catch (error) {
        setEvaluations([]);
        setSelectedEvaluationId(null);
        setSocialInterviewSummary(null);
        setEvaluationsError("Nao foi possivel carregar avaliacoes deste assistido.");
        toast({
          title: "Avaliacoes",
          description: error instanceof Error ? error.message : "Falha ao carregar avaliacoes.",
          variant: "destructive",
        });
      } finally {
        setEvaluationsLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadPatients();
    void loadProfessionals();
  }, [loadPatients, loadProfessionals]);

  useEffect(() => {
    if (!selectedPatientId) {
      setEvaluations([]);
      setSelectedEvaluationId(null);
      setDraft(createEmptyDraft());
      return;
    }
    void loadEvaluations(selectedPatientId);
  }, [selectedPatientId, loadEvaluations]);

  const filteredEvaluations = useMemo(() => {
    const normalizedTypeFilter = typeFilter.trim().toLowerCase();
    return evaluations.filter((evaluation) => {
      if (statusFilter !== "all" && evaluation.status !== statusFilter) return false;
      if (professionalFilter !== "all" && (evaluation.professional_id || "") !== professionalFilter) {
        return false;
      }
      if (
        normalizedTypeFilter &&
        !coerceString(evaluation.type).toLowerCase().includes(normalizedTypeFilter)
      ) {
        return false;
      }
      if (dateFromFilter && coerceDate(evaluation.start_date) < dateFromFilter) return false;
      if (dateToFilter && coerceDate(evaluation.start_date) > dateToFilter) return false;
      return true;
    });
  }, [dateFromFilter, dateToFilter, evaluations, professionalFilter, statusFilter, typeFilter]);

  const individualEvaluations = useMemo(
    () => evaluations.filter((item) => item.is_stage_consolidation !== true),
    [evaluations]
  );
  const consolidationEvaluations = useMemo(
    () => evaluations.filter((item) => item.is_stage_consolidation === true),
    [evaluations]
  );

  const metrics = useMemo(() => {
    const emAndamento = individualEvaluations.filter((item) => item.status === "em_andamento").length;
    const concluidas = individualEvaluations.filter((item) => item.status === "concluida").length;
    const agendadas = individualEvaluations.filter((item) => item.status === "agendada").length;
    const prontasVaga = consolidationEvaluations.filter(
      (item) => item.status === "concluida" && item.checklist_ready_for_vaga === true
    ).length;

    return {
      total: individualEvaluations.length,
      emAndamento,
      concluidas,
      agendadas,
      prontasVaga,
    };
  }, [consolidationEvaluations, individualEvaluations]);

  const latestConsolidation = useMemo(() => {
    if (consolidationEvaluations.length === 0) return null;
    const sorted = [...consolidationEvaluations].sort((left, right) => {
      const leftDate = coerceDate(left.end_date || left.start_date);
      const rightDate = coerceDate(right.end_date || right.start_date);
      return rightDate.localeCompare(leftDate);
    });
    return sorted[0];
  }, [consolidationEvaluations]);

  const involvedProfessionals = useMemo(() => {
    const uniqueMap = new Map<string, string>();
    for (const evaluation of individualEvaluations) {
      const professionalId = coerceString(evaluation.professional_id);
      if (!professionalId) continue;
      uniqueMap.set(professionalId, coerceString(evaluation.professional_name) || professionalId);
    }
    return Array.from(uniqueMap.entries()).map(([id, label]) => ({ id, label }));
  }, [individualEvaluations]);

  const checklist = useMemo(() => {
    const completedIndividuals = individualEvaluations.filter((item) => item.status === "concluida").length;
    const hasConsolidation = latestConsolidation !== null;
    const consolidationConcluded =
      latestConsolidation?.status === "concluida" && latestConsolidation?.checklist_ready_for_vaga === true;
    const readyForVaga = completedIndividuals > 0 && consolidationConcluded;

    return {
      completedIndividuals,
      hasConsolidation,
      consolidationConcluded,
      readyForVaga,
    };
  }, [individualEvaluations, latestConsolidation]);

  const canPersistCurrentDraft = useMemo(() => {
    if (!coerceString(draft.patient_id)) return false;
    if (!coerceString(draft.type)) return false;
    if (!coerceDate(draft.start_date)) return false;
    if (!draft.is_stage_consolidation && !coerceString(draft.professional_id)) return false;
    return true;
  }, [draft]);

  const updateDraft = <K extends keyof EvaluationFormDraft>(key: K, value: EvaluationFormDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setProfessionalFilter("all");
    setTypeFilter("");
    setDateFromFilter("");
    setDateToFilter("");
  };

  const handleSelectPatient = (patientId: string) => {
    setSelectedPatientId(patientId);
    setSelectedEvaluationId(null);
    setViewMode("list");
    setDraft(createEmptyDraft(patientId));
  };

  const handleCreateEvaluation = (isStageConsolidation = false) => {
    if (!canCreateEvaluation) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil nao possui permissao para criar avaliacao.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedPatientId) {
      toast({
        title: "Selecione um assistido",
        description: "Escolha um assistido para iniciar a avaliacao.",
        variant: "destructive",
      });
      return;
    }

    setDraft(createEmptyDraft(selectedPatientId, isStageConsolidation));
    setSelectedEvaluationId(null);
    setViewMode("create");
  };

  const handleViewEvaluation = (evaluationId: string) => {
    const evaluation = evaluations.find((item) => item.id === evaluationId);
    if (!evaluation) return;
    setSelectedEvaluationId(evaluationId);
    setDraft(createDraftFromEvaluation(evaluation));
    setViewMode("view");
  };

  const handleEditEvaluation = (evaluationId: string) => {
    if (!canEditEvaluation) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil nao possui permissao para editar avaliacao.",
        variant: "destructive",
      });
      return;
    }

    const evaluation = evaluations.find((item) => item.id === evaluationId);
    if (!evaluation) return;
    setSelectedEvaluationId(evaluationId);
    setDraft(createDraftFromEvaluation(evaluation));
    setViewMode("edit");
  };

  const handleCancelEditor = () => {
    if (selectedEvaluation) {
      setDraft(createDraftFromEvaluation(selectedEvaluation));
      setViewMode("view");
      return;
    }
    setDraft(createEmptyDraft(selectedPatientId));
    setViewMode("list");
  };

  const handleSave = async () => {
    if (!draft.patient_id) {
      toast({
        title: "Assistido obrigatorio",
        description: "Selecione um assistido antes de salvar a avaliacao.",
        variant: "destructive",
      });
      return;
    }

    if (!draft.type.trim()) {
      toast({
        title: "Tipo obrigatorio",
        description: "Informe o tipo de avaliacao.",
        variant: "destructive",
      });
      return;
    }

    if (!draft.start_date) {
      toast({
        title: "Data obrigatoria",
        description: "Informe a data de inicio da avaliacao.",
        variant: "destructive",
      });
      return;
    }

    if (!draft.is_stage_consolidation && !draft.professional_id) {
      toast({
        title: "Profissional obrigatorio",
        description: "Avaliacao tecnica individual exige profissional responsavel.",
        variant: "destructive",
      });
      return;
    }

    const isEditMode = viewMode === "edit" && Boolean(selectedEvaluationId);
    if (isEditMode && !canEditEvaluation) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil nao possui permissao para editar avaliacao.",
        variant: "destructive",
      });
      return;
    }

    if (!isEditMode && !canCreateEvaluation) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil nao possui permissao para criar avaliacao.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = mapDraftToPayload(draft);
      const result =
        isEditMode && selectedEvaluationId
          ? await apiService.updateEvaluation(selectedEvaluationId, payload)
          : await apiService.createEvaluation(payload);

      await Promise.all([loadEvaluations(draft.patient_id), loadPatients()]);

      const evaluationFromMutation = result.evaluation ? normalizeEvaluation(result.evaluation) : null;
      if (evaluationFromMutation?.id) {
        setSelectedEvaluationId(evaluationFromMutation.id);
        setDraft(createDraftFromEvaluation(evaluationFromMutation));
        setViewMode("view");
      } else {
        setViewMode("list");
      }

      const transitionChanged = result.status_transition?.changed === true;
      const regressionPrevented = result.status_transition?.regression_prevented === true;

      toast({
        title: isEditMode ? "Avaliacao atualizada" : "Avaliacao registrada",
        description: transitionChanged
          ? "Status principal da jornada atualizado para em_avaliacao."
          : regressionPrevented
            ? "Status principal da jornada mais avancado foi preservado sem regressao."
            : result.message || "Registro salvo com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Nao foi possivel salvar avaliacao.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteEvaluation = async (evaluationId: string) => {
    if (!canEditEvaluation) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil nao possui permissao para concluir avaliacao.",
        variant: "destructive",
      });
      return;
    }

    setCompletingId(evaluationId);
    try {
      const result = await apiService.completeEvaluation(evaluationId, {
        end_date: new Date().toISOString().slice(0, 10),
      });
      await Promise.all([loadEvaluations(selectedPatientId), loadPatients()]);
      toast({
        title: "Avaliacao concluida",
        description:
          result.status_transition?.changed === true
            ? "Avaliacao concluida e status principal da jornada mantido em em_avaliacao."
            : result.message || "Avaliacao concluida com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao concluir",
        description: error instanceof Error ? error.message : "Nao foi possivel concluir avaliacao.",
        variant: "destructive",
      });
    } finally {
      setCompletingId(null);
    }
  };

  const handleSendToVaga = async () => {
    if (!canAdvanceToVaga) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil nao possui permissao para encaminhar para analise de vaga.",
        variant: "destructive",
      });
      return;
    }

    if (!checklist.readyForVaga || !latestConsolidation?.id) {
      toast({
        title: "Checklist pendente",
        description:
          "Finalize ao menos uma avaliacao tecnica e a consolidacao multiprofissional antes do envio.",
        variant: "destructive",
      });
      return;
    }

    setSendingToVaga(true);
    try {
      const result = await apiService.sendEvaluationToVaga(latestConsolidation.id, {});
      await Promise.all([loadEvaluations(selectedPatientId), loadPatients()]);
      toast({
        title: "Encaminhado para analise de vaga",
        description:
          result.status_transition?.changed === true
            ? "Status principal da jornada atualizado para em_analise_vaga."
            : result.message || "Encaminhamento realizado com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro no encaminhamento",
        description:
          error instanceof Error ? error.message : "Nao foi possivel encaminhar para analise de vaga.",
        variant: "destructive",
      });
    } finally {
      setSendingToVaga(false);
    }
  };

  const panelTitle =
    viewMode === "create"
      ? draft.is_stage_consolidation
        ? "Nova consolidacao multiprofissional"
        : "Nova avaliacao tecnica"
      : viewMode === "edit"
        ? "Editar avaliacao"
        : viewMode === "view"
          ? "Detalhe da avaliacao"
          : "Painel da etapa";

  const isEditingMode = viewMode === "create" || viewMode === "edit";
  const readOnly = !isEditingMode;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Avaliacao Multidisciplinar</h1>
          <p className="text-sm text-muted-foreground">
            Etapa tecnica da jornada institucional com consolidacao para analise de vaga.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => handleCreateEvaluation(false)} disabled={!selectedPatientId || !canCreateEvaluation}>
            <Plus className="mr-2 h-4 w-4" />
            Nova avaliacao
          </Button>
          <Button variant="outline" onClick={() => handleCreateEvaluation(true)} disabled={!selectedPatientId || !canCreateEvaluation}>
            <Plus className="mr-2 h-4 w-4" />
            Nova consolidacao
          </Button>
          <Button
            variant="secondary"
            onClick={handleSendToVaga}
            disabled={!selectedPatientId || !canAdvanceToVaga || sendingToVaga || !checklist.readyForVaga}
          >
            {sendingToVaga ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar para analise de vaga
          </Button>
        </div>
      </div>

      {patientsError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Falha ao carregar assistidos</AlertTitle>
          <AlertDescription>{patientsError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Card><CardHeader className="pb-1"><CardTitle className="text-base">Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{metrics.total}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-base">Andamento</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{metrics.emAndamento}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-base">Concluidas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600">{metrics.concluidas}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-base">Agendadas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{metrics.agendadas}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-base">Prontas p/ vaga</CardTitle></CardHeader><CardContent><div className="flex items-center gap-1 text-2xl font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" />{metrics.prontasVaga}</div></CardContent></Card>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" />Contexto do assistido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="patient-selector">Selecionar assistido</Label>
                <Select
                  value={selectedPatientId || "__none"}
                  onValueChange={(value) => handleSelectPatient(value === "__none" ? "" : value)}
                  disabled={patientsLoading || patients.length === 0}
                >
                  <SelectTrigger id="patient-selector"><SelectValue placeholder="Selecione um assistido" /></SelectTrigger>
                  <SelectContent>
                    {patients.length === 0 ? <SelectItem value="__none">Nenhum assistido</SelectItem> : patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>{patient.nome || "Assistido"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedPatient ? (
                <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-sm">
                  <p className="font-medium">{selectedPatient.nome || "-"}</p>
                  <p className="text-muted-foreground">{formatDate(selectedPatient.dataNascimento)}</p>
                  <Badge variant="secondary">{formatJourneyStatus(selectedPatient.statusJornada)}</Badge>
                  <p className="text-xs text-muted-foreground">Etapa atual: Avaliacao Multidisciplinar</p>
                  <p className="text-xs text-muted-foreground">Proxima etapa: Analise de Vaga</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Selecione um assistido para iniciar.</p>
              )}
              {canViewInterviews && selectedPatientId ? (
                <Button variant="outline" className="w-full" onClick={() => navigate(`/entrevistas?patient_id=${encodeURIComponent(selectedPatientId)}`)}>
                  Ver entrevista social
                </Button>
              ) : null}
              <div className="space-y-1 text-xs">
                <p className="flex items-center gap-2">{checklist.completedIndividuals > 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}Avaliacao individual concluida</p>
                <p className="flex items-center gap-2">{checklist.consolidationConcluded ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}Consolidacao pronta para vaga</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Resumo da entrevista social</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {!selectedPatientId ? <p className="text-muted-foreground">Selecione um assistido.</p> : null}
              {selectedPatientId && evaluationsLoading ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando contexto...</p> : null}
              {selectedPatientId && !evaluationsLoading && socialInterviewSummary ? (
                <>
                  <p><span className="text-xs text-muted-foreground">Data: </span>{formatDate(socialInterviewSummary.date)}</p>
                  <p><span className="text-xs text-muted-foreground">Assistente social: </span>{socialInterviewSummary.socialWorker || "-"}</p>
                  <p className="line-clamp-3"><span className="text-xs text-muted-foreground">Parecer: </span>{socialInterviewSummary.parecer || "Nao informado"}</p>
                </>
              ) : null}
              {selectedPatientId && !evaluationsLoading && !socialInterviewSummary ? <p className="text-muted-foreground">Sem entrevista social registrada.</p> : null}
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros operacionais</CardTitle>
              <CardDescription>Refine a listagem por status, profissional, tipo e periodo.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="filter-status">Status tecnico</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="filter-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="agendada">Agendada</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="concluida">Concluida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-professional">Profissional</Label>
                <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                  <SelectTrigger id="filter-professional"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {professionals.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-type">Tipo</Label>
                <Input id="filter-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-date-from">Data (de)</Label>
                <Input id="filter-date-from" type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-date-to">Data (ate)</Label>
                <Input id="filter-date-to" type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} />
              </div>
              <div className="flex items-end"><Button variant="outline" onClick={resetFilters}>Limpar filtros</Button></div>
              {professionalsLoading ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Atualizando profissionais...
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Avaliacoes registradas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {selectedPatientId && evaluationsLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando avaliacoes...</p> : null}
              {selectedPatientId && evaluationsError ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Erro ao carregar</AlertTitle><AlertDescription>{evaluationsError}</AlertDescription></Alert> : null}
              {selectedPatientId && !evaluationsLoading && !evaluationsError && filteredEvaluations.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Profissional</TableHead><TableHead>Inicio</TableHead><TableHead>Status</TableHead><TableHead>Etapa</TableHead><TableHead className="text-right">Acoes</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filteredEvaluations.map((evaluation) => (
                        <TableRow key={evaluation.id} className={`cursor-pointer ${selectedEvaluationId === evaluation.id ? "bg-muted/40" : ""}`} onClick={() => handleViewEvaluation(evaluation.id)}>
                          <TableCell className="font-medium">{evaluation.type || "-"}</TableCell>
                          <TableCell>{evaluation.professional_name || "-"}</TableCell>
                          <TableCell>{formatDate(evaluation.start_date)}</TableCell>
                          <TableCell>{getStatusBadge(evaluation.status)}</TableCell>
                          <TableCell><Badge variant={evaluation.is_stage_consolidation ? "default" : "outline"}>{evaluation.is_stage_consolidation ? "Consolidacao" : "Individual"}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); handleViewEvaluation(evaluation.id); }}>Ver</Button>
                              {canEditEvaluation ? <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); handleEditEvaluation(evaluation.id); }}>Editar</Button> : null}
                              {canEditEvaluation && evaluation.status !== "concluida" && evaluation.status !== "cancelada" ? (
                                <Button size="sm" disabled={completingId === evaluation.id} onClick={(event) => { event.stopPropagation(); void handleCompleteEvaluation(evaluation.id); }}>
                                  {completingId === evaluation.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  Concluir
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              {selectedPatientId && !evaluationsLoading && !evaluationsError && filteredEvaluations.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhuma avaliacao encontrada para os filtros atuais.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{panelTitle}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {viewMode === "list" ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Selecione uma avaliacao na tabela ou inicie um novo registro.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="draft-type">Tipo</Label><Input id="draft-type" value={draft.type} disabled={readOnly} onChange={(event) => updateDraft("type", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="draft-status">Status</Label><Select value={draft.status} onValueChange={(value) => updateDraft("status", value as EvaluationTechnicalStatus)} disabled={readOnly}><SelectTrigger id="draft-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="agendada">Agendada</SelectItem><SelectItem value="em_andamento">Em andamento</SelectItem><SelectItem value="concluida">Concluida</SelectItem><SelectItem value="cancelada">Cancelada</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2">
                      <Label htmlFor="draft-professional">Profissional</Label>
                      <Select
                        value={draft.professional_id || "__none"}
                        onValueChange={(value) => updateDraft("professional_id", value === "__none" ? "" : value)}
                        disabled={readOnly}
                      >
                        <SelectTrigger id="draft-professional"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Nao vincular profissional</SelectItem>
                          {professionals.map((professional) => (
                            <SelectItem key={professional.id} value={professional.id}>{professional.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label htmlFor="draft-start-date">Inicio</Label><Input id="draft-start-date" type="date" value={draft.start_date} disabled={readOnly} onChange={(event) => updateDraft("start_date", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="draft-end-date">Conclusao</Label><Input id="draft-end-date" type="date" value={draft.end_date} disabled={readOnly} onChange={(event) => updateDraft("end_date", event.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex items-center gap-2 rounded-md border p-3"><Checkbox id="draft-consolidation" checked={draft.is_stage_consolidation} disabled={readOnly} onCheckedChange={(checked) => updateDraft("is_stage_consolidation", checked === true)} /><Label htmlFor="draft-consolidation">Consolidacao multiprofissional</Label></div>
                    <div className="flex items-center gap-2 rounded-md border p-3"><Checkbox id="draft-checklist" checked={draft.checklist_ready_for_vaga} disabled={readOnly} onCheckedChange={(checked) => updateDraft("checklist_ready_for_vaga", checked === true)} /><Label htmlFor="draft-checklist">Checklist pronto para vaga</Label></div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="draft-report">Parecer tecnico</Label><Textarea id="draft-report" value={draft.report} disabled={readOnly} onChange={(event) => updateDraft("report", event.target.value)} /></div>
                  <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-3"><Label htmlFor="draft-result">Integracao / continuidade</Label><Textarea id="draft-result" value={draft.result} disabled={readOnly} onChange={(event) => updateDraft("result", event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="draft-notes">Observacoes</Label><Textarea id="draft-notes" value={draft.notes} disabled={readOnly} onChange={(event) => updateDraft("notes", event.target.value)} /></div>
                  <div className="flex flex-wrap gap-2">
                    {isEditingMode ? <Button onClick={() => void handleSave()} disabled={!canPersistCurrentDraft || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Salvar</Button> : null}
                    {isEditingMode ? <Button variant="outline" onClick={handleCancelEditor} disabled={saving}>Cancelar</Button> : null}
                    {!isEditingMode && selectedEvaluation && canEditEvaluation ? <Button variant="outline" onClick={() => handleEditEvaluation(selectedEvaluation.id)}>Editar</Button> : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
