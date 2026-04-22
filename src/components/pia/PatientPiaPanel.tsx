import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getJourneyStatusLabel } from "@/components/status";
import { useModulePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import {
  apiService,
  type PatientPiaDTO,
  type PatientPiaHistoryDTO,
  type PatientPiaPayload,
} from "@/services/api";
import { Loader2, RefreshCw, Save } from "lucide-react";

type PiaDraft = {
  status: string;
  data_inicio: string;
  data_revisao: string;
  objetivos: string;
  intervencoes: string;
  metas: string;
};

type PatientPiaPanelProps = {
  patientId: string | null;
  patientName?: string;
  statusJornada?: string;
};

const PIA_STATUS_OPTIONS = [
  { value: "rascunho", label: "Rascunho" },
  { value: "ativo", label: "Ativo" },
  { value: "em_revisao", label: "Em revisao" },
  { value: "encerrado", label: "Encerrado" },
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): PiaDraft {
  return {
    status: "ativo",
    data_inicio: todayIsoDate(),
    data_revisao: "",
    objetivos: "",
    intervencoes: "",
    metas: "",
  };
}

function draftFromPia(pia: PatientPiaDTO | null): PiaDraft {
  if (!pia) return emptyDraft();
  return {
    status: pia.status || "ativo",
    data_inicio: pia.data_inicio || todayIsoDate(),
    data_revisao: pia.data_revisao || "",
    objetivos: pia.objetivos || "",
    intervencoes: pia.intervencoes || "",
    metas: pia.metas || "",
  };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR");
}

function formatPiaStatus(value?: string | null) {
  return PIA_STATUS_OPTIONS.find((item) => item.value === value)?.label || value || "-";
}

export function PatientPiaPanel({
  patientId,
  patientName,
  statusJornada,
}: PatientPiaPanelProps) {
  const { toast } = useToast();
  const piaPermissions = useModulePermissions("pias");
  const [pia, setPia] = useState<PatientPiaDTO | null>(null);
  const [history, setHistory] = useState<PatientPiaHistoryDTO[]>([]);
  const [draft, setDraft] = useState<PiaDraft>(() => emptyDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canMutateForJourney = useMemo(
    () => statusJornada === "matriculado" || statusJornada === "ativo",
    [statusJornada]
  );
  const canSave = Boolean(
    patientId &&
      canMutateForJourney &&
      (pia ? piaPermissions.canEdit : piaPermissions.canCreate)
  );

  const loadPia = useCallback(async () => {
    if (!patientId || !piaPermissions.canView) {
      setPia(null);
      setHistory([]);
      setDraft(emptyDraft());
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await apiService.getPatientPia(patientId);
      setPia(result.pia);
      setHistory(result.history || []);
      setDraft(draftFromPia(result.pia));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar PIA.");
    } finally {
      setLoading(false);
    }
  }, [patientId, piaPermissions.canView]);

  useEffect(() => {
    void loadPia();
  }, [loadPia]);

  if (!piaPermissions.canView) {
    return null;
  }

  async function handleSave() {
    if (!patientId || !canSave) return;

    const payload: PatientPiaPayload = {
      status: draft.status,
      data_inicio: draft.data_inicio,
      data_revisao: draft.data_revisao || null,
      objetivos: draft.objetivos,
      intervencoes: draft.intervencoes,
      metas: draft.metas,
    };

    setSaving(true);
    setError(null);
    try {
      if (pia) {
        await apiService.updatePatientPia(patientId, pia.id, payload);
      } else {
        await apiService.createPatientPia(patientId, payload);
      }
      await loadPia();
      toast({
        title: "PIA salvo",
        description: patientName || "Registro atualizado.",
      });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar PIA.";
      setError(message);
      toast({
        title: "Falha ao salvar PIA",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function updateDraft<K extends keyof PiaDraft>(key: K, value: PiaDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const readOnly = !canSave || saving;

  return (
    <Card>
      <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">PIA</CardTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{formatPiaStatus(pia?.status || draft.status)}</Badge>
            {statusJornada ? (
              <Badge variant="secondary">{getJourneyStatusLabel(statusJornada)}</Badge>
            ) : null}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={loadPia} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!canMutateForJourney ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Disponivel a partir de matricula.
          </p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="pia-status">Status do PIA</Label>
            <Select
              value={draft.status}
              onValueChange={(value) => updateDraft("status", value)}
              disabled={readOnly}
            >
              <SelectTrigger id="pia-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIA_STATUS_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pia-data-inicio">Inicio</Label>
            <Input
              id="pia-data-inicio"
              type="date"
              value={draft.data_inicio}
              onChange={(event) => updateDraft("data_inicio", event.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pia-data-revisao">Revisao</Label>
            <Input
              id="pia-data-revisao"
              type="date"
              value={draft.data_revisao}
              onChange={(event) => updateDraft("data_revisao", event.target.value)}
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="pia-objetivos">Objetivos</Label>
            <Textarea
              id="pia-objetivos"
              rows={3}
              value={draft.objetivos}
              onChange={(event) => updateDraft("objetivos", event.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pia-intervencoes">Intervencoes</Label>
            <Textarea
              id="pia-intervencoes"
              rows={3}
              value={draft.intervencoes}
              onChange={(event) => updateDraft("intervencoes", event.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pia-metas">Metas</Label>
            <Textarea
              id="pia-metas"
              rows={3}
              value={draft.metas}
              onChange={(event) => updateDraft("metas", event.target.value)}
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar PIA
          </Button>
          {pia?.updated_at ? (
            <span className="text-xs text-muted-foreground">
              Atualizado em {formatDate(pia.updated_at)}
            </span>
          ) : null}
        </div>

        {history.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Historico de revisoes</p>
            <div className="space-y-2">
              {history.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-md border p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{formatPiaStatus(item.status)}</span>
                    <span className="text-muted-foreground">{formatDate(item.changed_at)}</span>
                  </div>
                  <p className="text-muted-foreground">{item.action}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
