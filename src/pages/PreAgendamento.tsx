import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarCheck2, Info, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  API_BASE_URL,
  apiService,
  type PreAppointmentQueueRecord,
  type PreAppointmentQueueResponse,
  type PreAppointmentQueueSummary,
} from "@/services/api";
import { getServiceLabel } from "@/utils/serviceLabels";

type ServiceOption = {
  id: string;
  name: string;
};

type ServicesResponse = {
  success?: boolean;
  services?: ServiceOption[];
};

type FormState = {
  name: string;
  date_of_birth: string;
  sex: string;
  has_report: boolean;
  cid: string;
  services: string[];
  urgency: "normal" | "prioritario";
  responsible_name: string;
  phone: string;
  whatsapp: boolean;
  email: string;
  how_heard: string;
  how_heard_other: string;
  cadunico: boolean;
  referred_by: string;
  referred_by_other: string;
  consent_whatsapp: boolean;
  consent_lgpd: boolean;
  notes: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  date_of_birth: "",
  sex: "",
  has_report: false,
  cid: "",
  services: [],
  urgency: "normal",
  responsible_name: "",
  phone: "",
  whatsapp: false,
  email: "",
  how_heard: "",
  how_heard_other: "",
  cadunico: false,
  referred_by: "",
  referred_by_other: "",
  consent_whatsapp: false,
  consent_lgpd: false,
  notes: "",
};

const HOW_HEARD_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "site", label: "Site da instituição" },
  { value: "amigos", label: "Amigos/Familiares" },
  { value: "outro", label: "Outro" },
];

const REFERRED_BY_OPTIONS = [
  { value: "escola", label: "Escola" },
  { value: "posto_saude", label: "Posto de Saúde" },
  { value: "cras", label: "CRAS" },
  { value: "hospital", label: "Hospital" },
  { value: "profissional_particular", label: "Profissional Particular" },
  { value: "outro", label: "Outro" },
];

type QueueFiltersState = {
  q: string;
  child_name: string;
  responsible_name: string;
  phone: string;
  cpf: string;
  date: string;
  service_type: string;
  cid: string;
  referred_by: string;
  status: string;
  priority: string;
  sort: string;
};

const INITIAL_QUEUE_FILTERS: QueueFiltersState = {
  q: "",
  child_name: "",
  responsible_name: "",
  phone: "",
  cpf: "",
  date: "",
  service_type: "",
  cid: "",
  referred_by: "",
  status: "all",
  priority: "all",
  sort: "oldest",
};

const INITIAL_QUEUE_SUMMARY: PreAppointmentQueueSummary = {
  pending: 0,
  in_review: 0,
  converted: 0,
  not_eligible: 0,
};

function toOptionalTrimmed(value: string) {
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

function formatAgeFromDob(value: string | null | undefined) {
  if (!value) return "-";
  const [yearText, monthText, dayText] = value.slice(0, 10).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "-";

  const today = new Date();
  let age = today.getFullYear() - year;
  const birthdayNotReached =
    today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (birthdayNotReached) age -= 1;

  return age >= 0 ? `${age}a` : "-";
}

function normalizeQueueStatusLabel(value: string | null | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "pending") return "Pendente";
  if (normalized === "in_review") return "Em analise";
  if (normalized === "selected_for_pre_cadastro") return "Selecionado para pre-cadastro";
  if (normalized === "converted") return "Convertido";
  if (normalized === "not_eligible") return "Sem perfil";
  if (normalized === "archived") return "Arquivado";
  return value || "-";
}

function getQueueStatusBadgeVariant(
  value: string | null | undefined
): "default" | "secondary" | "outline" {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "pending") return "secondary";
  if (normalized === "in_review") return "outline";
  if (normalized === "selected_for_pre_cadastro") return "default";
  if (normalized === "converted") return "default";
  if (normalized === "not_eligible" || normalized === "archived") return "outline";
  return "secondary";
}

export default function PreAgendamento() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [queueFilters, setQueueFilters] = useState<QueueFiltersState>(INITIAL_QUEUE_FILTERS);
  const [appliedQueueFilters, setAppliedQueueFilters] =
    useState<QueueFiltersState>(INITIAL_QUEUE_FILTERS);
  const [queueItems, setQueueItems] = useState<PreAppointmentQueueRecord[]>([]);
  const [queueSummary, setQueueSummary] = useState<PreAppointmentQueueSummary>(
    INITIAL_QUEUE_SUMMARY
  );
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueActionLoadingId, setQueueActionLoadingId] = useState<string | null>(null);
  const [selectedQueueItem, setSelectedQueueItem] = useState<PreAppointmentQueueRecord | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoadingServices(true);
        const response = await fetch(`${API_BASE_URL}/services?active=true`);
        const data = (await response.json()) as ServicesResponse;

        if (response.ok && data.success && Array.isArray(data.services)) {
          setServices(data.services);
          return;
        }

        throw new Error("Não foi possível carregar os serviços ativos.");
      } catch (error) {
        console.error("Erro ao carregar serviços ativos:", error);
        toast({
          title: "Serviços",
          description: "Não foi possível carregar os serviços ativos.",
          variant: "destructive",
        });
      } finally {
        setLoadingServices(false);
      }
    };

    void loadServices();
  }, [toast]);

  const selectedServicesCount = form.services.length;

  const canSubmit = useMemo(() => {
    return (
      form.name.trim().length > 0 &&
      form.phone.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.services.length > 0 &&
      form.consent_lgpd
    );
  }, [form]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleService = (serviceId: string) => {
    setForm((prev) => {
      const exists = prev.services.includes(serviceId);
      return {
        ...prev,
        services: exists
          ? prev.services.filter((id) => id !== serviceId)
          : [...prev.services, serviceId],
      };
    });
  };

  const updateQueueFilter = <K extends keyof QueueFiltersState>(
    key: K,
    value: QueueFiltersState[K]
  ) => {
    setQueueFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const loadQueue = useCallback(
    async (filters: QueueFiltersState) => {
      setQueueLoading(true);
      setQueueError(null);

      try {
        const response: PreAppointmentQueueResponse = await apiService.getPreAppointmentTriageQueue({
          q: toOptionalTrimmed(filters.q),
          child_name: toOptionalTrimmed(filters.child_name),
          responsible_name: toOptionalTrimmed(filters.responsible_name),
          phone: toOptionalTrimmed(filters.phone),
          cpf: toOptionalTrimmed(filters.cpf),
          date: toOptionalTrimmed(filters.date),
          service_type: toOptionalTrimmed(filters.service_type),
          cid: toOptionalTrimmed(filters.cid),
          referred_by: toOptionalTrimmed(filters.referred_by),
          status: filters.status !== "all" ? filters.status : null,
          priority: filters.priority !== "all" ? filters.priority : null,
          sort: filters.sort || "oldest",
          limit: 50,
          offset: 0,
        });

        setQueueItems(response.items);
        setQueueSummary(response.summary || INITIAL_QUEUE_SUMMARY);
        setQueueTotal(response.total);
        setSelectedQueueItem((current) => {
          if (!current?.id) return current;
          const refreshed = response.items.find((item) => item.id === current.id);
          return refreshed || null;
        });
      } catch (error) {
        setQueueItems([]);
        setQueueSummary(INITIAL_QUEUE_SUMMARY);
        setQueueTotal(0);
        setQueueError("Nao foi possivel carregar a fila de triagem.");
        toast({
          title: "Fila de triagem",
          description:
            error instanceof Error ? error.message : "Falha ao carregar pre-agendamentos.",
          variant: "destructive",
        });
      } finally {
        setQueueLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadQueue(appliedQueueFilters);
  }, [appliedQueueFilters, loadQueue]);

  const handleApplyQueueFilters = () => {
    setAppliedQueueFilters(queueFilters);
  };

  const handleClearQueueFilters = () => {
    setQueueFilters(INITIAL_QUEUE_FILTERS);
    setAppliedQueueFilters(INITIAL_QUEUE_FILTERS);
    setSelectedQueueItem(null);
  };

  const runQueueAction = async (
    preAppointmentId: string,
    payload: { status?: string | null; note?: string | null; append_note?: boolean },
    successDescription: string
  ) => {
    try {
      setQueueActionLoadingId(preAppointmentId);
      const updated = await apiService.updatePreAppointmentTriage(preAppointmentId, payload);
      toast({
        title: "Fila de triagem",
        description: successDescription,
      });

      if (updated) {
        setSelectedQueueItem((current) => (current?.id === updated.id ? updated : current));
      }

      await loadQueue(appliedQueueFilters);
      return updated;
    } catch (error) {
      toast({
        title: "Fila de triagem",
        description:
          error instanceof Error ? error.message : "Nao foi possivel atualizar este item.",
        variant: "destructive",
      });
      return null;
    } finally {
      setQueueActionLoadingId(null);
    }
  };

  const handleMarkInReview = async (item: PreAppointmentQueueRecord) => {
    await runQueueAction(item.id, { status: "in_review" }, "Pre-agendamento marcado em analise.");
  };

  const handleMarkNotEligible = async (item: PreAppointmentQueueRecord) => {
    await runQueueAction(item.id, { status: "not_eligible" }, "Pre-agendamento marcado sem perfil.");
  };

  const handleAddObservation = async (item: PreAppointmentQueueRecord) => {
    const note = window.prompt("Adicionar observacao para este pre-agendamento:");
    if (note === null) return;

    const trimmedNote = note.trim();
    if (!trimmedNote) {
      toast({
        title: "Fila de triagem",
        description: "A observacao nao pode ficar vazia.",
        variant: "destructive",
      });
      return;
    }

    await runQueueAction(
      item.id,
      { note: trimmedNote, append_note: true },
      "Observacao adicionada ao pre-agendamento."
    );
  };

  const handlePullToPreCadastro = async (item: PreAppointmentQueueRecord) => {
    const updated = await runQueueAction(
      item.id,
      { status: "selected_for_pre_cadastro" },
      "Caso sinalizado para importacao no pre-cadastro."
    );

    if (!updated) return;

    navigate(
      `/pre-cadastro?entry_mode=import&source_pre_appointment_id=${encodeURIComponent(item.id)}`
    );
  };

  const validateBeforeSubmit = () => {
    if (!form.name.trim()) {
      throw new Error("Nome é obrigatório.");
    }
    if (!form.phone.trim()) {
      throw new Error("Telefone é obrigatório.");
    }
    if (!form.email.trim()) {
      throw new Error("E-mail é obrigatório.");
    }
    if (form.services.length < 1) {
      throw new Error("Selecione pelo menos 1 serviço.");
    }
    if (!form.consent_lgpd) {
      throw new Error("Você precisa aceitar o consentimento LGPD.");
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      validateBeforeSubmit();
    } catch (error) {
      toast({
        title: "Validação",
        description: error instanceof Error ? error.message : "Dados obrigatórios ausentes.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE_URL}/pre-appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          date_of_birth: form.date_of_birth || null,
          sex: form.sex || null,
          has_report: form.has_report,
          cid: form.has_report ? form.cid.trim() || null : null,
          services: form.services,
          urgency: form.urgency,
          responsible_name: form.responsible_name.trim() || null,
          phone: form.phone.trim(),
          whatsapp: form.whatsapp,
          email: form.email.trim(),
          how_heard: form.how_heard || null,
          how_heard_other: form.how_heard === "outro" ? form.how_heard_other.trim() || null : null,
          cadunico: form.cadunico,
          referred_by: form.referred_by || null,
          referred_by_other:
            form.referred_by === "outro" ? form.referred_by_other.trim() || null : null,
          consent_whatsapp: form.consent_whatsapp,
          consent_lgpd: form.consent_lgpd,
          notes: form.notes.trim() || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.success !== true) {
        throw new Error(
          (typeof data?.message === "string" && data.message) ||
            "Não foi possível enviar a solicitação."
        );
      }

      toast({
        title: "Solicitação enviada",
        description: data.message || "Solicitação enviada com sucesso.",
      });

      setForm(INITIAL_FORM);
      await loadQueue(appliedQueueFilters);
    } catch (error) {
      console.error("Erro ao enviar solicitação:", error);
      toast({
        title: "Erro ao enviar",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível enviar a solicitação de atendimento.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Solicitação de Atendimento</h1>
          <p className="text-sm text-muted-foreground">
            Preencha as informações abaixo para solicitar triagem. Esta tela nao altera o status
            principal da jornada, que continua em fila de espera ate a entrevista social.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fila de Triagem do Servico Social</CardTitle>
            <CardDescription>
              Lista operacional para decidir qual pre-agendamento deve ser puxado primeiro para o
              pre-cadastro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-semibold">{queueSummary.pending}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Em analise</p>
                <p className="text-2xl font-semibold">{queueSummary.in_review}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Convertidos</p>
                <p className="text-2xl font-semibold">{queueSummary.converted}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Sem perfil</p>
                <p className="text-2xl font-semibold">{queueSummary.not_eligible}</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="queue-q">Termo livre</Label>
                <Input
                  id="queue-q"
                  value={queueFilters.q}
                  onChange={(event) => updateQueueFilter("q", event.target.value)}
                  placeholder="Nome, telefone, CID, origem..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-child-name">Crianca</Label>
                <Input
                  id="queue-child-name"
                  value={queueFilters.child_name}
                  onChange={(event) => updateQueueFilter("child_name", event.target.value)}
                  placeholder="Nome da crianca"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-responsible-name">Responsavel</Label>
                <Input
                  id="queue-responsible-name"
                  value={queueFilters.responsible_name}
                  onChange={(event) => updateQueueFilter("responsible_name", event.target.value)}
                  placeholder="Nome do responsavel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-phone">Telefone</Label>
                <Input
                  id="queue-phone"
                  value={queueFilters.phone}
                  onChange={(event) => updateQueueFilter("phone", event.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-cpf">CPF</Label>
                <Input
                  id="queue-cpf"
                  value={queueFilters.cpf}
                  onChange={(event) => updateQueueFilter("cpf", event.target.value)}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-date">Data</Label>
                <Input
                  id="queue-date"
                  type="date"
                  value={queueFilters.date}
                  onChange={(event) => updateQueueFilter("date", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-service">Servico/especialidade</Label>
                <Input
                  id="queue-service"
                  value={queueFilters.service_type}
                  onChange={(event) => updateQueueFilter("service_type", event.target.value)}
                  placeholder="Ex.: psicologia"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-cid">CID/hipotese</Label>
                <Input
                  id="queue-cid"
                  value={queueFilters.cid}
                  onChange={(event) => updateQueueFilter("cid", event.target.value)}
                  placeholder="Ex.: F84"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-referred">Origem encaminhamento</Label>
                <Input
                  id="queue-referred"
                  value={queueFilters.referred_by}
                  onChange={(event) => updateQueueFilter("referred_by", event.target.value)}
                  placeholder="Escola, UBS, CRAS..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-status">Status</Label>
                <Select
                  value={queueFilters.status}
                  onValueChange={(value) => updateQueueFilter("status", value)}
                >
                  <SelectTrigger id="queue-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="in_review">Em analise</SelectItem>
                    <SelectItem value="selected_for_pre_cadastro">
                      Selecionado para pre-cadastro
                    </SelectItem>
                    <SelectItem value="converted">Convertidos</SelectItem>
                    <SelectItem value="not_eligible">Sem perfil</SelectItem>
                    <SelectItem value="archived">Arquivados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-priority">Prioridade</Label>
                <Select
                  value={queueFilters.priority}
                  onValueChange={(value) => updateQueueFilter("priority", value)}
                >
                  <SelectTrigger id="queue-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="prioritario">Prioritario</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="queue-sort">Ordenacao</Label>
                <Select
                  value={queueFilters.sort}
                  onValueChange={(value) => updateQueueFilter("sort", value)}
                >
                  <SelectTrigger id="queue-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oldest">Mais antigos</SelectItem>
                    <SelectItem value="newest">Mais recentes</SelectItem>
                    <SelectItem value="priority">Prioridade</SelectItem>
                    <SelectItem value="name">Nome</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleApplyQueueFilters} disabled={queueLoading}>
                {queueLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Buscar
              </Button>
              <Button variant="outline" onClick={handleClearQueueFilters} disabled={queueLoading}>
                Limpar
              </Button>
              <span className="text-xs text-muted-foreground">{queueTotal} registro(s)</span>
            </div>

            {queueError ? (
              <Alert variant="destructive">
                <Info className="h-4 w-4" />
                <AlertTitle>Falha ao carregar fila</AlertTitle>
                <AlertDescription>{queueError}</AlertDescription>
              </Alert>
            ) : null}

            {queueLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando fila de triagem...
              </p>
            ) : null}

            {!queueLoading && queueItems.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Nenhum pre-agendamento encontrado com os filtros atuais.
              </p>
            ) : null}

            {!queueLoading && queueItems.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Crianca</TableHead>
                      <TableHead>Responsavel</TableHead>
                      <TableHead>Servico/CID</TableHead>
                      <TableHead>Solicitacao</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueItems.map((item) => {
                      const statusValue =
                        item.status_operacional || item.status_normalized || item.status || "pending";
                      const actionDisabled =
                        queueActionLoadingId === item.id || statusValue === "converted";

                      return (
                        <TableRow
                          key={item.id}
                          className={selectedQueueItem?.id === item.id ? "bg-muted/40" : ""}
                        >
                          <TableCell>
                            <p className="font-medium">{item.name || "-"}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(item.date_of_birth)} ({formatAgeFromDob(item.date_of_birth)})
                            </p>
                          </TableCell>
                          <TableCell>
                            <p>{item.responsible_name || "-"}</p>
                            <p className="text-xs text-muted-foreground">{item.phone || "-"}</p>
                          </TableCell>
                          <TableCell>
                            <p>{item.requested_services || item.service_type || "-"}</p>
                            <p className="text-xs text-muted-foreground">CID: {item.cid || "-"}</p>
                          </TableCell>
                          <TableCell>
                            <p>{formatDateTime(item.created_at)}</p>
                            <p className="text-xs text-muted-foreground">
                              Prioridade: {item.urgency || "normal"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Origem: {item.referred_by || item.how_heard || "-"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getQueueStatusBadgeVariant(statusValue)}>
                              {normalizeQueueStatusLabel(statusValue)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedQueueItem(item)}
                                disabled={queueActionLoadingId === item.id}
                              >
                                Ver detalhes
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handlePullToPreCadastro(item)}
                                disabled={actionDisabled}
                              >
                                {queueActionLoadingId === item.id ? "Processando..." : "Puxar para Pre-Cadastro"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarkInReview(item)}
                                disabled={actionDisabled}
                              >
                                Marcar em analise
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarkNotEligible(item)}
                                disabled={actionDisabled}
                              >
                                Marcar sem perfil
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddObservation(item)}
                                disabled={queueActionLoadingId === item.id}
                              >
                                Adicionar observacao
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {selectedQueueItem ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Detalhes do pre-agendamento #{selectedQueueItem.id}
                  </CardTitle>
                  <CardDescription>
                    Informacoes para decisao operacional da assistente social.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 text-sm">
                    <p>
                      <strong>Crianca:</strong> {selectedQueueItem.name || "-"}
                    </p>
                    <p>
                      <strong>Nascimento:</strong> {formatDate(selectedQueueItem.date_of_birth)} (
                      {formatAgeFromDob(selectedQueueItem.date_of_birth)})
                    </p>
                    <p>
                      <strong>Responsavel:</strong> {selectedQueueItem.responsible_name || "-"}
                    </p>
                    <p>
                      <strong>Telefone:</strong> {selectedQueueItem.phone || "-"}
                    </p>
                    <p>
                      <strong>Email:</strong> {selectedQueueItem.email || "-"}
                    </p>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>
                      <strong>Servico:</strong>{" "}
                      {selectedQueueItem.requested_services || selectedQueueItem.service_type || "-"}
                    </p>
                    <p>
                      <strong>CID/Hipotese:</strong> {selectedQueueItem.cid || "-"}
                    </p>
                    <p>
                      <strong>Origem:</strong>{" "}
                      {selectedQueueItem.referred_by || selectedQueueItem.how_heard || "-"}
                    </p>
                    <p>
                      <strong>Status:</strong>{" "}
                      {normalizeQueueStatusLabel(
                        selectedQueueItem.status_operacional ||
                          selectedQueueItem.status_normalized ||
                          selectedQueueItem.status
                      )}
                    </p>
                    <p>
                      <strong>Solicitacao:</strong> {formatDateTime(selectedQueueItem.created_at)}
                    </p>
                  </div>
                  <div className="md:col-span-2 rounded-md border bg-muted/20 p-3 text-sm">
                    <p className="font-medium">Observacao resumida</p>
                    <p className="mt-1 text-muted-foreground">
                      {selectedQueueItem.observacao_resumida || selectedQueueItem.notes || "-"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-6">
            <Card>
              <CardHeader className="pb-3">
              <CardTitle className="text-base">Etapas do Atendimento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <ol className="space-y-2">
                  <li className="flex items-center gap-2 text-sm">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      1
                    </span>
                    <span className="text-muted-foreground">Dados do Usuário</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      2
                    </span>
                    <span className="text-muted-foreground">Dados do Responsável</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      3
                    </span>
                    <span className="text-muted-foreground">Serviços desejados</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      4
                    </span>
                    <span className="text-muted-foreground">Revisão e Envio</span>
                  </li>
                </ol>
                <p className="pt-2 text-xs text-muted-foreground">
                  A solicitação organiza a recepção, mas o caso permanece em em_fila_espera até a
                  abertura formal do fluxo institucional.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Orientações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Campos com * são obrigatórios.</li>
                  <li>Após o envio, a solicitação entra em triagem e nao avanca a jornada oficial.</li>
                  <li>Os canais informados serão usados para contato.</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resumo Institucional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  O pre-agendamento organiza a entrada operacional e facilita a triagem inicial da
                  equipe sem substituir o cadastro principal.
                </p>
              </CardContent>
            </Card>
          </aside>

          <div className="space-y-4">
            <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Informação Institucional</AlertTitle>
        <AlertDescription>
            Esta solicitação organiza a recepção inicial. A jornada institucional continua em
            em_fila_espera ate a entrevista social, e o contato ocorre pelos canais informados.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5" />
              Solicitação de Atendimento
            </CardTitle>
            <CardDescription>
              Campos marcados com * são obrigatórios para envio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Bloco 1 - Dados do Usuário</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="name">Nome completo *</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="date_of_birth">Data de nascimento</Label>
                      <Input
                        id="date_of_birth"
                        type="date"
                        value={form.date_of_birth}
                        onChange={(e) => updateField("date_of_birth", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label>Sexo</Label>
                      <Select value={form.sex} onValueChange={(value) => updateField("sex", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="masculino">Masculino</SelectItem>
                          <SelectItem value="feminino">Feminino</SelectItem>
                          <SelectItem value="nao_informado">Não informar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Possui laudo?</Label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            checked={form.has_report === true}
                            onChange={() => updateField("has_report", true)}
                          />
                          Sim
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            checked={form.has_report === false}
                            onChange={() => updateField("has_report", false)}
                          />
                          Não
                        </label>
                      </div>
                    </div>

                    {form.has_report ? (
                      <div>
                        <Label htmlFor="cid">CID</Label>
                        <Input
                          id="cid"
                          value={form.cid}
                          onChange={(e) => updateField("cid", e.target.value)}
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label>Serviços desejados *</Label>
                      <div className="rounded-md border p-3">
                        {loadingServices ? (
                          <p className="text-sm text-muted-foreground">Carregando serviços...</p>
                        ) : services.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum serviço ativo encontrado.</p>
                        ) : (
                          <div className="space-y-2">
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
                      <p className="text-xs text-muted-foreground">
                        {selectedServicesCount} serviço(s) selecionado(s)
                      </p>
                    </div>

                    <div>
                      <Label>Urgência</Label>
                      <Select
                        value={form.urgency}
                        onValueChange={(value: "normal" | "prioritario") =>
                          updateField("urgency", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="prioritario">Prioritário</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Bloco 2 - Dados do Responsável</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="responsible_name">Nome do responsável</Label>
                      <Input
                        id="responsible_name"
                        value={form.responsible_name}
                        onChange={(e) => updateField("responsible_name", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone">Telefone *</Label>
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">Telefone é WhatsApp?</p>
                        <p className="text-xs text-muted-foreground">Habilite para comunicação rápida.</p>
                      </div>
                      <Switch
                        checked={form.whatsapp}
                        onCheckedChange={(checked) => updateField("whatsapp", checked)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="email">E-mail *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label>Como conheceu a instituição?</Label>
                      <Select value={form.how_heard} onValueChange={(value) => updateField("how_heard", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {HOW_HEARD_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {form.how_heard === "outro" ? (
                      <div>
                        <Label htmlFor="how_heard_other">Outro (especifique)</Label>
                        <Input
                          id="how_heard_other"
                          value={form.how_heard_other}
                          onChange={(e) => updateField("how_heard_other", e.target.value)}
                        />
                      </div>
                    ) : null}

                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.cadunico}
                        onCheckedChange={(checked) => updateField("cadunico", checked === true)}
                      />
                      Possui CadÚnico
                    </label>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Bloco 3 - Informações Complementares</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <Label>Encaminhado por</Label>
                        <Select value={form.referred_by} onValueChange={(value) => updateField("referred_by", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {REFERRED_BY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {form.referred_by === "outro" ? (
                        <div>
                          <Label htmlFor="referred_by_other">Outro encaminhamento</Label>
                          <Input
                            id="referred_by_other"
                            value={form.referred_by_other}
                            onChange={(e) => updateField("referred_by_other", e.target.value)}
                          />
                        </div>
                      ) : null}

                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.consent_whatsapp}
                          onCheckedChange={(checked) =>
                            updateField("consent_whatsapp", checked === true)
                          }
                        />
                        Autoriza contato via WhatsApp
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.consent_lgpd}
                          onCheckedChange={(checked) => updateField("consent_lgpd", checked === true)}
                        />
                        Consentimento LGPD * (obrigatório)
                      </label>
                    </div>

                    <div>
                      <Label htmlFor="notes">Observações</Label>
                      <Textarea
                        id="notes"
                        value={form.notes}
                        onChange={(e) => updateField("notes", e.target.value)}
                        placeholder="Informe dados relevantes para análise inicial."
                        className="min-h-[180px]"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/consultar-solicitacao")}
                >
                  Consultar minha Solicitação
                </Button>
                <Button type="submit" disabled={submitting || !canSubmit}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar Solicitação de Atendimento"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
