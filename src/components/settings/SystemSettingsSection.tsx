import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function SystemSettingsSection() {
  const [systemSettings, setSystemSettings] = useState({
    tempoSessaoMin: 30,
    tentativasLogin: 5,
    modoDebug: false,
    notificacoes: true,
    backupAutomatico: true,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pilar Sistema</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tempo_sessao">Tempo de sessao (min)</Label>
            <Input
              id="tempo_sessao"
              type="number"
              min={1}
              value={systemSettings.tempoSessaoMin}
              onChange={(e) =>
                setSystemSettings((prev) => ({
                  ...prev,
                  tempoSessaoMin: Number(e.target.value || 0),
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tentativas_login">Tentativas de login</Label>
            <Input
              id="tentativas_login"
              type="number"
              min={1}
              value={systemSettings.tentativasLogin}
              onChange={(e) =>
                setSystemSettings((prev) => ({
                  ...prev,
                  tentativasLogin: Number(e.target.value || 0),
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="modo_debug" className="text-sm">
              Modo debug
            </Label>
            <Switch
              id="modo_debug"
              checked={systemSettings.modoDebug}
              onCheckedChange={(checked) =>
                setSystemSettings((prev) => ({ ...prev, modoDebug: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="notificacoes" className="text-sm">
              Notificacoes
            </Label>
            <Switch
              id="notificacoes"
              checked={systemSettings.notificacoes}
              onCheckedChange={(checked) =>
                setSystemSettings((prev) => ({ ...prev, notificacoes: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
            <Label htmlFor="backup_automatico" className="text-sm">
              Backup automatico
            </Label>
            <Switch
              id="backup_automatico"
              checked={systemSettings.backupAutomatico}
              onCheckedChange={(checked) =>
                setSystemSettings((prev) => ({ ...prev, backupAutomatico: checked }))
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-2">
          <p className="text-xs text-muted-foreground">Integracao no proximo passo</p>
          <Button type="button" size="sm" disabled>
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
