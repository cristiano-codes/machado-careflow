import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarCheck2, Info, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/services/api";
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

export default function PreAgendamento() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Solicitação de Atendimento</h1>
          <p className="text-sm text-muted-foreground">
            Preencha as informações abaixo para entrar na fila de avaliação da instituição.
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Informação Institucional</AlertTitle>
          <AlertDescription>
            Esta solicitação gera seu ingresso inicial na jornada institucional. Após análise da equipe,
            entraremos em contato pelos canais informados.
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
    </Layout>
  );
}
