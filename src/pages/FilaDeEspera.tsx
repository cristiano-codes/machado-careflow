import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck2, Loader2, Search, ShieldAlert, UserCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { JourneyStatusBadge } from "@/components/status";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  API_BASE_URL,
  apiService,
  type ApiRequestError,
  type ReceptionSearchMatch,
  type ReceptionSearchResponse,
} from "@/services/api";
import { getServiceLabel } from "@/utils/serviceLabels";

type ServiceOption = { id: string; name: string };
type ServicesResponse = { success?: boolean; services?: ServiceOption[] };

type SearchState = {
  phone: string;
  name: string;
  date_of_birth: string;
};

type FormState = {
  name: string;
  date_of_birth: string;
  cpf: string;
  sex: string;
  has_report: boolean;
  cid: string;
  services: string[];
  urgency: "normal" | "prioritario";
  responsible_name: string;
  phone: string;
  email: string;
  how_heard: string;
  how_heard_other: string;
  referred_by: string;
  referred_by_other: string;
  notes: string;
};

type EditBasicFormState = {
  name: string;
  cpf: string;
  date_of_birth: string;
  phone: string;
  email: string;
  notes: string;
};

const INITIAL_SEARCH: SearchState = {
  phone: "",
  name: "",
  date_of_birth: "",
};

const INITIAL_FORM: FormState = {
  name: "",
  date_of_birth: "",
  cpf: "",
  sex: "",
  has_report: false,
  cid: "",
  services: [],
  urgency: "normal",
  responsible_name: "",
  phone: "",
  email: "",
  how_heard: "",
  how_heard_other: "",
  referred_by: "",
  referred_by_other: "",
  notes: "",
};

const INITIAL_EDIT_FORM: EditBasicFormState = {
  name: "",
  cpf: "",
  date_of_birth: "",
  phone: "",
  email: "",
  notes: "",
};

const HOW_HEARD_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "site", label: "Site da instituicao" },
  { value: "amigos", label: "Amigos/Familiares" },
  { value: "outro", label: "Outro" },
];

const REFERRED_BY_OPTIONS = [
  { value: "escola", label: "Escola" },
  { value: "posto_saude", label: "Posto de Saude" },
  { value: "cras", label: "CRAS" },
  { value: "hospital", label: "Hospital" },
  { value: "profissional_particular", label: "Profissional Particular" },
  { value: "outro", label: "Outro" },
];

function toOptional(value: string) {
  const normalized = (value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const normalized = value.trim();
  if (!normalized) return "-";
  const parsed = normalized.length <= 10 ? new Date(`${normalized}T00:00:00`) : new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR");
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function dedupeCandidates(candidates: ReceptionSearchMatch[]) {
  const byId = new Map<string, ReceptionSearchMatch>();
  candidates.forEach((candidate) => {
    if (!candidate?.patient_id) return;
    if (!byId.has(candidate.patient_id)) {
      byId.set(candidate.patient_id, candidate);
    }
  });
  return Array.from(byId.values());
}

function resolveStageRoute(status: string | null | undefined, patientId: string) {
  const normalized = (status || "").toLowerCase().trim();
  if (normalized === "entrevista_realizada") {
    return `/entrevistas?patient_id=${encodeURIComponent(patientId)}`;
  }
  if (normalized === "em_avaliacao") {
    return "/avaliacoes";
  }
  if (
    [
      "em_analise_vaga",
      "aprovado",
      "encaminhado",
      "matriculado",
      "ativo",
      "inativo_assistencial",
      "desligado",
    ].includes(normalized)
  ) {
    return "/analise-vagas";
  }
  return "/triagem-social";
}

function buildPatientNotes(
  form: FormState,
  preAppointmentId: string | null,
  duplicateJustification: string | null
) {
  const lines: string[] = [];
  if (preAppointmentId) lines.push(`Origem: fila de espera #${preAppointmentId}`);
  if (toOptional(form.responsible_name)) lines.push(`Responsavel principal: ${form.responsible_name.trim()}`);
  if (toOptional(form.referred_by)) lines.push(`Encaminhamento inicial: ${form.referred_by}`);
  if (form.has_report && toOptional(form.cid)) lines.push(`CID informado na recepcao: ${form.cid.trim()}`);
  if (duplicateJustification) {
    lines.push(`Justificativa de novo cadastro apos analise de similaridade: ${duplicateJustification}`);
  }
  if (toOptional(form.notes)) lines.push(`Observacoes de recepcao: ${form.notes.trim()}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

export default function FilaDeEspera() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasAnyScope } = usePermissions();

  const [search, setSearch] = useState<SearchState>(INITIAL_SEARCH);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState<ReceptionSearchResponse | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [duplicateJustification, setDuplicateJustification] = useState("");
  const [duplicateCandidates, setDuplicateCandidates] = useState<ReceptionSearchMatch[]>([]);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditBasicFormState>(INITIAL_EDIT_FORM);
  const [editBaseline, setEditBaseline] = useState<EditBasicFormState | null>(null);

  const canAuthorizeDuplicateOverride = hasAnyScope([
    "fila_espera:edit",
    "pre_agendamento:edit",
  ]);

  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoadingServices(true);
        const response = await fetch(
          `${API_BASE_URL}/services?active=true&pre_appointment=true&context=fila-espera`
        );
        const payload = (await response.json()) as ServicesResponse;
        if (!response.ok || payload.success !== true || !Array.isArray(payload.services)) {
          throw new Error("Nao foi possivel carregar os servicos ativos.");
        }
        setServices(payload.services);
      } catch (error) {
        toast({
          title: "Servicos",
          description: error instanceof Error ? error.message : "Falha ao carregar servicos.",
          variant: "destructive",
        });
      } finally {
        setLoadingServices(false);
      }
    };

    void loadServices();
  }, [toast]);

  const combinedSearchCandidates = useMemo(
    () =>
      dedupeCandidates([
        ...(searchResponse?.exact_matches || []),
        ...(searchResponse?.similar_matches || []),
      ]),
    [searchResponse]
  );

  const selectedExistingCase = useMemo(() => {
    const exactMatches = searchResponse?.exact_matches || [];
    if (exactMatches.length > 0) return exactMatches[0];
    return null;
  }, [searchResponse]);

  const requiresDuplicateJustification = duplicateCandidates.length > 0;
  const duplicateCandidateIds = useMemo(
    () => dedupeCandidates(duplicateCandidates).map((candidate) => candidate.patient_id),
    [duplicateCandidates]
  );

  const canSubmit = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.date_of_birth.trim().length > 0 &&
      form.phone.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.services.length > 0 &&
      (!requiresDuplicateJustification || duplicateJustification.trim().length > 0),
    [form, requiresDuplicateJustification, duplicateJustification]
  );

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleService = (serviceId: string) => {
    setForm((prev) => {
      const has = prev.services.includes(serviceId);
      return {
        ...prev,
        services: has ? prev.services.filter((id) => id !== serviceId) : [...prev.services, serviceId],
      };
    });
  };

  const runReceptionSearch = async (criteria: SearchState) => {
    const hasPhoneFlow = criteria.phone.trim().length > 0 && criteria.date_of_birth.trim().length > 0;
    const hasNameFlow = criteria.name.trim().length > 0 && criteria.date_of_birth.trim().length > 0;

    if (!hasPhoneFlow && !hasNameFlow) {
      toast({
        title: "Consulta obrigatoria",
        description: "Informe Telefone + Data de nascimento ou Nome + Data de nascimento.",
        variant: "destructive",
      });
      return null;
    }

    const response = await apiService.searchReceptionCases({
      phone: hasPhoneFlow ? criteria.phone.trim() : null,
      name: hasNameFlow ? criteria.name.trim() : null,
      date_of_birth: criteria.date_of_birth.trim(),
    });
    setSearchResponse(response);
    setSearchAttempted(true);
    return response;
  };

  const handleSearchSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSearchLoading(true);
      const response = await runReceptionSearch(search);
      if (!response) return;
      setShowCreateForm(false);
      setDuplicateCandidates([]);

      if (response.scenario === "found") {
        toast({
          title: "Cadastro encontrado",
          description: "Abra ou edite o cadastro existente para seguir sem duplicidade.",
        });
      } else if (response.scenario === "possible_duplicate") {
        toast({
          title: "Possivel duplicidade",
          description: "Revise os cadastros similares. Novo cadastro exige justificativa.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Consulta",
        description: error instanceof Error ? error.message : "Nao foi possivel consultar agora.",
        variant: "destructive",
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const startCreateFlowFromSearch = (needsJustification: boolean) => {
    setShowCreateForm(true);
    setForm((prev) => ({
      ...prev,
      name: search.name.trim() || prev.name,
      phone: search.phone.trim() || prev.phone,
      date_of_birth: search.date_of_birth || prev.date_of_birth,
    }));

    if (needsJustification) {
      setDuplicateCandidates(combinedSearchCandidates);
    } else {
      setDuplicateCandidates([]);
      setDuplicateJustification("");
    }
  };

  const handleOpenExisting = (patientId: string) => {
    navigate(`/pre-cadastro?patient_id=${encodeURIComponent(patientId)}&entry=fila_espera`);
  };

  const handleGoToCorrectStage = (candidate: ReceptionSearchMatch) => {
    const target = resolveStageRoute(candidate.status_jornada, candidate.patient_id);
    navigate(target);
  };

  const handleOpenEditDialog = async (candidate: ReceptionSearchMatch) => {
    try {
      setEditDialogOpen(true);
      setEditLoading(true);
      setEditingPatientId(candidate.patient_id);
      const patient = await apiService.getPatientById(candidate.patient_id);
      if (!patient) {
        throw new Error("Cadastro nao encontrado para edicao.");
      }

      const payload: EditBasicFormState = {
        name: patient.nome || "",
        cpf: patient.cpf || "",
        date_of_birth: toDateInputValue(patient.dataNascimento),
        phone: patient.telefone || "",
        email: patient.email || "",
        notes: patient.notes || "",
      };
      setEditForm(payload);
      setEditBaseline(payload);
    } catch (error) {
      setEditDialogOpen(false);
      setEditingPatientId(null);
      toast({
        title: "Editar dados basicos",
        description: error instanceof Error ? error.message : "Nao foi possivel abrir a edicao.",
        variant: "destructive",
      });
    } finally {
      setEditLoading(false);
    }
  };

  const handleSaveBasicEdit = async () => {
    if (!editingPatientId || !editBaseline) return;

    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      toast({
        title: "Editar dados basicos",
        description: "Nome da crianca e obrigatorio.",
        variant: "destructive",
      });
      return;
    }

    const changedFields: string[] = [];
    if (editBaseline.name.trim() !== trimmedName) changedFields.push("nome");
    if ((editBaseline.cpf || "").trim() !== (editForm.cpf || "").trim()) changedFields.push("cpf");
    if ((editBaseline.date_of_birth || "").trim() !== (editForm.date_of_birth || "").trim()) {
      changedFields.push("data_nascimento");
    }
    if ((editBaseline.phone || "").trim() !== (editForm.phone || "").trim()) changedFields.push("telefone");
    if ((editBaseline.email || "").trim() !== (editForm.email || "").trim()) changedFields.push("email");

    if (changedFields.length === 0) {
      toast({
        title: "Editar dados basicos",
        description: "Nenhuma alteracao detectada.",
      });
      setEditDialogOpen(false);
      return;
    }

    try {
      setEditSaving(true);
      await apiService.updateReceptionPatientBasic(editingPatientId, {
        name: trimmedName,
        cpf: toOptional(editForm.cpf),
        date_of_birth: toOptional(editForm.date_of_birth),
        phone: toOptional(editForm.phone),
        email: toOptional(editForm.email),
        notes: toOptional(editForm.notes),
      });

      toast({
        title: "Dados atualizados",
        description: "Cadastro atualizado com rastreabilidade de recepcao.",
      });

      setEditDialogOpen(false);
      const updatedSearch = { ...search };
      try {
        setSearchLoading(true);
        await runReceptionSearch(updatedSearch);
      } finally {
        setSearchLoading(false);
      }
    } catch (error) {
      toast({
        title: "Editar dados basicos",
        description: error instanceof Error ? error.message : "Nao foi possivel salvar alteracoes.",
        variant: "destructive",
      });
    } finally {
      setEditSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSubmitting(true);

      const duplicateCheck = await apiService.searchReceptionCases({
        cpf: toOptional(form.cpf),
        phone: form.phone.trim(),
        name: form.name.trim(),
        date_of_birth: form.date_of_birth,
      });

      if (duplicateCheck.exact_matches.length > 0) {
        const fallbackName = duplicateCheck.exact_matches[0]?.child_name || form.name;
        setSearch({
          phone: form.phone,
          name: fallbackName,
          date_of_birth: form.date_of_birth,
        });
        setSearchResponse(duplicateCheck);
        setSearchAttempted(true);
        setShowCreateForm(false);
        setDuplicateCandidates([]);
        toast({
          title: "Cadastro ja existente",
          description: "Use o cadastro localizado para continuar. Novo cadastro foi bloqueado.",
          variant: "destructive",
        });
        return;
      }

      if (duplicateCheck.similar_matches.length > 0 && !duplicateJustification.trim()) {
        setSearchResponse(duplicateCheck);
        setSearchAttempted(true);
        setShowCreateForm(false);
        setDuplicateCandidates(duplicateCheck.similar_matches);
        toast({
          title: "Justificativa obrigatoria",
          description: "Existe similaridade forte. Informe justificativa para criar novo cadastro.",
          variant: "destructive",
        });
        return;
      }

      const candidateIdsFromCheck = dedupeCandidates([
        ...duplicateCheck.exact_matches,
        ...duplicateCheck.similar_matches,
      ]).map((candidate) => candidate.patient_id);
      const allCandidateIds = Array.from(new Set([...duplicateCandidateIds, ...candidateIdsFromCheck]));

      const waitingListPayload = await apiService.createWaitingListEntry({
          name: form.name.trim(),
          date_of_birth: form.date_of_birth || null,
          cpf: toOptional(form.cpf),
          sex: form.sex || null,
          has_report: form.has_report,
          cid: form.has_report ? toOptional(form.cid) : null,
          services: form.services,
          urgency: form.urgency,
          responsible_name: toOptional(form.responsible_name),
          phone: form.phone.trim(),
          whatsapp: false,
          email: form.email.trim(),
          how_heard: toOptional(form.how_heard),
          how_heard_other: form.how_heard === "outro" ? toOptional(form.how_heard_other) : null,
          referred_by: toOptional(form.referred_by),
          referred_by_other: form.referred_by === "outro" ? toOptional(form.referred_by_other) : null,
          consent_whatsapp: false,
          consent_lgpd: true,
          notes: toOptional(form.notes),
          duplicate_justification: toOptional(duplicateJustification),
          duplicate_candidate_ids: allCandidateIds,
      });

      if (waitingListPayload.success !== true) {
        throw new Error(
          waitingListPayload.message || "Nao foi possivel registrar entrada na fila de espera."
        );
      }

      const preAppointmentId = toOptional(
        waitingListPayload.fila_espera_id || waitingListPayload.pre_appointment_id || ""
      );
      const patientPayload = {
        name: form.name.trim(),
        cpf: toOptional(form.cpf),
        phone: form.phone.trim(),
        email: toOptional(form.email),
        notes: buildPatientNotes(form, preAppointmentId, toOptional(duplicateJustification)),
        status_jornada: "em_fila_espera",
        ...(form.date_of_birth ? { date_of_birth: form.date_of_birth } : {}),
        ...(preAppointmentId ? { source_pre_appointment_id: preAppointmentId } : {}),
      };

      try {
        const created = await apiService.createPatient(patientPayload);
        if (!created.success || !created.paciente?.id) {
          throw new Error(
            created.message ||
              "Nao foi possivel concluir a criacao do cadastro principal para a Triagem Social."
          );
        }
      } catch (error) {
        const typedError = error as ApiRequestError;
        const duplicateId = typedError?.existing_patient_id || undefined;

        if (
          typedError?.status === 409 &&
          preAppointmentId &&
          duplicateId &&
          typedError.requires_link_confirmation
        ) {
          const shouldLink = window.confirm(
            `Ja existe cadastro da crianca (ID ${duplicateId}). Deseja vincular este registro da fila de espera ao cadastro existente?`
          );

          if (!shouldLink) {
            throw new Error(
              "Conversao nao concluida. Confirme a vinculacao ao cadastro existente para disponibilizar o caso na Triagem Social."
            );
          }

          const linked = await apiService.createPatient({
            ...patientPayload,
            source_pre_appointment_id: preAppointmentId,
            link_existing_patient_id: duplicateId,
          });

          if (!linked.success || !linked.paciente?.id) {
            throw new Error(
              linked.message ||
                "Nao foi possivel vincular o registro da fila de espera ao cadastro existente."
            );
          }
        } else {
          throw error;
        }
      }

      toast({
        title: "Recepcao registrada",
        description:
          "Entrada inicial concluida com validacao anti-duplicidade. O caso segue em em_fila_espera.",
      });

      const searchAfterCreate = {
        phone: form.phone,
        name: form.name,
        date_of_birth: form.date_of_birth,
      };

      setForm(INITIAL_FORM);
      setShowCreateForm(false);
      setDuplicateCandidates([]);
      setDuplicateJustification("");
      setSearch(searchAfterCreate);
      setSearchAttempted(true);

      try {
        setSearchLoading(true);
        await runReceptionSearch(searchAfterCreate);
      } finally {
        setSearchLoading(false);
      }
    } catch (error) {
      const typedError = error as ApiRequestError;
      const payload =
        typedError?.payload && typeof typedError.payload === "object"
          ? typedError.payload
          : null;

      if (
        (typedError?.status === 409 || typedError?.status === 403) &&
        payload &&
        Array.isArray(payload.exact_matches) &&
        Array.isArray(payload.similar_matches)
      ) {
        const blockedResponse: ReceptionSearchResponse = {
          scenario:
            typedError?.code === "duplicate_patient_detected" ? "found" : "possible_duplicate",
          found: typedError?.code === "duplicate_patient_detected",
          exact_matches: payload.exact_matches as ReceptionSearchMatch[],
          similar_matches: payload.similar_matches as ReceptionSearchMatch[],
          message: typeof payload.message === "string" ? payload.message : undefined,
        };
        setSearchResponse(blockedResponse);
        setSearchAttempted(true);
        setShowCreateForm(false);
        setDuplicateCandidates(blockedResponse.similar_matches);
      }

      if (typedError?.status === 403 && typedError?.code === "duplicate_override_forbidden") {
        toast({
          title: "Permissao insuficiente",
          description:
            typedError.message ||
            "Seu perfil nao pode autorizar excecao de duplicidade para criar novo cadastro.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao salvar",
          description:
            error instanceof Error ? error.message : "Nao foi possivel registrar a entrada inicial.",
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fila de Espera</h1>
        <p className="text-sm text-muted-foreground">
          Fluxo guiado da recepcao: consultar cadastro existente, tratar duplicidade e cadastrar apenas quando necessario.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Consultar solicitacao
          </CardTitle>
          <CardDescription>
            Primeiro passo obrigatorio. Use Telefone + Data de nascimento ou Nome + Data de nascimento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearchSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="search-phone">Telefone</Label>
                <Input
                  id="search-phone"
                  value={search.phone}
                  onChange={(event) => setSearch((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="search-name">Nome da crianca</Label>
                <Input
                  id="search-name"
                  value={search.name}
                  onChange={(event) => setSearch((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="search-dob">Data de nascimento</Label>
                <Input
                  id="search-dob"
                  type="date"
                  value={search.date_of_birth}
                  onChange={(event) =>
                    setSearch((prev) => ({ ...prev, date_of_birth: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch(INITIAL_SEARCH);
                  setSearchResponse(null);
                  setSearchAttempted(false);
                  setShowCreateForm(false);
                  setDuplicateCandidates([]);
                  setDuplicateJustification("");
                }}
              >
                Limpar consulta
              </Button>
              <Button type="submit" disabled={searchLoading}>
                {searchLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Consultando...
                  </>
                ) : (
                  "Consultar"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {searchResponse?.scenario === "found" && selectedExistingCase ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck2 className="h-5 w-5" />
              Cadastro encontrado
            </CardTitle>
            <CardDescription>Nao crie novo cadastro. Continue pelo registro existente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <p className="text-sm"><strong>Crianca:</strong> {selectedExistingCase.child_name || "-"}</p>
              <p className="text-sm"><strong>Responsavel:</strong> {selectedExistingCase.responsible_name || "-"}</p>
              <p className="text-sm"><strong>Telefone:</strong> {selectedExistingCase.phone || "-"}</p>
              <p className="text-sm"><strong>Data de nascimento:</strong> {formatDate(selectedExistingCase.date_of_birth)}</p>
              <p className="text-sm flex items-center gap-2">
                <strong>Status da jornada:</strong>
                <JourneyStatusBadge status={selectedExistingCase.status_jornada || "em_fila_espera"} />
              </p>
              <p className="text-sm"><strong>Data de entrada:</strong> {formatDateTime(selectedExistingCase.entry_date)}</p>
              <p className="text-sm md:col-span-2"><strong>Observacao recente:</strong> {selectedExistingCase.recent_note || "-"}</p>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenEditDialog(selectedExistingCase)}
              >
                Editar dados basicos
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleGoToCorrectStage(selectedExistingCase)}
              >
                Ir para etapa correta
              </Button>
              <Button type="button" onClick={() => handleOpenExisting(selectedExistingCase.patient_id)}>
                Abrir cadastro
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {searchResponse?.scenario === "possible_duplicate" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Possivel duplicidade detectada
            </CardTitle>
            <CardDescription>
              Revise os cadastros abaixo antes de criar novo. Novo cadastro so e permitido com justificativa rastreavel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {combinedSearchCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nao foi possivel listar candidatos similares.</p>
            ) : (
              <div className="space-y-3">
                {combinedSearchCandidates.map((candidate) => (
                  <div key={candidate.patient_id} className="rounded-md border p-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <p className="text-sm"><strong>Crianca:</strong> {candidate.child_name || "-"}</p>
                      <p className="text-sm"><strong>Responsavel:</strong> {candidate.responsible_name || "-"}</p>
                      <p className="text-sm"><strong>Telefone:</strong> {candidate.phone || "-"}</p>
                      <p className="text-sm"><strong>Nascimento:</strong> {formatDate(candidate.date_of_birth)}</p>
                      <p className="text-sm flex items-center gap-2">
                        <strong>Status:</strong>
                        <JourneyStatusBadge status={candidate.status_jornada || "em_fila_espera"} />
                      </p>
                      <p className="text-sm"><strong>Entrada:</strong> {formatDateTime(candidate.entry_date)}</p>
                      <p className="text-sm md:col-span-2"><strong>Observacao:</strong> {candidate.recent_note || "-"}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => handleOpenExisting(candidate.patient_id)}>
                        Abrir cadastro
                      </Button>
                      <Button type="button" variant="outline" onClick={() => handleOpenEditDialog(candidate)}>
                        Editar dados basicos
                      </Button>
                      <Button type="button" variant="outline" onClick={() => handleGoToCorrectStage(candidate)}>
                        Ir para etapa correta
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 rounded-md border border-dashed p-3">
              <Label htmlFor="duplicate-justification">
                Justificativa obrigatoria para novo cadastro
              </Label>
              <Textarea
                id="duplicate-justification"
                value={duplicateJustification}
                onChange={(event) => setDuplicateJustification(event.target.value)}
                placeholder="Explique por que o novo cadastro e necessario mesmo com similaridade."
                className="min-h-[90px]"
              />
              {!canAuthorizeDuplicateOverride ? (
                <p className="text-xs text-amber-700">
                  Seu perfil nao possui permissao para autorizar excecao de duplicidade.
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => startCreateFlowFromSearch(true)}
                  disabled={
                    duplicateJustification.trim().length === 0 || !canAuthorizeDuplicateOverride
                  }
                >
                  Criar nova solicitacao com estes dados
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {searchResponse?.scenario === "not_found" ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum cadastro encontrado</CardTitle>
            <CardDescription>Os dados consultados serao reaproveitados para iniciar o cadastro.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Prossiga para novo cadastro com nome, telefone e data de nascimento pre-preenchidos.
            </p>
            <Button type="button" onClick={() => startCreateFlowFromSearch(false)}>
              Criar nova solicitacao com estes dados
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {searchAttempted && !searchResponse && !searchLoading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Nao foi possivel concluir a consulta. Revise os dados e tente novamente.
          </CardContent>
        </Card>
      ) : null}

      {showCreateForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5" />
              Novo cadastro da solicitacao
            </CardTitle>
            <CardDescription>
              Novo cadastro principal sempre inicia em <code>em_fila_espera</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requiresDuplicateJustification ? (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Cadastro com risco de duplicidade. A justificativa sera registrada para rastreabilidade.
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Nome da crianca *</Label>
                  <Input value={form.name} onChange={(event) => updateField("name", event.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Data de nascimento *</Label>
                  <Input
                    type="date"
                    value={form.date_of_birth}
                    onChange={(event) => updateField("date_of_birth", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>CPF (opcional)</Label>
                  <Input value={form.cpf} onChange={(event) => updateField("cpf", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Telefone principal *</Label>
                  <Input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>E-mail *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Responsavel</Label>
                  <Input
                    value={form.responsible_name}
                    onChange={(event) => updateField("responsible_name", event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sexo</Label>
                  <Select value={form.sex} onValueChange={(value) => updateField("sex", value)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="nao_informado">Nao informar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Urgencia</Label>
                  <Select
                    value={form.urgency}
                    onValueChange={(value: "normal" | "prioritario") => updateField("urgency", value)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="prioritario">Prioritario</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Servicos desejados *</Label>
                <div className="rounded-md border p-3">
                  {loadingServices ? (
                    <p className="text-sm text-muted-foreground">Carregando servicos...</p>
                  ) : services.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum servico ativo encontrado.</p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                      {services.map((service) => (
                        <label key={service.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={form.services.includes(service.id)}
                            onCheckedChange={() => toggleService(service.id)}
                          />
                          <span>{getServiceLabel(service.name)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Como conheceu?</Label>
                  <Select value={form.how_heard} onValueChange={(value) => updateField("how_heard", value)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {HOW_HEARD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Encaminhado por</Label>
                  <Select value={form.referred_by} onValueChange={(value) => updateField("referred_by", value)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {REFERRED_BY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.how_heard === "outro" ? (
                  <div className="space-y-1">
                    <Label>Outro canal</Label>
                    <Input
                      value={form.how_heard_other}
                      onChange={(event) => updateField("how_heard_other", event.target.value)}
                    />
                  </div>
                ) : null}
                {form.referred_by === "outro" ? (
                  <div className="space-y-1">
                    <Label>Outro encaminhamento</Label>
                    <Input
                      value={form.referred_by_other}
                      onChange={(event) => updateField("referred_by_other", event.target.value)}
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Possui laudo?</Label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" checked={form.has_report} onChange={() => updateField("has_report", true)} />
                      Sim
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" checked={!form.has_report} onChange={() => updateField("has_report", false)} />
                      Nao
                    </label>
                  </div>
                  {form.has_report ? (
                    <Input value={form.cid} onChange={(event) => updateField("cid", event.target.value)} placeholder="CID" />
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label>Observacoes iniciais</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                    className="min-h-[110px]"
                  />
                </div>
              </div>

              {requiresDuplicateJustification ? (
                <div className="space-y-1">
                  <Label>Justificativa de novo cadastro *</Label>
                  <Textarea
                    value={duplicateJustification}
                    onChange={(event) => setDuplicateJustification(event.target.value)}
                    className="min-h-[90px]"
                    placeholder="Justificativa obrigatoria para prosseguir."
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                  Voltar para consulta
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/triagem-social")}>
                  Abrir Triagem Social
                </Button>
                <Button type="submit" disabled={submitting || !canSubmit}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Criar nova solicitacao com estes dados"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditingPatientId(null);
            setEditForm(INITIAL_EDIT_FORM);
            setEditBaseline(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar dados basicos</DialogTitle>
            <DialogDescription>
              Atualizacao direta do cadastro principal com rastreabilidade de recepcao.
            </DialogDescription>
          </DialogHeader>

          {editLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando cadastro...
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label>Nome da crianca *</Label>
                <Input
                  value={editForm.name}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Data de nascimento</Label>
                <Input
                  type="date"
                  value={editForm.date_of_birth}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, date_of_birth: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input
                  value={editForm.cpf}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, cpf: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input
                  value={editForm.phone}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Observacoes</Label>
                <Textarea
                  value={editForm.notes}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                  className="min-h-[120px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSaveBasicEdit()} disabled={editLoading || editSaving}>
              {editSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar alteracoes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
