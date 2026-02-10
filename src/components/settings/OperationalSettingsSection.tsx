import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";

interface OperationalSettingsSectionProps {
  canEdit?: boolean;
}

type WeekDayKey = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

const WEEK_DAYS: Array<{ key: WeekDayKey; label: string }> = [
  { key: "seg", label: "Seg" },
  { key: "ter", label: "Ter" },
  { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" },
  { key: "sex", label: "Sex" },
  { key: "sab", label: "Sab" },
  { key: "dom", label: "Dom" },
];

export default function OperationalSettingsSection({ canEdit = true }: OperationalSettingsSectionProps) {
  const { settings, saveSettings } = useSettings();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [businessHours, setBusinessHours] = useState(settings.business_hours);
  const [professionalsConfig, setProfessionalsConfig] = useState(settings.professionals_config);

  const [contractInput, setContractInput] = useState("");
  const [hourInput, setHourInput] = useState("");

  useEffect(() => {
    setBusinessHours(settings.business_hours);
    setProfessionalsConfig(settings.professionals_config);
  }, [settings]);

  const activeDaysCount = useMemo(
    () => Object.values(businessHours.operating_days).filter(Boolean).length,
    [businessHours.operating_days]
  );

  function updateBusinessHourField(
    field: "opening_time" | "closing_time" | "lunch_break_minutes",
    value: string
  ) {
    if (field === "lunch_break_minutes") {
      const parsed = Number(value);
      setBusinessHours((prev) => ({
        ...prev,
        lunch_break_minutes: Number.isFinite(parsed) ? parsed : 0,
      }));
      return;
    }

    setBusinessHours((prev) => ({ ...prev, [field]: value }));
  }

  function updateOperatingDay(day: WeekDayKey, checked: boolean) {
    setBusinessHours((prev) => ({
      ...prev,
      operating_days: {
        ...prev.operating_days,
        [day]: checked,
      },
    }));
  }

  function addContractType() {
    const value = contractInput.trim();
    if (!value) return;

    const exists = professionalsConfig.allowed_contract_types.some(
      (item) => item.toLowerCase() === value.toLowerCase()
    );
    if (exists) {
      setContractInput("");
      return;
    }

    setProfessionalsConfig((prev) => ({
      ...prev,
      allowed_contract_types: [...prev.allowed_contract_types, value],
    }));
    setContractInput("");
  }

  function removeContractType(contract: string) {
    setProfessionalsConfig((prev) => ({
      ...prev,
      allowed_contract_types: prev.allowed_contract_types.filter((item) => item !== contract),
    }));
  }

  function addSuggestedHour() {
    const value = Number(hourInput);
    if (!Number.isInteger(value) || value <= 0) return;

    if (professionalsConfig.suggested_weekly_hours.includes(value)) {
      setHourInput("");
      return;
    }

    setProfessionalsConfig((prev) => ({
      ...prev,
      suggested_weekly_hours: [...prev.suggested_weekly_hours, value].sort((a, b) => a - b),
    }));
    setHourInput("");
  }

  function removeSuggestedHour(value: number) {
    setProfessionalsConfig((prev) => ({
      ...prev,
      suggested_weekly_hours: prev.suggested_weekly_hours.filter((item) => item !== value),
    }));
  }

  function resetDraft() {
    setBusinessHours(settings.business_hours);
    setProfessionalsConfig(settings.professionals_config);
    setContractInput("");
    setHourInput("");
  }

  async function handleSave() {
    if (activeDaysCount === 0) {
      toast({
        title: "Dias de funcionamento",
        description: "Selecione ao menos um dia ativo.",
        variant: "destructive",
      });
      return;
    }

    if (professionalsConfig.allowed_contract_types.length === 0) {
      toast({
        title: "Tipos de contrato",
        description: "Informe ao menos um tipo de contrato permitido.",
        variant: "destructive",
      });
      return;
    }

    if (professionalsConfig.suggested_weekly_hours.length === 0) {
      toast({
        title: "Horas sugeridas",
        description: "Informe ao menos uma carga horaria semanal sugerida.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      await saveSettings({
        business_hours: {
          ...businessHours,
          lunch_break_minutes: Number(businessHours.lunch_break_minutes) || 0,
        },
        professionals_config: {
          allowed_contract_types: professionalsConfig.allowed_contract_types,
          suggested_weekly_hours: professionalsConfig.suggested_weekly_hours,
        },
      });

      toast({
        title: "Configuracoes salvas",
        description: "Parametros operacionais atualizados com sucesso.",
      });

      setIsEditing(false);
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Nao foi possivel salvar as configuracoes.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pilar Operacional</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="horario_inicio">Horario de abertura</Label>
            <Input
              id="horario_inicio"
              type="time"
              value={businessHours.opening_time}
              onChange={(e) => updateBusinessHourField("opening_time", e.target.value)}
              disabled={!canEdit || !isEditing || saving}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="horario_fim">Horario de fechamento</Label>
            <Input
              id="horario_fim"
              type="time"
              value={businessHours.closing_time}
              onChange={(e) => updateBusinessHourField("closing_time", e.target.value)}
              disabled={!canEdit || !isEditing || saving}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="almoco_min">Tempo de almoco (min)</Label>
            <Input
              id="almoco_min"
              type="number"
              min={0}
              max={240}
              step={5}
              value={businessHours.lunch_break_minutes}
              onChange={(e) => updateBusinessHourField("lunch_break_minutes", e.target.value)}
              disabled={!canEdit || !isEditing || saving}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Dias de funcionamento padrao</Label>
            <div className="grid grid-cols-4 gap-2 md:grid-cols-7">
              {WEEK_DAYS.map((day) => (
                <label
                  key={day.key}
                  className="flex items-center gap-2 rounded-md border px-2 py-2 text-xs"
                  htmlFor={`dia_${day.key}`}
                >
                  <Checkbox
                    id={`dia_${day.key}`}
                    checked={businessHours.operating_days[day.key]}
                    onCheckedChange={(checked) => updateOperatingDay(day.key, checked === true)}
                    disabled={!canEdit || !isEditing || saving}
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Tipos de contrato permitidos</Label>
            <div className="flex flex-wrap gap-2 rounded-md border p-2">
              {professionalsConfig.allowed_contract_types.map((contract) => (
                <Badge key={contract} variant="secondary" className="flex items-center gap-1 pr-1">
                  {contract}
                  {canEdit && isEditing && (
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-muted"
                      onClick={() => removeContractType(contract)}
                      aria-label={`Remover ${contract}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Adicionar tipo (ex.: Cooperado)"
                value={contractInput}
                onChange={(e) => setContractInput(e.target.value)}
                disabled={!canEdit || !isEditing || saving}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addContractType();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addContractType}
                disabled={!canEdit || !isEditing || saving}
              >
                Adicionar
              </Button>
            </div>
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Horas semanais sugeridas</Label>
            <div className="flex flex-wrap gap-2 rounded-md border p-2">
              {professionalsConfig.suggested_weekly_hours.map((hour) => (
                <Badge key={hour} variant="outline" className="flex items-center gap-1 pr-1">
                  {hour}h
                  {canEdit && isEditing && (
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-muted"
                      onClick={() => removeSuggestedHour(hour)}
                      aria-label={`Remover ${hour}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                step={1}
                placeholder="Adicionar hora sugerida"
                value={hourInput}
                onChange={(e) => setHourInput(e.target.value)}
                disabled={!canEdit || !isEditing || saving}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSuggestedHour();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addSuggestedHour}
                disabled={!canEdit || !isEditing || saving}
              >
                Adicionar
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t pt-2">
          {canEdit && isEditing ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setIsEditing(false);
                  resetDraft();
                }}
              >
                Cancelar
              </Button>
              <Button type="button" disabled={saving} onClick={handleSave}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </>
          ) : canEdit ? (
            <Button type="button" onClick={() => setIsEditing(true)}>
              Editar configuracoes operacionais
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Somente leitura</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

