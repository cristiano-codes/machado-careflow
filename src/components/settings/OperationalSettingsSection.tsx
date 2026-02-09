import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export default function OperationalSettingsSection() {
  const [operationalSettings, setOperationalSettings] = useState({
    horarioInicio: "08:00",
    horarioFim: "18:00",
    diasAtivos: {
      seg: true,
      ter: true,
      qua: true,
      qui: true,
      sex: true,
      sab: false,
      dom: false,
    },
    duracaoPadraoMin: 60,
    politicaCancelamento: "Cancelamentos devem ser informados com antecedencia.",
    limiteDiario: 20,
  });

  function handleDayToggle(
    day: keyof typeof operationalSettings.diasAtivos,
    checked: boolean
  ) {
    setOperationalSettings((prev) => ({
      ...prev,
      diasAtivos: {
        ...prev.diasAtivos,
        [day]: checked,
      },
    }));
  }

  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-sm">Pilar Operacional</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="grid gap-1.5 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="horario_inicio">Horario de funcionamento (inicio)</Label>
            <Input
              id="horario_inicio"
              type="time"
              className="h-9"
              value={operationalSettings.horarioInicio}
              onChange={(e) =>
                setOperationalSettings((prev) => ({
                  ...prev,
                  horarioInicio: e.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="horario_fim">Horario de funcionamento (fim)</Label>
            <Input
              id="horario_fim"
              type="time"
              className="h-9"
              value={operationalSettings.horarioFim}
              onChange={(e) =>
                setOperationalSettings((prev) => ({
                  ...prev,
                  horarioFim: e.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Dias ativos</Label>
            <div className="grid grid-cols-4 gap-1.5 md:grid-cols-7">
              <label className="flex items-center gap-2 rounded-md border px-1.5 py-1 text-xs leading-none">
                <Switch
                  checked={operationalSettings.diasAtivos.seg}
                  onCheckedChange={(checked) => handleDayToggle("seg", checked)}
                />
                Seg
              </label>
              <label className="flex items-center gap-2 rounded-md border px-1.5 py-1 text-xs leading-none">
                <Switch
                  checked={operationalSettings.diasAtivos.ter}
                  onCheckedChange={(checked) => handleDayToggle("ter", checked)}
                />
                Ter
              </label>
              <label className="flex items-center gap-2 rounded-md border px-1.5 py-1 text-xs leading-none">
                <Switch
                  checked={operationalSettings.diasAtivos.qua}
                  onCheckedChange={(checked) => handleDayToggle("qua", checked)}
                />
                Qua
              </label>
              <label className="flex items-center gap-2 rounded-md border px-1.5 py-1 text-xs leading-none">
                <Switch
                  checked={operationalSettings.diasAtivos.qui}
                  onCheckedChange={(checked) => handleDayToggle("qui", checked)}
                />
                Qui
              </label>
              <label className="flex items-center gap-2 rounded-md border px-1.5 py-1 text-xs leading-none">
                <Switch
                  checked={operationalSettings.diasAtivos.sex}
                  onCheckedChange={(checked) => handleDayToggle("sex", checked)}
                />
                Sex
              </label>
              <label className="flex items-center gap-2 rounded-md border px-1.5 py-1 text-xs leading-none">
                <Switch
                  checked={operationalSettings.diasAtivos.sab}
                  onCheckedChange={(checked) => handleDayToggle("sab", checked)}
                />
                Sab
              </label>
              <label className="flex items-center gap-2 rounded-md border px-1.5 py-1 text-xs leading-none">
                <Switch
                  checked={operationalSettings.diasAtivos.dom}
                  onCheckedChange={(checked) => handleDayToggle("dom", checked)}
                />
                Dom
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="duracao_padrao">Duracao padrao (min)</Label>
            <Input
              id="duracao_padrao"
              type="number"
              min={5}
              step={5}
              className="h-9"
              value={operationalSettings.duracaoPadraoMin}
              onChange={(e) =>
                setOperationalSettings((prev) => ({
                  ...prev,
                  duracaoPadraoMin: Number(e.target.value || 0),
                }))
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="limite_diario">Limite diario</Label>
            <Input
              id="limite_diario"
              type="number"
              min={0}
              className="h-9"
              value={operationalSettings.limiteDiario}
              onChange={(e) =>
                setOperationalSettings((prev) => ({
                  ...prev,
                  limiteDiario: Number(e.target.value || 0),
                }))
              }
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="politica_cancelamento">Politica de cancelamento</Label>
            <Textarea
              id="politica_cancelamento"
              rows={2}
              value={operationalSettings.politicaCancelamento}
              onChange={(e) =>
                setOperationalSettings((prev) => ({
                  ...prev,
                  politicaCancelamento: e.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="flex justify-end border-t pt-1">
          <Button type="button" size="sm" disabled>
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
