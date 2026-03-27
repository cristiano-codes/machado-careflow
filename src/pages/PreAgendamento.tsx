import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL, apiService, type ApiRequestError } from "@/services/api";
import { getServiceLabel } from "@/utils/serviceLabels";

type ServiceOption = { id: string; name: string };
type ServicesResponse = { success?: boolean; services?: ServiceOption[] };
type PreAppointmentResponse = { success?: boolean; message?: string; pre_appointment_id?: string | null };

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
  email: string;
  how_heard: string;
  how_heard_other: string;
  referred_by: string;
  referred_by_other: string;
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
  email: "",
  how_heard: "",
  how_heard_other: "",
  referred_by: "",
  referred_by_other: "",
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

function buildPatientNotes(form: FormState, preAppointmentId: string | null) {
  const lines: string[] = [];
  if (preAppointmentId) lines.push(`Origem: pre-agendamento #${preAppointmentId}`);
  if (toOptional(form.responsible_name)) lines.push(`Responsavel principal: ${form.responsible_name.trim()}`);
  if (toOptional(form.referred_by)) lines.push(`Encaminhamento inicial: ${form.referred_by}`);
  if (form.has_report && toOptional(form.cid)) lines.push(`CID informado na recepcao: ${form.cid.trim()}`);
  if (toOptional(form.notes)) lines.push(`Observacoes de recepcao: ${form.notes.trim()}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

export default function PreAgendamento() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoadingServices(true);
        const response = await fetch(`${API_BASE_URL}/services?active=true`);
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

  const canSubmit = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.phone.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.services.length > 0,
    [form]
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSubmitting(true);

      const preAppointmentResponse = await fetch(`${API_BASE_URL}/pre-appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          date_of_birth: form.date_of_birth || null,
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
        }),
      });

      const preAppointmentPayload =
        (await preAppointmentResponse.json().catch(() => ({}))) as PreAppointmentResponse;
      if (!preAppointmentResponse.ok || preAppointmentPayload.success !== true) {
        throw new Error(preAppointmentPayload.message || "Nao foi possivel registrar pre-agendamento.");
      }

      const preAppointmentId = toOptional(preAppointmentPayload.pre_appointment_id || "");
      const patientPayload = {
        name: form.name.trim(),
        date_of_birth: form.date_of_birth || null,
        phone: form.phone.trim(),
        email: toOptional(form.email),
        notes: buildPatientNotes(form, preAppointmentId),
        status_jornada: "em_fila_espera",
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
            `Ja existe cadastro da crianca (ID ${duplicateId}). Deseja vincular este pre-agendamento ao cadastro existente?`
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
                "Nao foi possivel vincular o pre-agendamento ao cadastro existente."
            );
          }
        } else {
          throw error;
        }
      }

      toast({
        title: "Recepcao registrada",
        description:
          "Entrada inicial concluida. O caso segue oficialmente em em_fila_espera e esta disponivel na Triagem Social.",
      });
      setForm(INITIAL_FORM);
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description:
          error instanceof Error ? error.message : "Nao foi possivel registrar a entrada inicial.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pre-Agendamento / Recepcao</h1>
        <p className="text-sm text-muted-foreground">
          Primeiro contato, cadastro basico e insercao inicial na fila. A operacao do Servico
          Social acontece na pagina dedicada de Triagem Social.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5" />
            Cadastro inicial da solicitacao
          </CardTitle>
          <CardDescription>Campos marcados com * sao obrigatorios.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1"><Label>Nome da crianca *</Label><Input value={form.name} onChange={(e) => updateField("name", e.target.value)} required /></div>
              <div className="space-y-1"><Label>Data de nascimento</Label><Input type="date" value={form.date_of_birth} onChange={(e) => updateField("date_of_birth", e.target.value)} /></div>
              <div className="space-y-1"><Label>Sexo</Label><Select value={form.sex} onValueChange={(v) => updateField("sex", v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="masculino">Masculino</SelectItem><SelectItem value="feminino">Feminino</SelectItem><SelectItem value="nao_informado">Nao informar</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Telefone principal *</Label><Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} required /></div>
              <div className="space-y-1"><Label>E-mail *</Label><Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} required /></div>
              <div className="space-y-1"><Label>Responsavel</Label><Input value={form.responsible_name} onChange={(e) => updateField("responsible_name", e.target.value)} /></div>
              <div className="space-y-1"><Label>Urgencia</Label><Select value={form.urgency} onValueChange={(v: "normal" | "prioritario") => updateField("urgency", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="prioritario">Prioritario</SelectItem></SelectContent></Select></div>
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
                        <Checkbox checked={form.services.includes(service.id)} onCheckedChange={() => toggleService(service.id)} />
                        <span>{getServiceLabel(service.name)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1"><Label>Como conheceu?</Label><Select value={form.how_heard} onValueChange={(v) => updateField("how_heard", v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{HOW_HEARD_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Encaminhado por</Label><Select value={form.referred_by} onValueChange={(v) => updateField("referred_by", v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{REFERRED_BY_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
              {form.how_heard === "outro" ? <div className="space-y-1"><Label>Outro canal</Label><Input value={form.how_heard_other} onChange={(e) => updateField("how_heard_other", e.target.value)} /></div> : null}
              {form.referred_by === "outro" ? <div className="space-y-1"><Label>Outro encaminhamento</Label><Input value={form.referred_by_other} onChange={(e) => updateField("referred_by_other", e.target.value)} /></div> : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Possui laudo?</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm"><input type="radio" checked={form.has_report} onChange={() => updateField("has_report", true)} />Sim</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!form.has_report} onChange={() => updateField("has_report", false)} />Nao</label>
                </div>
                {form.has_report ? <Input value={form.cid} onChange={(e) => updateField("cid", e.target.value)} placeholder="CID" /> : null}
              </div>
              <div className="space-y-1"><Label>Observacoes iniciais</Label><Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} className="min-h-[110px]" /></div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => navigate("/consultar-solicitacao")}>Consultar solicitacao</Button>
              <Button type="button" variant="outline" onClick={() => navigate("/triagem-social")}>Abrir Triagem Social</Button>
              <Button type="submit" disabled={submitting || !canSubmit}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Registrar entrada inicial"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
