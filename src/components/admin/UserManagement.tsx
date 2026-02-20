import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiService, API_BASE_URL, ManagedUser } from "@/services/api";
import {
  CheckCircle2,
  KeyRound,
  Link2,
  Lock,
  Search,
  ShieldAlert,
  Trash2,
  Unlink2,
  Unlock,
  UserX,
  XCircle,
} from "lucide-react";

type TabValue = "pending" | "all";
type StatusFilter = "all" | "ativo" | "pendente" | "bloqueado" | "rejeitado";

type ProfessionalOption = {
  id: string;
  user_name?: string | null;
  role_nome?: string | null;
  funcao?: string | null;
  linked_user_id?: string | null;
};

function professionalLabel(professional: ProfessionalOption) {
  const name =
    (professional.user_name || professional.role_nome || professional.funcao || "")
      .toString()
      .trim() || `Profissional ${professional.id}`;
  return `${name} (#${professional.id})`;
}

export function UserManagement() {
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabValue>("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetModal, setResetModal] = useState<{ open: boolean; user: ManagedUser | null }>({
    open: false,
    user: null,
  });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; user: ManagedUser | null }>({
    open: false,
    user: null,
  });
  const [linkModal, setLinkModal] = useState<{
    open: boolean;
    user: ManagedUser | null;
  }>({
    open: false,
    user: null,
  });
  const [professionalOptions, setProfessionalOptions] = useState<ProfessionalOption[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("");
  const [loadingProfessionalOptions, setLoadingProfessionalOptions] = useState(false);
  const [resetPasswords, setResetPasswords] = useState({ password: "", confirm: "" });
  const { toast } = useToast();

  const currentUser = useMemo(() => {
    const raw = sessionStorage.getItem("user") ?? localStorage.getItem("user");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { id?: string | number; role?: string };
    } catch {
      return null;
    }
  }, []);

  const currentUserId = (currentUser?.id || "").toString();
  const currentUserRole = (currentUser?.role || "").toString().trim().toLowerCase();
  const managerRoles = ["admin", "gestao", "gestão", "gestor", "coordenador geral", "administrador"];
  const canManageUsers = managerRoles.includes(currentUserRole);

  const getAuthHeaders = (withJson = false) => {
    const raw = sessionStorage.getItem("token") || localStorage.getItem("token");
    let token = "";
    if (raw) {
      try {
        token = JSON.parse(raw);
      } catch {
        token = raw;
      }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (withJson) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const canManageTarget = (target: ManagedUser) => {
    const targetRole = (target.role || "").toString().trim().toLowerCase();
    if (!canManageUsers) return false;
    if (targetRole === "admin" && currentUserRole !== "admin") return false;
    return true;
  };

  const canDeleteTarget = (target: ManagedUser) => {
    if (!canManageTarget(target)) return false;
    return String(target.id) !== currentUserId;
  };

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const payload = await apiService.getUsers();
      const ordered = [...payload.users].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setAllUsers(ordered);
    } catch (error) {
      console.error("Erro ao buscar usuarios:", error);
      setAllUsers([]);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao carregar usuarios",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadProfessionalOptions = useCallback(async () => {
    try {
      setLoadingProfessionalOptions(true);
      const response = await apiService.getProfessionals();
      const list = Array.isArray(response?.professionals)
        ? (response.professionals as ProfessionalOption[])
        : Array.isArray(response)
          ? (response as ProfessionalOption[])
          : [];
      setProfessionalOptions(list);
    } catch (error) {
      setProfessionalOptions([]);
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Nao foi possivel carregar profissionais para vinculacao",
        variant: "destructive",
      });
    } finally {
      setLoadingProfessionalOptions(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!linkModal.open) return;
    void loadProfessionalOptions();
  }, [linkModal.open, loadProfessionalOptions]);

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return allUsers.filter((user) => {
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      const username = (user.username || "").toLowerCase();
      const statusMatches = statusFilter === "all" || user.status === statusFilter;
      const queryMatches =
        !query || name.includes(query) || email.includes(query) || username.includes(query);
      return statusMatches && queryMatches;
    });
  }, [allUsers, searchTerm, statusFilter]);

  const pendingUsers = useMemo(
    () => filteredUsers.filter((user) => user.status === "pendente"),
    [filteredUsers]
  );

  const usersToRender = activeTab === "pending" ? pendingUsers : filteredUsers;
  const linkableProfessionalOptions = useMemo(() => {
    return professionalOptions.filter((professional) => {
      if (!professional.linked_user_id) return true;
      if (!linkModal.user?.id) return false;
      return String(professional.linked_user_id) === String(linkModal.user.id);
    });
  }, [linkModal.user?.id, professionalOptions]);

  useEffect(() => {
    if (!linkModal.open) return;
    if (selectedProfessionalId) return;
    if (linkableProfessionalOptions.length === 0) return;
    setSelectedProfessionalId(String(linkableProfessionalOptions[0].id));
  }, [linkModal.open, linkableProfessionalOptions, selectedProfessionalId]);

  const runStatusAction = async (
    userId: string | number,
    action: "approve" | "reject" | "block",
    successMessage: string
  ) => {
    const endpointByAction = {
      approve: `${API_BASE_URL}/users/${userId}/approve`,
      reject: `${API_BASE_URL}/users/${userId}/reject`,
      block: `${API_BASE_URL}/users/${userId}/block`,
    };

    try {
      setActionLoading(`${action}:${userId}`);
      const response = await fetch(endpointByAction[action], {
        method: "PATCH",
        headers: getAuthHeaders(true),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || `Falha ao executar acao (${response.status})`);
      }

      toast({ title: "Sucesso", description: successMessage });
      await fetchUsers();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao processar acao",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleForcePasswordChange = async (user: ManagedUser) => {
    try {
      setActionLoading(`force:${user.id}`);
      const result = await apiService.forcePasswordChange(user.id);
      toast({
        title: "Politica de senha atualizada",
        description: result.message,
      });
      await fetchUsers();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Nao foi possivel forcar a redefinicao de senha",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async () => {
    const target = deleteModal.user;
    if (!target) return;

    try {
      setActionLoading(`delete:${target.id}`);
      const result = await apiService.deleteUser(target.id);
      toast({
        title: "Usuario excluido",
        description: result.message,
      });
      setDeleteModal({ open: false, user: null });
      await fetchUsers();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Nao foi possivel excluir o usuario",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const openLinkModal = (user: ManagedUser) => {
    setSelectedProfessionalId("");
    setLinkModal({ open: true, user });
  };

  const handleLinkProfessional = async () => {
    const target = linkModal.user;
    if (!target) return;
    if (!selectedProfessionalId) {
      toast({
        title: "Vinculacao",
        description: "Selecione um profissional para vincular.",
        variant: "destructive",
      });
      return;
    }

    try {
      setActionLoading(`link:${target.id}`);
      const result = await apiService.linkUserToProfessional(target.id, selectedProfessionalId);
      toast({
        title: "Vinculo atualizado",
        description: result.message,
      });
      setLinkModal({ open: false, user: null });
      setSelectedProfessionalId("");
      await fetchUsers();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Nao foi possivel vincular usuario ao profissional",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlinkProfessional = async (user: ManagedUser) => {
    try {
      setActionLoading(`unlink:${user.id}`);
      const result = await apiService.unlinkUserFromProfessional(
        user.id,
        user.professional_id ? String(user.professional_id) : undefined
      );
      toast({
        title: "Vinculo removido",
        description: result.message,
      });
      await fetchUsers();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Nao foi possivel remover vinculo profissional",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async () => {
    const target = resetModal.user;
    if (!target) return;

    if (resetPasswords.password !== resetPasswords.confirm) {
      toast({
        title: "Erro",
        description: "As senhas nao coincidem.",
        variant: "destructive",
      });
      return;
    }

    if (resetPasswords.password.length < 8) {
      toast({
        title: "Erro",
        description: "A nova senha deve ter no minimo 8 caracteres.",
        variant: "destructive",
      });
      return;
    }

    try {
      setActionLoading(`reset:${target.id}`);
      const endpoint = `${API_BASE_URL}/users/${target.id}/reset-password`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ password: resetPasswords.password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Falha ao redefinir senha");
      }

      toast({
        title: "Senha redefinida",
        description: `Senha de ${target.name} redefinida com sucesso.`,
      });
      setResetModal({ open: false, user: null });
      setResetPasswords({ password: "", confirm: "" });
      await fetchUsers();
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error ? error.message : "Erro ao redefinir senha",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ativo":
        return (
          <Badge variant="outline" className="border-green-300 text-green-700">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Ativo
          </Badge>
        );
      case "pendente":
        return (
          <Badge variant="secondary">
            <ShieldAlert className="mr-1 h-3 w-3" />
            Pendente
          </Badge>
        );
      case "bloqueado":
        return (
          <Badge variant="destructive">
            <Lock className="mr-1 h-3 w-3" />
            Bloqueado
          </Badge>
        );
      case "rejeitado":
        return (
          <Badge variant="outline">
            <XCircle className="mr-1 h-3 w-3" />
            Rejeitado
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("pt-BR");
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="sticky top-0 z-20 border-b bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="space-y-3">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold leading-tight">Gerenciar Usuarios</h1>
            <p className="text-xs text-muted-foreground">
              Controle de aprovacoes, bloqueios e politicas de acesso.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por nome, email ou usuario"
                className="h-8 pl-9 text-sm"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="bloqueado">Bloqueado</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
            <TabsList className="h-8">
              <TabsTrigger value="pending" className="text-xs">
                Pendentes ({pendingUsers.length})
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs">
                Todos ({filteredUsers.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          </div>
        ) : usersToRender.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <UserX className="h-8 w-8" />
            <p className="text-sm">Nenhum usuario encontrado com os filtros atuais.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nome</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Usuario</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Funcao</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Vinculado a Profissional
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Senha</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Cadastro</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {usersToRender.map((user) => {
                const isRowLoading = actionLoading?.includes(`:${user.id}`) ?? false;
                const canManage = canManageTarget(user);
                const canDelete = canDeleteTarget(user);

                return (
                  <tr key={user.id} className="border-b align-top hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <div className="font-medium leading-tight">{user.name}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{user.username}</td>
                    <td className="px-3 py-2 text-muted-foreground">{user.email}</td>
                    <td className="px-3 py-2 text-muted-foreground">{user.role}</td>
                    <td className="px-3 py-2">
                      {user.professional_id ? (
                        <Badge variant="outline" className="border-primary/40 text-primary">
                          {user.professional_label || `Profissional #${user.professional_id}`}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Nao vinculado</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">{getStatusBadge(user.status)}</td>
                    <td className="px-3 py-2">
                      {user.must_change_password ? (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          Obrigatoria
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Normal
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(user.created_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {user.status === "pendente" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={isRowLoading || !canManage}
                              onClick={() =>
                                runStatusAction(user.id, "approve", "Usuario aprovado com sucesso.")
                              }
                            >
                              Aprovar
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={isRowLoading || !canManage}
                              onClick={() =>
                                runStatusAction(user.id, "reject", "Usuario rejeitado com sucesso.")
                              }
                            >
                              Rejeitar
                            </Button>
                          </>
                        )}

                        {user.status === "ativo" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isRowLoading || !canManage}
                            onClick={() =>
                              runStatusAction(user.id, "block", "Usuario bloqueado com sucesso.")
                            }
                          >
                            <Lock className="mr-1 h-3.5 w-3.5" />
                            Bloquear
                          </Button>
                        )}

                        {user.status === "bloqueado" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isRowLoading || !canManage}
                            onClick={() =>
                              runStatusAction(user.id, "approve", "Usuario ativado com sucesso.")
                            }
                          >
                            <Unlock className="mr-1 h-3.5 w-3.5" />
                            Ativar
                          </Button>
                        )}

                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isRowLoading || !canManage}
                          onClick={() => setResetModal({ open: true, user })}
                        >
                          <KeyRound className="mr-1 h-3.5 w-3.5" />
                          Resetar
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isRowLoading || !canManage}
                          onClick={() => handleForcePasswordChange(user)}
                        >
                          Forcar senha
                        </Button>

                        {user.professional_id ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isRowLoading || !canManage}
                            onClick={() => handleUnlinkProfessional(user)}
                          >
                            <Unlink2 className="mr-1 h-3.5 w-3.5" />
                            Desvincular
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isRowLoading || !canManage}
                            onClick={() => openLinkModal(user)}
                          >
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            Vincular
                          </Button>
                        )}

                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isRowLoading || !canDelete}
                          onClick={() => setDeleteModal({ open: true, user })}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog
        open={linkModal.open}
        onOpenChange={(open) => {
          if (!open) {
            setLinkModal({ open: false, user: null });
            setSelectedProfessionalId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular usuario a profissional</DialogTitle>
            <DialogDescription>
              Associe {linkModal.user?.name} a um cadastro de profissional existente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="professional-link">Profissional</Label>
            <Select
              value={selectedProfessionalId}
              onValueChange={setSelectedProfessionalId}
              disabled={loadingProfessionalOptions || linkableProfessionalOptions.length === 0}
            >
              <SelectTrigger id="professional-link">
                <SelectValue
                  placeholder={
                    loadingProfessionalOptions
                      ? "Carregando profissionais..."
                      : "Selecione o profissional"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {linkableProfessionalOptions.map((professional) => (
                  <SelectItem key={professional.id} value={String(professional.id)}>
                    {professionalLabel(professional)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {linkableProfessionalOptions.length === 0 && !loadingProfessionalOptions ? (
              <p className="text-xs text-muted-foreground">
                Nenhum profissional disponivel para vinculacao.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLinkModal({ open: false, user: null });
                setSelectedProfessionalId("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleLinkProfessional}
              disabled={
                actionLoading?.startsWith("link:") ||
                !selectedProfessionalId ||
                linkableProfessionalOptions.length === 0
              }
            >
              {actionLoading?.startsWith("link:") ? "Vinculando..." : "Confirmar vinculacao"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetModal.open}
        onOpenChange={(open) => {
          if (!open) {
            setResetModal({ open: false, user: null });
            setResetPasswords({ password: "", confirm: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para {resetModal.user?.name}. O usuario precisara
              atualizar essa senha no primeiro acesso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={resetPasswords.password}
                onChange={(event) =>
                  setResetPasswords((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="Minimo 8 caracteres"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={resetPasswords.confirm}
                onChange={(event) =>
                  setResetPasswords((prev) => ({ ...prev, confirm: event.target.value }))
                }
                placeholder="Repita a nova senha"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetModal({ open: false, user: null })}
            >
              Cancelar
            </Button>
            <Button onClick={handleResetPassword} disabled={actionLoading?.startsWith("reset:")}>
              {actionLoading?.startsWith("reset:") ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteModal.open}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteModal({ open: false, user: null });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir usuario</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o usuario abaixo?
            </DialogDescription>
          </DialogHeader>
          {deleteModal.user && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{deleteModal.user.name}</p>
              <p className="text-muted-foreground">{deleteModal.user.email}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteModal({ open: false, user: null })}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={actionLoading?.startsWith("delete:")}
            >
              {actionLoading?.startsWith("delete:") ? "Excluindo..." : "Confirmar exclusao"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
