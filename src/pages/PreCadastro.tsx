import { useEffect, useState } from "react";
import { Info, Loader2, Search, UserPlus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  apiService,
  type ApiRequestError,
  type PatientCreateResponse,
  type PreAppointmentImportRecord,
  type PatientCreatePayload,
} from "@/services/api";

type PreCadastroFormState = {
  child_name: string;
  date_of_birth: string;
  responsible_name: string;
  phone: string;
  email: string;
  referral_source: string;
  cid_investigation: string;
  notes: string;
  cpf: string;
};

const INITIAL_FORM: PreCadastroFormState = {
  child_name: "",
  date_of_birth: "",
  responsible_name: "",
  phone: "",
  email: "",
  referral_source: "",
  cid_investigation: "",
  notes: "",
  cpf: "",
};

type EntryMode = "manual" | "import";

type PreAppointmentSearchState = {
  q: string;
  child_name: string;
  responsible_name: string;
  phone: string;
  cpf: string;
  date: string;
};

const INITIAL_PRE_APPOINTMENT_SEARCH: PreAppointmentSearchState = {
  q: "",
  child_name: "",
  responsible_name: "",
  phone: "",
  cpf: "",
  date: "",
};

function toOptionalTrimmed(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCpf(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function normalizeDateForInput(value: string | null | undefined) {
  const text = toOptionalTrimmed(value || "");
  if (!text) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const leadingDate = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (leadingDate?.[1]) {
    return leadingDate[1];
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function resolveReferralSourceFromPreAppointment(record: PreAppointmentImportRecord) {
  return toOptionalTrimmed(record.referred_by || "") || toOptionalTrimmed(record.how_heard || "");
}

function mapPreAppointmentToPreCadastroForm(record: PreAppointmentImportRecord): PreCadastroFormState {
  return {
    child_name: record.name || "",
    date_of_birth: normalizeDateForInput(record.date_of_birth),
    responsible_name: record.responsible_name || "",
    phone: record.phone || "",
    email: record.email || "",
    referral_source: resolveReferralSourceFromPreAppointment(record) || "",
    cid_investigation: record.cid || "",
    notes: record.notes || "",
    cpf: record.cpf || "",
  };
}

function buildInitialNotes(
  form: PreCadastroFormState,
  sourcePreAppointmentId?: string | null
): string | null {
  const lines: string[] = [];

  const sourceId = toOptionalTrimmed(sourcePreAppointmentId || "");
  if (sourceId) {
    lines.push(`Origem: pre-agendamento #${sourceId}`);
  }

  const responsibleName = toOptionalTrimmed(form.responsible_name);
  if (responsibleName) {
    lines.push(`Responsavel principal: ${responsibleName}`);
  }

  const referralSource = toOptionalTrimmed(form.referral_source);
  if (referralSource) {
    lines.push(`Origem do encaminhamento: ${referralSource}`);
  }

  const cidInvestigation = toOptionalTrimmed(form.cid_investigation);
  if (cidInvestigation) {
    lines.push(`CID em investigacao: ${cidInvestigation}`);
  }

  const shortNotes = toOptionalTrimmed(form.notes);
  if (shortNotes) {
    lines.push(`Observacoes iniciais: ${shortNotes}`);
  }

  if (lines.length === 0) {
    return null;
  }

  return lines.join("\n");
}

export default function PreCadastro() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entryMode, setEntryMode] = useState<EntryMode>("manual");
  const [form, setForm] = useState<PreCadastroFormState>(INITIAL_FORM);
  const [preAppointmentSearch, setPreAppointmentSearch] = useState<PreAppointmentSearchState>(
    INITIAL_PRE_APPOINTMENT_SEARCH
  );
  const [searchingPreAppointments, setSearchingPreAppointments] = useState(false);
  const [loadingPreAppointment, setLoadingPreAppointment] = useState(false);
  const [preAppointments, setPreAppointments] = useState<PreAppointmentImportRecord[]>([]);
  const [selectedPreAppointment, setSelectedPreAppointment] =
    useState<PreAppointmentImportRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const updateField = <K extends keyof PreCadastroFormState>(
    field: K,
    value: PreCadastroFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setSelectedPreAppointment(null);
  };

  const updatePreAppointmentSearchField = <K extends keyof PreAppointmentSearchState>(
    field: K,
    value: PreAppointmentSearchState[K]
  ) => {
    setPreAppointmentSearch((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (entryMode === "import" && !selectedPreAppointment?.id) {
      throw new Error("Selecione um pre-agendamento para importar.");
    }

    if (!form.child_name.trim()) {
      throw new Error("Informe o nome da crianca.");
    }
    if (!form.date_of_birth) {
      throw new Error("Informe a data de nascimento.");
    }
    if (!form.responsible_name.trim()) {
      throw new Error("Informe o nome do responsavel.");
    }
    if (!form.phone.trim()) {
      throw new Error("Informe o telefone principal.");
    }
  };

  const loadEligiblePreAppointments = async () => {
    try {
      setSearchingPreAppointments(true);
      const records = await apiService.getEligiblePreAppointments({
        q: preAppointmentSearch.q || null,
        child_name: preAppointmentSearch.child_name || null,
        responsible_name: preAppointmentSearch.responsible_name || null,
        phone: preAppointmentSearch.phone || null,
        cpf: preAppointmentSearch.cpf || null,
        date: preAppointmentSearch.date || null,
        limit: 30,
      });
      setPreAppointments(records);
    } catch (error) {
      toast({
        title: "Importacao",
        description:
          error instanceof Error
            ? error.message
            : "Nao foi possivel buscar pre-agendamentos elegiveis.",
        variant: "destructive",
      });
    } finally {
      setSearchingPreAppointments(false);
    }
  };

  const handleSearchPreAppointments = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadEligiblePreAppointments();
  };

  const handleSelectPreAppointment = async (preAppointmentId: string) => {
    try {
      setLoadingPreAppointment(true);
      const record = await apiService.getPreAppointmentById(preAppointmentId);
      if (!record) {
        throw new Error("Pre-agendamento nao encontrado.");
      }

      setSelectedPreAppointment(record);
      setForm(mapPreAppointmentToPreCadastroForm(record));
      toast({
        title: "Dados importados",
        description: `Formulario preenchido com o pre-agendamento #${record.id}.`,
      });
    } catch (error) {
      toast({
        title: "Importacao",
        description:
          error instanceof Error
            ? error.message
            : "Nao foi possivel importar os dados do pre-agendamento.",
        variant: "destructive",
      });
    } finally {
      setLoadingPreAppointment(false);
    }
  };

  useEffect(() => {
    const sourcePreAppointmentId = toOptionalTrimmed(
      searchParams.get("source_pre_appointment_id") || ""
    );
    if (!sourcePreAppointmentId) return;

    let active = true;

    const importFromQueue = async () => {
      try {
        setEntryMode("import");
        setLoadingPreAppointment(true);

        const record = await apiService.getPreAppointmentById(sourcePreAppointmentId);
        if (!record) {
          throw new Error("Pre-agendamento nao encontrado.");
        }

        if (!active) return;
        setSelectedPreAppointment(record);
        setForm(mapPreAppointmentToPreCadastroForm(record));
        toast({
          title: "Dados importados",
          description: `Formulario preenchido a partir da fila de triagem (pre-agendamento #${record.id}).`,
        });
      } catch (error) {
        if (!active) return;
        toast({
          title: "Importacao",
          description:
            error instanceof Error
              ? error.message
              : "Nao foi possivel importar os dados enviados pela fila de triagem.",
          variant: "destructive",
        });
      } finally {
        if (active) {
          setLoadingPreAppointment(false);
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.delete("source_pre_appointment_id");
            next.delete("entry_mode");
            return next;
          });
        }
      }
    };

    void importFromQueue();

    return () => {
      active = false;
    };
  }, [searchParams, setSearchParams, toast]);

  const handleSuccessfulSave = (
    response: PatientCreateResponse,
    sourcePreAppointmentId: string | null
  ) => {
    const patientId = response.paciente?.id || "";

    if (response.linked_existing_patient) {
      toast({
        title: "Pre-agendamento convertido",
        description: `Solicitacao vinculada ao cadastro existente (ID ${patientId}).`,
      });
    } else if (sourcePreAppointmentId) {
      toast({
        title: "Pre-cadastro salvo",
        description: `Cadastro principal criado e pre-agendamento convertido (ID ${patientId}).`,
      });
    } else {
      toast({
        title: "Pre-cadastro salvo",
        description: `Assistido cadastrado no cadastro principal e mantido em fila de espera (ID ${patientId}).`,
      });
    }

    if (sourcePreAppointmentId) {
      setPreAppointments((prev) => prev.filter((item) => item.id !== sourcePreAppointmentId));
    }

    resetForm();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      validateForm();
    } catch (error) {
      toast({
        title: "Validacao",
        description: error instanceof Error ? error.message : "Dados obrigatorios ausentes.",
        variant: "destructive",
      });
      return;
    }

    const sourcePreAppointmentId =
      entryMode === "import" ? selectedPreAppointment?.id || null : null;

    const payload: PatientCreatePayload = {
      name: form.child_name.trim(),
      date_of_birth: form.date_of_birth,
      cpf: normalizeCpf(form.cpf),
      phone: form.phone.trim(),
      email: toOptionalTrimmed(form.email),
      notes: buildInitialNotes(form, sourcePreAppointmentId),
      status_jornada: "em_fila_espera",
      ...(sourcePreAppointmentId
        ? { source_pre_appointment_id: sourcePreAppointmentId }
        : {}),
    };

    try {
      setSubmitting(true);
      const response = await apiService.createPatient(payload);

      if (!response.success || !response.paciente?.id) {
        throw new Error(response.message || "Nao foi possivel salvar o pre-cadastro.");
      }

      handleSuccessfulSave(response, sourcePreAppointmentId);
    } catch (error) {
      const typedError = error as ApiRequestError;
      const duplicateId = typedError?.existing_patient_id || undefined;

      if (
        typedError?.status === 409 &&
        sourcePreAppointmentId &&
        duplicateId &&
        typedError.requires_link_confirmation
      ) {
        const shouldLinkExisting = window.confirm(
          `Ja existe um cadastro para esta crianca (ID ${duplicateId}). Deseja vincular este pre-agendamento ao cadastro existente?`
        );

        if (!shouldLinkExisting) {
          toast({
            title: "Vinculacao pendente",
            description: "Nenhuma alteracao foi realizada.",
          });
          return;
        }

        try {
          const linkedResponse = await apiService.createPatient({
            ...payload,
            link_existing_patient_id: duplicateId,
          });

          if (!linkedResponse.success || !linkedResponse.paciente?.id) {
            throw new Error(
              linkedResponse.message || "Nao foi possivel vincular ao cadastro existente."
            );
          }

          handleSuccessfulSave(linkedResponse, sourcePreAppointmentId);
          return;
        } catch (linkError) {
          const linkTypedError = linkError as ApiRequestError;
          toast({
            title: "Erro ao vincular",
            description:
              linkTypedError instanceof Error
                ? linkTypedError.message
                : "Nao foi possivel vincular ao cadastro existente.",
            variant: "destructive",
          });
          return;
        }
      }

      if (typedError?.status === 409 && duplicateId) {
        toast({
          title: "Cadastro duplicado",
          description: duplicateId
            ? `Ja existe um cadastro para esta crianca (ID ${duplicateId}). Verifique o registro existente antes de tentar novamente.`
            : "Ja existe um cadastro para esta crianca. Verifique o registro existente antes de tentar novamente.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Erro ao salvar",
        description:
          typedError instanceof Error
            ? typedError.message
            : "Nao foi possivel concluir o pre-cadastro.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pre-Cadastro de Recepcao</h1>
        <p className="text-sm text-muted-foreground">
          Entrada institucional inicial para fila de espera. A jornada oficial permanece em
          em_fila_espera ate a entrevista social.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Fluxo oficial</AlertTitle>
        <AlertDescription>
          Este cadastro cria o registro canonico da crianca. A jornada oficial permanece em{" "}
          <strong>em_fila_espera</strong>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Forma de entrada</CardTitle>
          <CardDescription>
            Escolha entre cadastro manual ou importacao de uma solicitacao ja registrada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            className="grid grid-cols-1 gap-3 md:grid-cols-2"
            value={entryMode}
            onValueChange={(value) => {
              const nextMode: EntryMode = value === "import" ? "import" : "manual";
              setEntryMode(nextMode);
              if (nextMode === "manual") {
                setSelectedPreAppointment(null);
              }
            }}
          >
            <label
              htmlFor="entry-mode-manual"
              className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"
            >
              <RadioGroupItem id="entry-mode-manual" value="manual" />
              <span>Novo pre-cadastro</span>
            </label>
            <label
              htmlFor="entry-mode-import"
              className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"
            >
              <RadioGroupItem id="entry-mode-import" value="import" />
              <span>Importar do pre-agendamento</span>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {entryMode === "import" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Buscar pre-agendamento
            </CardTitle>
            <CardDescription>
              Busque por nome da crianca, responsavel, telefone, CPF, data ou termo livre.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSearchPreAppointments} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="search-q">Busca geral</Label>
                  <Input
                    id="search-q"
                    value={preAppointmentSearch.q}
                    onChange={(event) => updatePreAppointmentSearchField("q", event.target.value)}
                    placeholder="Nome, telefone, responsavel..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="search-child">Nome da crianca</Label>
                  <Input
                    id="search-child"
                    value={preAppointmentSearch.child_name}
                    onChange={(event) =>
                      updatePreAppointmentSearchField("child_name", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="search-responsible">Nome do responsavel</Label>
                  <Input
                    id="search-responsible"
                    value={preAppointmentSearch.responsible_name}
                    onChange={(event) =>
                      updatePreAppointmentSearchField("responsible_name", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="search-phone">Telefone</Label>
                  <Input
                    id="search-phone"
                    value={preAppointmentSearch.phone}
                    onChange={(event) =>
                      updatePreAppointmentSearchField("phone", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="search-cpf">CPF</Label>
                  <Input
                    id="search-cpf"
                    value={preAppointmentSearch.cpf}
                    onChange={(event) => updatePreAppointmentSearchField("cpf", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="search-date">Data</Label>
                  <Input
                    id="search-date"
                    type="date"
                    value={preAppointmentSearch.date}
                    onChange={(event) =>
                      updatePreAppointmentSearchField("date", event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPreAppointmentSearch(INITIAL_PRE_APPOINTMENT_SEARCH);
                    setPreAppointments([]);
                  }}
                  disabled={searchingPreAppointments}
                >
                  Limpar busca
                </Button>
                <Button type="submit" disabled={searchingPreAppointments}>
                  {searchingPreAppointments ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    "Buscar"
                  )}
                </Button>
              </div>
            </form>

            <div className="space-y-2">
              {preAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum pre-agendamento carregado. Use a busca para localizar registros pendentes.
                </p>
              ) : (
                preAppointments.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">{item.name || "Sem nome"}</p>
                      <p className="text-muted-foreground">
                        Responsavel: {item.responsible_name || "-"} | Telefone: {item.phone || "-"}
                      </p>
                      <p className="text-muted-foreground">
                        Criado em: {formatDateTime(item.created_at)} | Status: {item.status || "-"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSelectPreAppointment(item.id)}
                      disabled={loadingPreAppointment || submitting}
                    >
                      {loadingPreAppointment ? "Importando..." : "Importar"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {selectedPreAppointment ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle className="flex flex-wrap items-center gap-2">
            Origem da ficha
            <Badge variant="secondary">Pre-Agendamento #{selectedPreAppointment.id}</Badge>
          </AlertTitle>
          <AlertDescription>
            Dados carregados a partir da solicitacao selecionada. Revise e edite antes de salvar.
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Dados iniciais da crianca
              </CardTitle>
            <CardDescription>
              Somente dados necessarios para recepcao e entrada na fila oficial da jornada.
            </CardDescription>
            </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="child_name">Nome da crianca *</Label>
                <Input
                  id="child_name"
                  value={form.child_name}
                  onChange={(event) => updateField("child_name", event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Data de nascimento *</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={form.date_of_birth}
                  onChange={(event) => updateField("date_of_birth", event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF da crianca (opcional)</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={(event) => updateField("cpf", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cid_investigation">CID em investigacao (opcional)</Label>
                <Input
                  id="cid_investigation"
                  placeholder="Ex.: F84.0"
                  value={form.cid_investigation}
                  onChange={(event) => updateField("cid_investigation", event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contato do responsavel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="responsible_name">Nome do responsavel *</Label>
                <Input
                  id="responsible_name"
                  value={form.responsible_name}
                  onChange={(event) => updateField("responsible_name", event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone principal *</Label>
                <Input
                  id="phone"
                  placeholder="(11) 99999-9999"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail (opcional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="referral_source">Origem do encaminhamento (opcional)</Label>
                <Input
                  id="referral_source"
                  placeholder="Escola, UBS, familia, etc."
                  value={form.referral_source}
                  onChange={(event) => updateField("referral_source", event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
            <CardHeader>
              <CardTitle>Observacoes breves</CardTitle>
              <CardDescription>
              Use apenas apontamentos iniciais de recepcao. Dados detalhados ficam para a entrevista
              social sem alterar o status principal da jornada.
              </CardDescription>
            </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="notes">Observacoes (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Escreva apenas informacoes iniciais relevantes."
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
            Limpar formulario
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              entryMode === "import" ? "Salvar e converter solicitacao" : "Salvar e entrar na fila"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
