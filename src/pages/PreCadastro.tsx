import { useState } from "react";
import { Info, Loader2, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  apiService,
  type ApiRequestError,
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

function toOptionalTrimmed(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCpf(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function buildInitialNotes(form: PreCadastroFormState): string | null {
  const lines: string[] = [];

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
  const [form, setForm] = useState<PreCadastroFormState>(INITIAL_FORM);
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
  };

  const validateForm = () => {
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

    const payload: PatientCreatePayload = {
      name: form.child_name.trim(),
      date_of_birth: form.date_of_birth,
      cpf: normalizeCpf(form.cpf),
      phone: form.phone.trim(),
      email: toOptionalTrimmed(form.email),
      notes: buildInitialNotes(form),
      status_jornada: "em_fila_espera",
    };

    try {
      setSubmitting(true);
      const response = await apiService.createPatient(payload);

      if (!response.success || !response.paciente?.id) {
        throw new Error(response.message || "Nao foi possivel salvar o pre-cadastro.");
      }

      toast({
        title: "Pre-cadastro salvo",
        description: `Assistido cadastrado no cadastro principal e mantido em fila de espera (ID ${response.paciente.id}).`,
      });

      resetForm();
    } catch (error) {
      const typedError = error as ApiRequestError;
      const duplicateId = typedError?.existing_patient_id || undefined;

      if (typedError?.status === 409) {
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
              "Salvar e entrar na fila"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
