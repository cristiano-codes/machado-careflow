import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getJourneyStatusLabel,
  normalizeJourneyStatus as normalizeOfficialJourneyStatus,
} from "@/components/status";
import { useModulePermissions, usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import {
  apiService,
  type EvaluationDTO,
  type SocialInterviewDTO,
  type VagaDecisionValue,
} from "@/services/api";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Send, UserCheck } from "lucide-react";

type JsonRecord = Record<string, unknown>;

type PatientOption = {
  id: string;
  nome: string;
  dataNascimento: string;
  statusJornada: string;
};

type SocialInterviewSummary = {
  date: string;
  socialWorker: string;
  parecer: string;
  resultadoTerapeutico: string;
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
  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) return normalized.slice(0, 10);
  return "";
}

function normalizeJourneyStatus(rawStatus: string | undefined): string {
  return normalizeOfficialJourneyStatus(rawStatus) || "";
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

function normalizePatient(dto: unknown): PatientOption | null {
  const record = parseRecord(dto);
  const id = coerceString(record.id);
  if (!id) return null;

  return {
    id,
    nome: coerceString(record.nome || record.name),
    dataNascimento: coerceDate(record.dataNascimento || record.date_of_birth),
    statusJornada: normalizeJourneyStatus(coerceString(record.status_jornada || record.statusJornada)),
  };
}

function normalizeTechnicalStatus(rawStatus: unknown): string {
  const normalized = coerceString(rawStatus).toLowerCase();
  if (normalized === "concluida") return "concluida";
  if (normalized === "cancelada") return "cancelada";
  if (normalized === "em_andamento") return "em_andamento";
  return "agendada";
}

function normalizeEvaluation(dto: EvaluationDTO): EvaluationDTO {
  return {
    ...dto,
    status: normalizeTechnicalStatus(dto.status) as EvaluationDTO["status"],
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
    sent_to_vaga_at: dto.sent_to_vaga_at || null,
    devolutiva_date: coerceDate(dto.devolutiva_date),
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

  return {
    date: coerceDate(latest.interview_date),
    socialWorker:
      coerceString(latest.assistente_social) ||
      coerceString(latest.assistente_social_id) ||
      "Nao informado",
    parecer:
      coerceString(latest.parecer_social) ||
      coerceString(payload.parecer_social) ||
      coerceString(payload.parecerSocial),
    resultadoTerapeutico:
      coerceString(latest.resultado_terapeutas) ||
      coerceString(payload.resultado_terapeutas) ||
      coerceString(payload.resultadoTerapeutas),
  };
}

function getJourneyBadgeVariant(status: string) {
  if (status === "em_analise_vaga") return "default";
  if (status === "aprovado") return "outline";
  if (status === "encaminhado") return "secondary";
  if (status === "matriculado") return "outline";
  return "secondary";
}

export default function AnaliseVagas() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const modulePermissions = useModulePermissions("analise_vagas");

  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [evaluations, setEvaluations] = useState<EvaluationDTO[]>([]);
  const [socialInterviewSummary, setSocialInterviewSummary] = useState<SocialInterviewSummary | null>(
    null
  );

  const [patientsLoading, setPatientsLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [savingDecision, setSavingDecision] = useState(false);

  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const [decisionValue, setDecisionValue] = useState<VagaDecisionValue>("aprovado");
  const [decisionJustification, setDecisionJustification] = useState("");

  const canRegisterDecision =
    modulePermissions.canCreate ||
    modulePermissions.canEdit ||
    hasPermission("vagas", "create") ||
    hasPermission("vagas", "edit");

  const decisionScopeStatuses = useMemo(
    () => new Set(["em_analise_vaga", "aprovado", "encaminhado", "matriculado"]),
    []
  );

  const decisionQueue = useMemo(
    () => patients.filter((patient) => decisionScopeStatuses.has(patient.statusJornada)),
    [decisionScopeStatuses, patients]
  );

  const pendingDecisionQueue = useMemo(
    () => decisionQueue.filter((patient) => patient.statusJornada === "em_analise_vaga"),
    [decisionQueue]
  );

  const selectedPatient = useMemo(
    () => decisionQueue.find((patient) => patient.id === selectedPatientId) || null,
    [decisionQueue, selectedPatientId]
  );

  const metrics = useMemo(() => {
    const emAnalise = patients.filter((item) => item.statusJornada === "em_analise_vaga").length;
    const aprovados = patients.filter((item) => item.statusJornada === "aprovado").length;
    const encaminhados = patients.filter((item) => item.statusJornada === "encaminhado").length;
    const matriculados = patients.filter((item) => item.statusJornada === "matriculado").length;

    return {
      emAnalise,
      aprovados,
      encaminhados,
      matriculados,
    };
  }, [patients]);

  const individualEvaluations = useMemo(
    () => evaluations.filter((item) => item.is_stage_consolidation !== true),
    [evaluations]
  );

  const completedIndividualCount = useMemo(
    () => individualEvaluations.filter((item) => item.status === "concluida").length,
    [individualEvaluations]
  );

  const latestConsolidation = useMemo(() => {
    const consolidations = evaluations.filter((item) => item.is_stage_consolidation === true);
    if (consolidations.length === 0) return null;
    const sorted = [...consolidations].sort((left, right) => {
      const leftDate = coerceDate(left.end_date || left.start_date);
      const rightDate = coerceDate(right.end_date || right.start_date);
      return rightDate.localeCompare(leftDate);
    });
    return sorted[0];
  }, [evaluations]);

  const hasConsolidationReady =
    latestConsolidation?.status === "concluida" &&
    latestConsolidation?.checklist_ready_for_vaga === true;
  const hasBeenSentToVaga = Boolean(latestConsolidation?.sent_to_vaga_at);
  const patientInAnalysis = selectedPatient?.statusJornada === "em_analise_vaga";
  const hasDecisionInputs = completedIndividualCount > 0 && hasConsolidationReady;

  const decisionBlockedReason = useMemo(() => {
    if (!selectedPatient) return "Selecione um assistido.";
    if (!canRegisterDecision) return "Seu perfil nao possui permissao para registrar decisao.";
    if (!patientInAnalysis) return "A decisao exige status_jornada em_analise_vaga.";
    if (!hasDecisionInputs) return "Faltam insumos obrigatorios (avaliacao e consolidacao).";
    if (!decisionJustification.trim()) return "A justificativa e obrigatoria.";
    return null;
  }, [
    canRegisterDecision,
    decisionJustification,
    hasDecisionInputs,
    patientInAnalysis,
    selectedPatient,
  ]);

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const data = await apiService.getPatients();
      const normalized = (Array.isArray(data) ? data : [])
        .map(normalizePatient)
        .filter((item): item is PatientOption => item !== null);

      setPatients(normalized);
      if (normalized.length === 0) {
        setSelectedPatientId("");
        return;
      }

      const preferredQueue = normalized.filter((item) => item.statusJornada === "em_analise_vaga");
      const preferred = preferredQueue[0] || normalized[0];

      setSelectedPatientId((current) =>
        current && normalized.some((item) => item.id === current) ? current : preferred.id
      );
    } catch (error) {
      setPatients([]);
      setPatientsError("Nao foi possivel carregar assistidos para analise de vaga.");
      toast({
        title: "Analise de vaga",
        description: error instanceof Error ? error.message : "Falha ao carregar assistidos.",
        variant: "destructive",
      });
    } finally {
      setPatientsLoading(false);
    }
  }, [toast]);

  const loadPatientContext = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setEvaluations([]);
        setSocialInterviewSummary(null);
        setContextError(null);
        return;
      }

      setContextLoading(true);
      setContextError(null);

      try {
        const [evaluationsData, interviewsData] = await Promise.all([
          apiService.getEvaluations({ patient_id: patientId, include_consolidation: true }),
          apiService.getSocialInterviews(patientId),
        ]);

        setEvaluations(evaluationsData.map((evaluation) => normalizeEvaluation(evaluation)));
        setSocialInterviewSummary(summarizeSocialInterview(interviewsData));
      } catch (error) {
        setEvaluations([]);
        setSocialInterviewSummary(null);
        setContextError("Nao foi possivel carregar contexto da analise.");
        toast({
          title: "Analise de vaga",
          description: error instanceof Error ? error.message : "Falha ao carregar contexto.",
          variant: "destructive",
        });
      } finally {
        setContextLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (!selectedPatientId) {
      setEvaluations([]);
      setSocialInterviewSummary(null);
      setContextError(null);
      return;
    }
    void loadPatientContext(selectedPatientId);
  }, [loadPatientContext, selectedPatientId]);

  const handleRegisterDecision = async () => {
    if (!selectedPatient) return;
    if (decisionBlockedReason) return;

    setSavingDecision(true);
    try {
      const result = await apiService.createVagaDecision({
        assistido_id: selectedPatient.id,
        decisao: decisionValue,
        justificativa: decisionJustification.trim(),
      });

      await loadPatients();
      await loadPatientContext(selectedPatient.id);
      setDecisionJustification("");

      toast({
        title: "Decisao registrada",
        description:
          result.status_jornada_atual
            ? `Status principal da jornada atualizado para ${result.status_jornada_atual}.`
            : "Decisao salva com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao registrar decisao",
        description:
          error instanceof Error
            ? error.message
            : "Nao foi possivel registrar a decisao institucional.",
        variant: "destructive",
      });
    } finally {
      setSavingDecision(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analise de Vaga</h1>
          <p className="text-sm text-muted-foreground">
            Mesa de decisao do Servico Social com rastreabilidade exclusiva por status_jornada.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadPatients()} disabled={patientsLoading}>
          {patientsLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar fila
        </Button>
      </div>

      {patientsError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Falha na fila de analise</AlertTitle>
          <AlertDescription>{patientsError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Em analise</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{metrics.emAnalise}</div>
            <p className="text-xs text-muted-foreground">Status principal em_analise_vaga</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Aprovados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{metrics.aprovados}</div>
            <p className="text-xs text-muted-foreground">Seguem para PIA + matricula</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Encaminhados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{metrics.encaminhados}</div>
            <p className="text-xs text-muted-foreground">Encaminhamento externo formalizado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Matriculados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700">{metrics.matriculados}</div>
            <p className="text-xs text-muted-foreground">Status final da etapa de entrada</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="h-4 w-4" />
                Escopo da mesa
              </CardTitle>
              <CardDescription>
                Assistidos no escopo da analise institucional de vaga e seu historico de decisao.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {patientsLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando fila...
                </p>
              ) : null}
              {!patientsLoading && decisionQueue.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Nenhum assistido no escopo de analise/aprovado/encaminhado/matriculado.
                </p>
              ) : null}
              {!patientsLoading &&
                decisionQueue.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    className={`w-full rounded-md border p-3 text-left transition ${
                      selectedPatientId === patient.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40"
                    }`}
                    onClick={() => setSelectedPatientId(patient.id)}
                  >
                    <p className="text-sm font-medium">{patient.nome || "Assistido"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(patient.dataNascimento)}</p>
                    <div className="mt-2">
                      <Badge variant={getJourneyBadgeVariant(patient.statusJornada)}>
                        {formatJourneyStatus(patient.statusJornada)}
                      </Badge>
                    </div>
                  </button>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prioridade da etapa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="flex items-center justify-between">
                <span>Em analise pendente</span>
                <span className="font-semibold">{pendingDecisionQueue.length}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                A etapa decide entre aprovado ou encaminhado, mantendo historico auditavel da jornada.
              </p>
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contexto institucional</CardTitle>
              <CardDescription>
                Dados canonicos do assistido e status principal da jornada institucional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!selectedPatient ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Selecione um assistido da fila para iniciar a analise.
                </p>
              ) : (
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  <p className="font-medium">{selectedPatient.nome || "-"}</p>
                  <p className="text-muted-foreground">Nascimento: {formatDate(selectedPatient.dataNascimento)}</p>
                  <div className="mt-2">
                    <Badge variant={getJourneyBadgeVariant(selectedPatient.statusJornada)}>
                      {formatJourneyStatus(selectedPatient.statusJornada)}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Insumos para decisao</CardTitle>
              <CardDescription>
                Pareceres e consolidacao que sustentam a decisao da vaga sem usar fallback de
                status legado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {contextLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando insumos...
                </p>
              ) : null}
              {contextError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Falha ao carregar contexto</AlertTitle>
                  <AlertDescription>{contextError}</AlertDescription>
                </Alert>
              ) : null}
              {!contextLoading && !contextError && selectedPatient ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">Entrevista social</p>
                    {socialInterviewSummary ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Data: {formatDate(socialInterviewSummary.date)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Assistente social: {socialInterviewSummary.socialWorker || "-"}
                        </p>
                        <p className="mt-2 line-clamp-4">
                          {socialInterviewSummary.parecer || "Sem parecer social consolidado."}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhuma entrevista social registrada para este assistido.
                      </p>
                    )}
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">Consolidacao multiprofissional</p>
                    {latestConsolidation ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Encerramento: {formatDate(latestConsolidation.end_date || latestConsolidation.start_date)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Sent to vaga: {formatDate(latestConsolidation.sent_to_vaga_at)}
                        </p>
                        <p className="mt-2 line-clamp-4">
                          {latestConsolidation.report || "Sem parecer tecnico consolidado."}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Sem consolidacao multiprofissional para suporte da decisao.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checklist minimo da etapa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2">
                {completedIndividualCount > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                Avaliacao individual concluida ({completedIndividualCount})
              </p>
              <p className="flex items-center gap-2">
                {hasConsolidationReady ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                Consolidacao concluida com checklist pronto para vaga
              </p>
              <p className="flex items-center gap-2">
                {hasBeenSentToVaga ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                Registro de envio para analise de vaga
              </p>
              <p className="flex items-center gap-2">
                {patientInAnalysis ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                Status principal da jornada em_analise_vaga
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Decisao final da etapa</CardTitle>
              <CardDescription>
                Registrar decisao institucional e atualizar a jornada para aprovado ou encaminhado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="decision-select">Decisao</Label>
                  <Select
                    value={decisionValue}
                    onValueChange={(value) => setDecisionValue(value as VagaDecisionValue)}
                    disabled={!canRegisterDecision || savingDecision}
                  >
                    <SelectTrigger id="decision-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="encaminhado">Encaminhado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status atual</Label>
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    {selectedPatient ? formatJourneyStatus(selectedPatient.statusJornada) : "Nao selecionado"}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="decision-justification">Justificativa obrigatoria</Label>
                <Textarea
                  id="decision-justification"
                  value={decisionJustification}
                  onChange={(event) => setDecisionJustification(event.target.value)}
                  placeholder="Descreva base tecnica, capacidade institucional e encaminhamento da decisao."
                  disabled={!canRegisterDecision || savingDecision}
                />
              </div>

              {decisionBlockedReason ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  {decisionBlockedReason}
                </p>
              ) : null}

              <Button
                onClick={handleRegisterDecision}
                disabled={savingDecision || decisionBlockedReason !== null}
              >
                {savingDecision ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Registrar decisao institucional
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
