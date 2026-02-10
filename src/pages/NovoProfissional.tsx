import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/services/api";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";

const DEFAULT_CONTRACT_OPTIONS = ["CLT", "PJ", "Voluntário", "Estágio", "Temporário"] as const;
const WEEK_DAYS: Array<{ key: "seg" | "ter" | "qua" | "qui" | "sex"; label: string }> = [
  { key: "seg", label: "Seg" },
  { key: "ter", label: "Ter" },
  { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" },
  { key: "sex", label: "Sex" },
];

export default function NovoProfissional() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const contractOptions = useMemo(
    () =>
      settings.professionals_config.allowed_contract_types.length > 0
        ? settings.professionals_config.allowed_contract_types
        : [...DEFAULT_CONTRACT_OPTIONS],
    [settings.professionals_config.allowed_contract_types]
  );

  const suggestedWeeklyHours = useMemo(
    () => settings.professionals_config.suggested_weekly_hours,
    [settings.professionals_config.suggested_weekly_hours]
  );

  const configuredScale = useMemo(
    () => ({
      seg: settings.business_hours.operating_days.seg,
      ter: settings.business_hours.operating_days.ter,
      qua: settings.business_hours.operating_days.qua,
      qui: settings.business_hours.operating_days.qui,
      sex: settings.business_hours.operating_days.sex,
    }),
    [
      settings.business_hours.operating_days.seg,
      settings.business_hours.operating_days.ter,
      settings.business_hours.operating_days.qua,
      settings.business_hours.operating_days.qui,
      settings.business_hours.operating_days.sex,
    ]
  );

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    username: "",
    specialty: "",
    crp: "",
    funcao: "",
    horas_semanais: "",
    data_nascimento: "",
    tipo_contrato: contractOptions[0] || "CLT",
    escala_semanal: configuredScale,
    role: "Usuário",
    status: "ATIVO" as "ATIVO" | "INATIVO",
  });

  useEffect(() => {
    if (form.email && !form.username) {
      const prefix = form.email.split("@")[0];
      setForm((prev) => ({ ...prev, username: prefix }));
    }
  }, [form.email, form.username]);

  useEffect(() => {
    setForm((prev) => {
      const nextContract = contractOptions.includes(prev.tipo_contrato)
        ? prev.tipo_contrato
        : contractOptions[0] || "CLT";

      return {
        ...prev,
        tipo_contrato: nextContract,
        escala_semanal: configuredScale,
        horas_semanais:
          prev.horas_semanais || suggestedWeeklyHours.length === 0
            ? prev.horas_semanais
            : String(suggestedWeeklyHours[0]),
      };
    });
  }, [configuredScale, contractOptions, suggestedWeeklyHours]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const hoursValue = form.horas_semanais.trim().length > 0 ? Number(form.horas_semanais) : null;

      if (hoursValue !== null && (!Number.isInteger(hoursValue) || hoursValue <= 0)) {
        throw new Error("Horas semanais deve ser um numero inteiro positivo");
      }

      const res = await apiService.createProfessional({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        username: form.username,
        role: form.role,
        specialty: form.specialty || undefined,
        crp: form.crp || undefined,
        funcao: form.funcao,
        horas_semanais: hoursValue,
        data_nascimento: form.data_nascimento || null,
        tipo_contrato: form.tipo_contrato,
        escala_semanal: form.escala_semanal,
        status: form.status,
      });

      if (!res?.success) {
        throw new Error(res?.message || "Erro ao criar profissional");
      }

      toast({
        title: "Profissional criado",
        description: "Cadastro criado com os campos do MVP e vinculado ao usuario.",
      });
      navigate("/profissionais");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar profissional";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const setValue = (key: Exclude<keyof typeof form, "escala_semanal">, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setScaleDay = (day: "seg" | "ter" | "qua" | "qui" | "sex", checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      escala_semanal: { ...prev.escala_semanal, [day]: checked },
    }));

  return (
    <ProtectedRoute module="profissionais" permission="create">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Novo profissional</h1>
            <p className="text-sm text-muted-foreground">Crie o usuario e vincule o cadastro clinico</p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dados principais</CardTitle>
            <CardDescription>Esses dados criam o usuario e o vinculo com profissionais</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input id="name" value={form.name} onChange={(e) => setValue("name", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setValue("email", e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setValue("phone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(e) => setValue("username", e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="funcao">Funcao</Label>
                  <Input
                    id="funcao"
                    value={form.funcao}
                    onChange={(e) => setValue("funcao", e.target.value)}
                    placeholder="Psicologo, Fono, Assistente Social..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de contrato</Label>
                  <Select value={form.tipo_contrato} onValueChange={(v) => setValue("tipo_contrato", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo de contrato" />
                    </SelectTrigger>
                    <SelectContent>
                      {contractOptions.map((contract) => (
                        <SelectItem key={contract} value={contract}>
                          {contract}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="horas_semanais">Horas semanais</Label>
                  <Input
                    id="horas_semanais"
                    type="number"
                    min={1}
                    step={1}
                    value={form.horas_semanais}
                    onChange={(e) => setValue("horas_semanais", e.target.value)}
                    placeholder="20, 30, 40..."
                  />
                  {suggestedWeeklyHours.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {suggestedWeeklyHours.map((hour) => (
                        <Button
                          key={hour}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setValue("horas_semanais", String(hour))}
                        >
                          {hour}h
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data_nascimento">Data de nascimento</Label>
                  <Input
                    id="data_nascimento"
                    type="date"
                    value={form.data_nascimento}
                    onChange={(e) => setValue("data_nascimento", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Escala semanal</Label>
                <div className="flex flex-wrap gap-4 rounded-md border p-3">
                  {WEEK_DAYS.map((day) => (
                    <label
                      key={day.key}
                      className="flex items-center gap-2 text-sm font-medium"
                      htmlFor={`escala_${day.key}`}
                    >
                      <Checkbox
                        id={`escala_${day.key}`}
                        checked={form.escala_semanal[day.key]}
                        onCheckedChange={(checked) => setScaleDay(day.key, checked === true)}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setValue("status", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ATIVO">Ativo</SelectItem>
                      <SelectItem value="INATIVO">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="specialty">Especialidade (legado)</Label>
                  <Input
                    id="specialty"
                    value={form.specialty}
                    onChange={(e) => setValue("specialty", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crp">CRP/CREFITO (legado)</Label>
                  <Input id="crp" value={form.crp} onChange={(e) => setValue("crp", e.target.value)} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Salvando..." : "Criar profissional"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}

