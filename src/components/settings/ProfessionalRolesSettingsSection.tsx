import { useCallback, useEffect, useMemo, useState } from "react";
import { apiService, type ProfessionalRole } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pencil, RefreshCcw, Save, X } from "lucide-react";

interface ProfessionalRolesSettingsSectionProps {
  canEdit?: boolean;
}

function sortRoles(list: ProfessionalRole[]) {
  return [...list].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export default function ProfessionalRolesSettingsSection({
  canEdit = true,
}: ProfessionalRolesSettingsSectionProps) {
  const { toast } = useToast();

  const [roles, setRoles] = useState<ProfessionalRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newRoleName, setNewRoleName] = useState("");
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [editingRoleName, setEditingRoleName] = useState("");

  const activeCount = useMemo(() => roles.filter((role) => role.ativo).length, [roles]);

  const loadRoles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getProfessionalRoles(true);
      if (!response.success) {
        throw new Error(response.message || "Nao foi possivel carregar as funcoes");
      }
      setRoles(sortRoles(response.roles));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar funcoes";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  async function handleCreateRole() {
    const nome = newRoleName.trim();
    if (!nome) return;

    try {
      setCreating(true);
      const response = await apiService.createProfessionalRole(nome);
      if (!response.success || !response.role) {
        throw new Error(response.message || "Nao foi possivel criar a funcao");
      }

      setRoles((prev) => sortRoles([...prev, response.role!]));
      setNewRoleName("");
      toast({
        title: "Funcao criada",
        description: `A funcao "${response.role.nome}" foi adicionada.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao criar",
        description: err instanceof Error ? err.message : "Nao foi possivel criar a funcao.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(roleId: number) {
    const nome = editingRoleName.trim();
    if (!nome) return;

    try {
      setUpdatingId(roleId);
      const response = await apiService.updateProfessionalRole(roleId, nome);
      if (!response.success || !response.role) {
        throw new Error(response.message || "Nao foi possivel editar a funcao");
      }

      setRoles((prev) =>
        sortRoles(prev.map((item) => (item.id === roleId ? response.role! : item)))
      );
      setEditingRoleId(null);
      setEditingRoleName("");
      toast({
        title: "Funcao atualizada",
        description: "Nome da funcao atualizado com sucesso.",
      });
    } catch (err) {
      toast({
        title: "Erro ao editar",
        description: err instanceof Error ? err.message : "Nao foi possivel editar a funcao.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleActive(role: ProfessionalRole, nextActive: boolean) {
    try {
      setUpdatingId(role.id);
      const response = await apiService.setProfessionalRoleActive(role.id, nextActive);
      if (!response.success || !response.role) {
        throw new Error(response.message || "Nao foi possivel atualizar o status");
      }

      setRoles((prev) =>
        sortRoles(prev.map((item) => (item.id === role.id ? response.role! : item)))
      );
    } catch (err) {
      toast({
        title: "Erro ao atualizar status",
        description: err instanceof Error ? err.message : "Nao foi possivel atualizar a funcao.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Funcoes (Profissionais)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {roles.length} cadastrado(s), {activeCount} ativo(s).
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadRoles()} disabled={loading}>
            <RefreshCcw className="mr-2 h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>

        {canEdit && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Nova funcao (ex.: Psicologo)"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              disabled={creating}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateRole();
                }
              }}
            />
            <Button type="button" onClick={() => void handleCreateRole()} disabled={creating || !newRoleName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando funcoes...
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
              onClick={() => void loadRoles()}
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
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => {
                  const isEditing = editingRoleId === role.id;
                  const isBusy = updatingId === role.id;
                  return (
                    <TableRow key={role.id}>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={editingRoleName}
                            onChange={(e) => setEditingRoleName(e.target.value)}
                            disabled={isBusy}
                            autoFocus
                          />
                        ) : (
                          <span className="font-medium">{role.nome}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={role.ativo ? "default" : "outline"}>
                          {role.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {role.created_at ? new Date(role.created_at).toLocaleDateString("pt-BR") : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <>
                              {isEditing ? (
                                <>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    onClick={() => void handleSaveEdit(role.id)}
                                    disabled={isBusy || !editingRoleName.trim()}
                                  >
                                    <Save className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingRoleId(null);
                                      setEditingRoleName("");
                                    }}
                                    disabled={isBusy}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingRoleId(role.id);
                                    setEditingRoleName(role.nome);
                                  }}
                                  disabled={isBusy}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}

                          <Switch
                            checked={role.ativo}
                            onCheckedChange={(checked) => {
                              void handleToggleActive(role, checked);
                            }}
                            disabled={!canEdit || isBusy}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
