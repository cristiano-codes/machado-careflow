import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JourneyStatusBadge } from "@/components/status";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import {
  apiService,
  type SocialTriageHistoryItem,
  type SocialTriageQueueFilters,
  type SocialTriageQueueItem,
  type SocialTriageQueueSummary,
} from "@/services/api";
import {
  CalendarPlus,
  ClipboardPlus,
  FileSearch,
  History,
  Loader2,
  Phone,
  RefreshCw,
  UserCog,
} from "lucide-react";

type FilterState = {
  q: string;
  child_name: string;
  responsible_name: string;
  phone: string;
  neighborhood: string;
  triagem_responsavel: string;
  triagem_status: string;
  triagem_prioridade: string;
  has_report: string;
  service_type: string;
  interview_scheduled: string;
  date_from: string;
  date_to: string;
  sort: "oldest" | "newest" | "priority" | "name" | "next_action";
};

const INITIAL_FILTERS: FilterState = {
  q: "",
  child_name: "",
  responsible_name: "",
  phone: "",
  neighborhood: "",
  triagem_responsavel: "",
  triagem_status: "all",
  triagem_prioridade: "all",
  has_report: "all",
  service_type: "",
  interview_scheduled: "all",
  date_from: "",
  date_to: "",
  sort: "oldest",
};

const EMPTY_SUMMARY: SocialTriageQueueSummary = {
  total_em_fila: 0,
  novos_casos: 0,
  sem_contato: 0,
  em_andamento: 0,
  apto_para_agendamento: 0,
  entrevista_agendada: 0,
};

function toOptional(value: string) {
  const normalized = (value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function triageStatusLabel(value: string | null | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "Nao definido";
  const labels: Record<string, string> = {
    novo: "Novo",
    sem_contato: "Sem contato",
    tentativa_contato: "Tentativa de contato",
    aguardando_retorno: "Aguardando retorno",
    em_atendimento_social: "Em atendimento social",
    pre_cadastro_em_andamento: "Pre-cadastro em andamento",
    aguardando_documentos: "Aguardando documentos",
    apto_para_agendamento: "Apto para agendamento",
    entrevista_agendada: "Entrevista agendada",
    pausa_operacional: "Pausa operacional",
  };
  return labels[normalized] || normalized;
}

function triageStatusBadgeVariant(
  value: string | null | undefined
): "default" | "secondary" | "outline" {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "apto_para_agendamento" || normalized === "entrevista_agendada") {
    return "default";
  }
  if (
    normalized === "tentativa_contato" ||
    normalized === "aguardando_retorno" ||
    normalized === "em_atendimento_social" ||
    normalized === "pre_cadastro_em_andamento" ||
    normalized === "aguardando_documentos"
  ) {
    return "outline";
  }
  return "secondary";
}

function triagePriorityLabel(value: string | null | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "urgente") return "Urgente";
  if (normalized === "prioritario") return "Prioritario";
  return "Normal";
}

export default function TriagemSocial() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const { canView, canCreate, canEdit } = useModulePermissions("triagem_social");

  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [items, setItems] = useState<SocialTriageQueueItem[]>([]);
  const [summary, setSummary] = useState<SocialTriageQueueSummary>(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingPatientId, setActionLoadingPatientId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<SocialTriageHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canWrite = canEdit || canCreate;

  const appliedFilterPayload = useMemo<SocialTriageQueueFilters>(
    () => ({
      q: toOptional(appliedFilters.q),
      child_name: toOptional(appliedFilters.child_name),
      responsible_name: toOptional(appliedFilters.responsible_name),
      phone: toOptional(appliedFilters.phone),
      neighborhood: toOptional(appliedFilters.neighborhood),
      triagem_responsavel: toOptional(appliedFilters.triagem_responsavel),
      triagem_status: appliedFilters.triagem_status !== "all" ? appliedFilters.triagem_status : null,
      triagem_prioridade:
        appliedFilters.triagem_prioridade !== "all" ? appliedFilters.triagem_prioridade : null,
      has_report:
        appliedFilters.has_report === "with"
          ? true
          : appliedFilters.has_report === "without"
            ? false
            : null,
      service_type: toOptional(appliedFilters.service_type),
      interview_scheduled:
        appliedFilters.interview_scheduled === "with"
          ? true
          : appliedFilters.interview_scheduled === "without"
            ? false
            : null,
      date_from: toOptional(appliedFilters.date_from),
      date_to: toOptional(appliedFilters.date_to),
      sort: appliedFilters.sort,
      limit: 50,
      offset: 0,
    }),
    [appliedFilters]
  );

  const selectedItem = useMemo(
    () => items.find((item) => item.patient_id === selectedPatientId) || null,
    [items, selectedPatientId]
  );

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getSocialTriageQueue(appliedFilterPayload);
      setItems(response.items);
      setSummary(response.summary);
      setTotal(response.total);
      setSelectedPatientId((current) => {
        if (!current) return response.items[0]?.patient_id || null;
        return response.items.some((item) => item.patient_id === current)
          ? current
          : response.items[0]?.patient_id || null;
      });
    } catch (fetchError) {
      setItems([]);
      setSummary(EMPTY_SUMMARY);
      setTotal(0);
      setError("Nao foi possivel carregar a fila operacional da triagem social.");
      toast({
        title: "Triagem Social",
        description:
          fetchError instanceof Error ? fetchError.message : "Falha ao carregar fila operacional.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [appliedFilterPayload, toast]);

  const loadHistory = useCallback(
    async (patientId: string) => {
      try {
        setHistoryLoading(true);
        const response = await apiService.getSocialTriageHistory(patientId, 50);
        setHistoryItems(response.items);
      } catch (fetchError) {
        setHistoryItems([]);
        toast({
          title: "Historico da triagem",
          description:
            fetchError instanceof Error ? fetchError.message : "Falha ao carregar historico.",
          variant: "destructive",
        });
      } finally {
        setHistoryLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!canView) return;
    void loadQueue();
  }, [canView, loadQueue]);

  useEffect(() => {
    if (!selectedPatientId) {
      setHistoryItems([]);
      return;
    }
    void loadHistory(selectedPatientId);
  }, [loadHistory, selectedPatientId]);

  const setFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const applyFilters = () => {
    setAppliedFilters(filters);
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
  };

  const runPatch = async (
    patientId: string,
    payload: Parameters<typeof apiService.patchSocialTriage>[1],
    successMessage: string
  ) => {
    try {
      setActionLoadingPatientId(patientId);
      await apiService.patchSocialTriage(patientId, payload);
      toast({
        title: "Triagem Social",
        description: successMessage,
      });
      await loadQueue();
      if (selectedPatientId === patientId) {
        await loadHistory(patientId);
      }
      return true;
    } catch (patchError) {
      toast({
        title: "Triagem Social",
        description:
          patchError instanceof Error ? patchError.message : "Nao foi possivel atualizar o caso.",
        variant: "destructive",
      });
      return false;
    } finally {
      setActionLoadingPatientId(null);
    }
  };

  const handleRegisterContact = async (item: SocialTriageQueueItem) => {
    const note = window.prompt("Descreva a tentativa/registro de contato:");
    if (note === null) return;
    const trimmed = note.trim();
    if (!trimmed) return;

    await runPatch(
      item.patient_id,
      {
        action_type: "registro_contato",
        note: trimmed,
        triagem_status: "tentativa_contato",
        triagem_last_contact_at: new Date().toISOString(),
      },
      "Contato registrado sem alterar status_jornada."
    );
  };

  const handleAddNote = async (item: SocialTriageQueueItem) => {
    const note = window.prompt("Digite a observacao de triagem:");
    if (note === null) return;
    const trimmed = note.trim();
    if (!trimmed) return;

    await runPatch(
      item.patient_id,
      {
        action_type: "observacao_relevante",
        note: trimmed,
      },
      "Observacao registrada no historico."
    );
  };

  const handleSetPriority = async (item: SocialTriageQueueItem) => {
    const raw = window.prompt(
      "Prioridade (normal, prioritario ou urgente):",
      item.triagem_prioridade || "normal"
    );
    if (raw === null) return;
    const next = raw.trim().toLowerCase();
    if (!["normal", "prioritario", "urgente"].includes(next)) {
      toast({
        title: "Prioridade invalida",
        description: "Use apenas normal, prioritario ou urgente.",
        variant: "destructive",
      });
      return;
    }

    await runPatch(
      item.patient_id,
      {
        action_type: "mudanca_prioridade",
        triagem_prioridade: next,
      },
      "Prioridade operacional atualizada."
    );
  };

  const handleAssignToCurrentUser = async (item: SocialTriageQueueItem) => {
    await runPatch(
      item.patient_id,
      {
        action_type: "atribuicao_responsavel",
        triagem_responsavel_id: userProfile?.id ? String(userProfile.id) : null,
        triagem_responsavel_nome: userProfile?.name || userProfile?.username || userProfile?.email || null,
      },
      "Responsavel da triagem atualizado."
    );
  };

  const handleGoToPreCadastro = async (item: SocialTriageQueueItem) => {
    const ok = await runPatch(
      item.patient_id,
      {
        action_type: "iniciar_pre_cadastro",
        triagem_status: "pre_cadastro_em_andamento",
      },
      "Fluxo de pre-cadastro sinalizado no historico da triagem."
    );
    if (ok) {
      navigate(`/pre-cadastro?patient_id=${encodeURIComponent(item.patient_id)}&entry=triagem_social`);
    }
  };

  const handleScheduleInterview = async (item: SocialTriageQueueItem) => {
    try {
      setActionLoadingPatientId(item.patient_id);
      await apiService.startSocialTriageAgenda(item.patient_id);
      toast({
        title: "Agendamento",
        description: "Acao registrada. Abrindo Agenda para concluir o compromisso.",
      });
      navigate(`/agenda?patient_id=${encodeURIComponent(item.patient_id)}&entry=triagem_social`);
    } catch (scheduleError) {
      toast({
        title: "Agendamento",
        description:
          scheduleError instanceof Error
            ? scheduleError.message
            : "Nao foi possivel iniciar o agendamento.",
        variant: "destructive",
      });
    } finally {
      setActionLoadingPatientId(null);
    }
  };

  const handleMarkApto = async (item: SocialTriageQueueItem) => {
    await runPatch(
      item.patient_id,
      {
        action_type: "apto_para_agendamento",
        triagem_status: "apto_para_agendamento",
      },
      "Caso marcado como apto para agendamento."
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Triagem Social</h1>
        <p className="text-sm text-muted-foreground">
          Fila operacional do Servico Social. O status oficial da jornada permanece em{" "}
          <code>em_fila_espera</code> ate a entrevista social concluida.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total em fila</p><p className="text-2xl font-semibold">{summary.total_em_fila}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Novos casos</p><p className="text-2xl font-semibold">{summary.novos_casos}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Sem contato</p><p className="text-2xl font-semibold">{summary.sem_contato}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Em andamento</p><p className="text-2xl font-semibold">{summary.em_andamento}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Aptos para agenda</p><p className="text-2xl font-semibold">{summary.apto_para_agendamento}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Entrevista agendada</p><p className="text-2xl font-semibold">{summary.entrevista_agendada}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros da fila</CardTitle>
          <CardDescription>Busca operacional da fila de espera do Servico Social.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1"><Label>Busca geral</Label><Input value={filters.q} onChange={(e) => setFilter("q", e.target.value)} placeholder="Nome, telefone, servico..." /></div>
            <div className="space-y-1"><Label>Crianca</Label><Input value={filters.child_name} onChange={(e) => setFilter("child_name", e.target.value)} placeholder="Nome da crianca" /></div>
            <div className="space-y-1"><Label>Responsavel</Label><Input value={filters.responsible_name} onChange={(e) => setFilter("responsible_name", e.target.value)} placeholder="Nome do responsavel" /></div>
            <div className="space-y-1"><Label>Telefone</Label><Input value={filters.phone} onChange={(e) => setFilter("phone", e.target.value)} placeholder="Telefone principal" /></div>
            <div className="space-y-1"><Label>Bairro/Regiao</Label><Input value={filters.neighborhood} onChange={(e) => setFilter("neighborhood", e.target.value)} placeholder="Bairro, cidade ou estado" /></div>
            <div className="space-y-1"><Label>Responsavel da triagem</Label><Input value={filters.triagem_responsavel} onChange={(e) => setFilter("triagem_responsavel", e.target.value)} placeholder="Nome ou ID do profissional" /></div>
            <div className="space-y-1"><Label>Servico desejado</Label><Input value={filters.service_type} onChange={(e) => setFilter("service_type", e.target.value)} placeholder="Servico/interesse inicial" /></div>
            <div className="space-y-1"><Label>Ordenacao</Label><Select value={filters.sort} onValueChange={(v) => setFilter("sort", v as FilterState["sort"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="oldest">Mais antigos</SelectItem><SelectItem value="newest">Mais novos</SelectItem><SelectItem value="priority">Prioridade</SelectItem><SelectItem value="name">Nome</SelectItem><SelectItem value="next_action">Proxima acao</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Triagem</Label><Select value={filters.triagem_status} onValueChange={(v) => setFilter("triagem_status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="novo">Novo</SelectItem><SelectItem value="sem_contato">Sem contato</SelectItem><SelectItem value="tentativa_contato">Tentativa de contato</SelectItem><SelectItem value="aguardando_retorno">Aguardando retorno</SelectItem><SelectItem value="em_atendimento_social">Em atendimento social</SelectItem><SelectItem value="pre_cadastro_em_andamento">Pre-cadastro em andamento</SelectItem><SelectItem value="aguardando_documentos">Aguardando documentos</SelectItem><SelectItem value="apto_para_agendamento">Apto para agendamento</SelectItem><SelectItem value="entrevista_agendada">Entrevista agendada</SelectItem><SelectItem value="pausa_operacional">Pausa operacional</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Prioridade</Label><Select value={filters.triagem_prioridade} onValueChange={(v) => setFilter("triagem_prioridade", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="prioritario">Prioritario</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Laudo</Label><Select value={filters.has_report} onValueChange={(v) => setFilter("has_report", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="with">Com laudo</SelectItem><SelectItem value="without">Sem laudo</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Entrevista agendada</Label><Select value={filters.interview_scheduled} onValueChange={(v) => setFilter("interview_scheduled", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="with">Com entrevista</SelectItem><SelectItem value="without">Sem entrevista</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Entrada de</Label><Input type="date" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} /></div>
            <div className="space-y-1"><Label>Entrada ate</Label><Input type="date" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={clearFilters} disabled={loading}>Limpar</Button>
            <Button variant="outline" onClick={() => void loadQueue()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
            <Button onClick={applyFilters} disabled={loading}>Aplicar filtros</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fila operacional ({total})</CardTitle>
          <CardDescription>
            Status oficial e exibido separadamente da situacao operacional da triagem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {loading ? (
            <div className="py-10 text-sm text-muted-foreground">Carregando fila operacional...</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-sm text-muted-foreground">Nenhum caso encontrado para os filtros selecionados.</div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Crianca</TableHead>
                      <TableHead>Responsavel / Contato</TableHead>
                      <TableHead>Entrada</TableHead>
                      <TableHead>Status oficial</TableHead>
                      <TableHead>Triagem</TableHead>
                      <TableHead>Entrevista</TableHead>
                      <TableHead className="min-w-[360px]">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.patient_id} className={selectedPatientId === item.patient_id ? "bg-muted/30" : ""}>
                        <TableCell>
                          <p className="font-medium">{item.child_name || "-"}</p>
                          <p className="text-xs text-muted-foreground">Nascimento: {formatDate(item.date_of_birth)} {item.age_years !== null && item.age_years !== undefined ? `(${item.age_years}a)` : ""}</p>
                          <p className="text-xs text-muted-foreground">Servico: {item.service_interest || "-"}</p>
                          <p className="text-xs text-muted-foreground">CID/Laudo: {item.cid || "-"} {item.has_report ? "(com laudo)" : "(sem laudo)"}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{item.responsible_name || "-"}</p>
                          <p className="text-xs text-muted-foreground">{item.main_phone || "-"}</p>
                          <p className="text-xs text-muted-foreground">{item.neighborhood || "-"}{item.city ? `, ${item.city}` : ""}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{item.entry_channel || "-"}</p>
                          <p className="text-xs text-muted-foreground">Entrada: {formatDateTime(item.entry_created_at)}</p>
                          <p className="text-xs text-muted-foreground">Ultimo contato: {formatDateTime(item.triagem_last_contact_at)}</p>
                          <p className="text-xs text-muted-foreground">Proxima acao: {formatDateTime(item.triagem_next_action_at)}</p>
                        </TableCell>
                        <TableCell>
                          <JourneyStatusBadge status={item.status_jornada || "em_fila_espera"} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={triageStatusBadgeVariant(item.triagem_status)}>
                            {triageStatusLabel(item.triagem_status)}
                          </Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Prioridade: {triagePriorityLabel(item.triagem_prioridade)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Resp: {item.triagem_responsavel_nome || "-"}
                          </p>
                          <p className="text-xs text-muted-foreground">{item.next_suggested_action || "-"}</p>
                        </TableCell>
                        <TableCell>
                          {item.entrevista_agendada ? (
                            <>
                              <Badge variant="default">Agendada</Badge>
                              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.linked_appointment_at)}</p>
                              <p className="text-xs text-muted-foreground">{item.appointment_time || ""} {item.appointment_status ? `(${item.appointment_status})` : ""}</p>
                            </>
                          ) : (
                            <Badge variant="secondary">Sem agenda</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setSelectedPatientId(item.patient_id)}>
                              <History className="mr-1 h-3.5 w-3.5" />
                              Ver historico
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => navigate(`/pre-cadastro?patient_id=${encodeURIComponent(item.patient_id)}&entry=triagem_social`)}>
                              <FileSearch className="mr-1 h-3.5 w-3.5" />
                              Abrir cadastro
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void handleGoToPreCadastro(item)} disabled={!canWrite || actionLoadingPatientId === item.patient_id}>
                              <ClipboardPlus className="mr-1 h-3.5 w-3.5" />
                              Iniciar/Continuar Pre-Cadastro
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void handleRegisterContact(item)} disabled={!canWrite || actionLoadingPatientId === item.patient_id}>
                              <Phone className="mr-1 h-3.5 w-3.5" />
                              Registrar contato
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void handleAddNote(item)} disabled={!canWrite || actionLoadingPatientId === item.patient_id}>
                              Observacao
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void handleSetPriority(item)} disabled={!canWrite || actionLoadingPatientId === item.patient_id}>
                              Prioridade
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void handleAssignToCurrentUser(item)} disabled={!canWrite || actionLoadingPatientId === item.patient_id}>
                              <UserCog className="mr-1 h-3.5 w-3.5" />
                              Atribuir a mim
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void handleMarkApto(item)} disabled={!canWrite || actionLoadingPatientId === item.patient_id}>
                              Marcar apto
                            </Button>
                            <Button size="sm" onClick={() => void handleScheduleInterview(item)} disabled={!canWrite || actionLoadingPatientId === item.patient_id}>
                              {actionLoadingPatientId === item.patient_id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                              )}
                              Agendar entrevista
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historico da triagem</CardTitle>
          <CardDescription>
            {selectedItem
              ? `Caso selecionado: ${selectedItem.child_name || selectedItem.patient_id}`
              : "Selecione um caso para visualizar o historico operacional."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="py-6 text-sm text-muted-foreground">Carregando historico...</div>
          ) : !selectedPatientId ? (
            <p className="text-sm text-muted-foreground">Nenhum caso selecionado.</p>
          ) : historyItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda nao ha registros de historico para este caso.</p>
          ) : (
            <div className="space-y-2">
              {historyItems.map((history) => (
                <div key={history.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{history.action_type || "acao"}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(history.acted_at)}</span>
                    <span className="text-xs text-muted-foreground">
                      {history.acted_by_name || history.acted_by || "usuario nao identificado"}
                    </span>
                  </div>
                  {history.field_name ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Campo: <strong>{history.field_name}</strong> | De:{" "}
                      <strong>{history.old_value || "-"}</strong> para{" "}
                      <strong>{history.new_value || "-"}</strong>
                    </p>
                  ) : null}
                  {history.note ? <p className="mt-1 text-sm">{history.note}</p> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
