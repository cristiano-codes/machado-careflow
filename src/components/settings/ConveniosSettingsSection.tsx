import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiService,
  type Convenio,
  type ConvenioPayload,
  type ConvenioStatus,
} from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pencil, RefreshCcw } from "lucide-react";

interface ConveniosSettingsSectionProps {
  canEdit?: boolean;
}

type ConvenioFormState = {
  nome: string;
  numero_projeto: string;
  data_inicio: string;
  data_fim: string;
  status: ConvenioStatus;
  quantidade_atendidos: string;
};

const EMPTY_FORM: ConvenioFormState = {
  nome: "",
  numero_projeto: "",
  data_inicio: "",
  data_fim: "",
  status: "ativo",
  quantidade_atendidos: "0",
};
const MAX_CONVENIO_NOME_LENGTH = 160;
const MAX_NUMERO_PROJETO_LENGTH = 80;

function normalizeDateInput(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const normalized = normalizeDateInput(value);
  if (!normalized) return "-";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function convenioToForm(convenio: Convenio): ConvenioFormState {
  return {
    nome: convenio.nome || "",
    numero_projeto: convenio.numero_projeto || "",
    data_inicio: normalizeDateInput(convenio.data_inicio),
    data_fim: normalizeDateInput(convenio.data_fim),
    status: convenio.status === "inativo" ? "inativo" : "ativo",
    quantidade_atendidos: String(Math.max(0, convenio.quantidade_atendidos || 0)),
  };
}

function sortConvenios(items: Convenio[]): Convenio[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === "ativo" ? -1 : 1;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export default function ConveniosSettingsSection({ canEdit = true }: ConveniosSettingsSectionProps) {
  const { toast } = useToast();

  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ConvenioFormState>(EMPTY_FORM);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const activeCount = useMemo(
    () => convenios.filter((item) => item.status === "ativo").length,
    [convenios]
  );

  const loadConvenios = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getConvenios(true);
      if (!response.success) {
        throw new Error(response.message || "Nao foi possivel carregar os convenios.");
      }
      setConvenios(sortConvenios(response.convenios));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar convenios.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConvenios();
  }, [loadConvenios]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormVisible(false);
  }

  function handleNewConvenio() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormVisible(true);
  }

  function buildPayloadFromForm(): { payload?: ConvenioPayload; error?: string } {
    const nome = form.nome.trim();
    if (!nome) {
      return { error: "Nome do convenio/projeto e obrigatorio." };
    }
    if (nome.length > MAX_CONVENIO_NOME_LENGTH) {
      return {
        error: `Nome do convenio/projeto deve ter no maximo ${MAX_CONVENIO_NOME_LENGTH} caracteres.`,
      };
    }

    const numeroProjeto = form.numero_projeto.trim();
    if (numeroProjeto.length > MAX_NUMERO_PROJETO_LENGTH) {
      return {
        error: `N do projeto deve ter no maximo ${MAX_NUMERO_PROJETO_LENGTH} caracteres.`,
      };
    }

    const quantidade = Number(form.quantidade_atendidos);
    if (!Number.isInteger(quantidade) || quantidade < 0) {
      return { error: "Quantidade de atendidos deve ser numero inteiro nao negativo." };
    }

    const dataInicio = form.data_inicio.trim();
    const dataFim = form.data_fim.trim();
    if (dataInicio && dataFim && dataFim < dataInicio) {
      return { error: "Data fim nao pode ser menor que data inicio." };
    }

    return {
      payload: {
        nome,
        numero_projeto: numeroProjeto || null,
        data_inicio: dataInicio || null,
        data_fim: dataFim || null,
        status: form.status,
        quantidade_atendidos: quantidade,
      },
    };
  }

  async function handleSubmit() {
    if (saving) return;
    const parsed = buildPayloadFromForm();
    if (!parsed.payload) {
      toast({
        title: "Validacao",
        description: parsed.error || "Formulario invalido.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        const response = await apiService.updateConvenio(editingId, parsed.payload);
        if (!response.success || !response.convenio) {
          throw new Error(response.message || "Nao foi possivel atualizar o convenio.");
        }
        setConvenios((prev) =>
          sortConvenios(prev.map((item) => (item.id === editingId ? response.convenio! : item)))
        );
        toast({
          title: "Convenio atualizado",
          description: "Registro atualizado com sucesso.",
        });
      } else {
        const response = await apiService.createConvenio(parsed.payload);
        if (!response.success || !response.convenio) {
          throw new Error(response.message || "Nao foi possivel criar o convenio.");
        }
        setConvenios((prev) => sortConvenios([response.convenio!, ...prev]));
        toast({
          title: "Convenio criado",
          description: "Novo convenio/projeto cadastrado com sucesso.",
        });
      }
      resetForm();
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Falha ao salvar convenio.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(convenio: Convenio) {
    setEditingId(convenio.id);
    setForm(convenioToForm(convenio));
    setIsFormVisible(true);
  }

  async function handleToggleStatus(convenio: Convenio) {
    if (saving || updatingId) return;
    const nextStatus: ConvenioStatus = convenio.status === "ativo" ? "inativo" : "ativo";
    try {
      setUpdatingId(convenio.id);
      const response = await apiService.setConvenioStatus(convenio.id, nextStatus);
      if (!response.success || !response.convenio) {
        throw new Error(response.message || "Nao foi possivel atualizar o status.");
      }
      setConvenios((prev) =>
        sortConvenios(prev.map((item) => (item.id === convenio.id ? response.convenio! : item)))
      );
      toast({
        title: "Status atualizado",
        description: `Convenio marcado como ${nextStatus}.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao atualizar status",
        description: err instanceof Error ? err.message : "Falha ao atualizar status do convenio.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Convenios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {convenios.length} cadastrado(s), {activeCount} ativo(s).
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadConvenios()}
              disabled={loading || saving || Boolean(updatingId)}
            >
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
              Atualizar
            </Button>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                onClick={handleNewConvenio}
                disabled={saving || Boolean(updatingId)}
              >
                Novo Convenio
              </Button>
            )}
          </div>
        </div>

        {isFormVisible && (
          <div className="rounded-md border p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {editingId ? "Editar Convenio/Projeto" : "Novo Convenio/Projeto"}
              </h3>
              {editingId && (
                <Button type="button" variant="ghost" size="sm" onClick={resetForm} disabled={saving}>
                  Cancelar edicao
                </Button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1 lg:col-span-2">
                <Label htmlFor="convenio_nome">Nome do Convenio/Projeto</Label>
                <Input
                  id="convenio_nome"
                  value={form.nome}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="convenio_numero">N do Projeto</Label>
                <Input
                  id="convenio_numero"
                  value={form.numero_projeto}
                  onChange={(e) => setForm((prev) => ({ ...prev, numero_projeto: e.target.value }))}
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="convenio_data_inicio">Inicio do Projeto</Label>
                <Input
                  id="convenio_data_inicio"
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => setForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="convenio_data_fim">Fim do Projeto</Label>
                <Input
                  id="convenio_data_fim"
                  type="date"
                  value={form.data_fim}
                  onChange={(e) => setForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="convenio_status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value: ConvenioStatus) => setForm((prev) => ({ ...prev, status: value }))}
                  disabled={!canEdit || saving}
                >
                  <SelectTrigger id="convenio_status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="convenio_qtd">Quantidade de atendidos</Label>
                <Input
                  id="convenio_qtd"
                  type="number"
                  min={0}
                  step={1}
                  value={form.quantidade_atendidos}
                  onChange={(e) => setForm((prev) => ({ ...prev, quantidade_atendidos: e.target.value }))}
                  disabled={!canEdit || saving}
                />
              </div>
            </div>

            {canEdit && (
              <div className="mt-3 flex justify-end">
                <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Salvar edicao" : "Salvar convenio"}
                </Button>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando convenios...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void loadConvenios()}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>N do Projeto</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Qtd Atendidos</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convenios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum convenio cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  convenios.map((convenio) => {
                    const busy = updatingId === convenio.id;
                    return (
                      <TableRow key={convenio.id}>
                        <TableCell className="font-medium">{convenio.nome}</TableCell>
                        <TableCell>{convenio.numero_projeto || "-"}</TableCell>
                        <TableCell>{formatDate(convenio.data_inicio)}</TableCell>
                        <TableCell>{formatDate(convenio.data_fim)}</TableCell>
                        <TableCell>
                          <Badge variant={convenio.status === "ativo" ? "default" : "outline"}>
                            {convenio.status === "ativo" ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>{convenio.quantidade_atendidos}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {canEdit && (
                              <>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleEdit(convenio)}
                                  disabled={busy || saving}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleToggleStatus(convenio)}
                                  disabled={busy || saving}
                                >
                                  {busy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : convenio.status === "ativo" ? (
                                    "Inativar"
                                  ) : (
                                    "Ativar"
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
