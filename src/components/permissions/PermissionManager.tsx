import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/services/api";
import {
  BookOpen,
  Building2,
  Calendar,
  Check,
  ChevronsUpDown,
  ClipboardList,
  Filter,
  FolderCog,
  Loader2,
  Search,
  Settings2,
  Shield,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  role: string;
  status: string;
  last_login_at?: string | null;
};

type Module = {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
};

type Permission = {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
};

type UserPermissionDetail = {
  id?: string;
  user_id: string;
  module_id: string;
  permission_id: string;
};

type ModuleAccessFilter = "all" | "with_access" | "without_access";

const CRUD_PERMISSION_NAMES = ["view", "create", "edit", "delete"] as const;
const MUTATION_CHUNK_SIZE = 15;
const MUTATION_RETRY_LIMIT = 1;

type PermissionMutationType = "grant" | "revoke";

type PermissionMutationOperation = {
  key: string;
  type: PermissionMutationType;
  moduleId: string;
  permissionId: string;
};

type PermissionMutationFailure = PermissionMutationOperation & {
  message: string;
};

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

function toPermissionKey(moduleId: string, permissionId: string) {
  return `${moduleId}:${permissionId}`;
}

function parsePermissionKey(key: string) {
  const [moduleId, permissionId] = key.split(":");
  return { moduleId, permissionId };
}

function buildSetFromDetails(details: UserPermissionDetail[]) {
  return details.map((item) => toPermissionKey(item.module_id, item.permission_id));
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem registro";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem registro";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function areSetArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  for (const item of right) {
    if (!leftSet.has(item)) return false;
  }
  return true;
}

function getModuleIcon(moduleName: string) {
  const normalized = normalizeText(moduleName);
  if (normalized.includes("agenda")) return Calendar;
  if (normalized.includes("pre_agendamento")) return BookOpen;
  if (normalized.includes("pre_cadastro")) return UserPlus;
  if (normalized.includes("entrevista")) return Users;
  if (normalized.includes("avaliacao")) return ClipboardList;
  if (normalized.includes("vaga")) return UserCheck;
  if (normalized.includes("profissional")) return Building2;
  if (normalized.includes("configuracao") || normalized.includes("setting")) return Settings2;
  return FolderCog;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = normalizeText(status);
  if (normalized === "ativo") return "default";
  if (normalized === "pendente") return "secondary";
  if (normalized === "bloqueado" || normalized === "rejeitado") return "destructive";
  return "outline";
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  const normalized = normalizeText(role);
  if (["admin", "administrador", "coordenador_geral"].includes(normalized)) return "default";
  if (["usuario", "users", "user"].includes(normalized)) return "secondary";
  return "outline";
}

export function PermissionManager() {
  const { userProfile, refreshSession } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  const [pageLoading, setPageLoading] = useState(true);
  const [selectedUserLoading, setSelectedUserLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [draftPermissionKeys, setDraftPermissionKeys] = useState<string[]>([]);
  const [baselinePermissionKeys, setBaselinePermissionKeys] = useState<string[]>([]);

  const [moduleSearchTerm, setModuleSearchTerm] = useState("");
  const [moduleAccessFilter, setModuleAccessFilter] = useState<ModuleAccessFilter>("all");

  const [userComboOpen, setUserComboOpen] = useState(false);
  const [confirmClearAccessOpen, setConfirmClearAccessOpen] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [pendingUserSelection, setPendingUserSelection] = useState<string | null>(null);

  const { toast } = useToast();

  function getAuthHeaders(withJson = false) {
    const raw = sessionStorage.getItem("token") || localStorage.getItem("token");
    let token = "";

    if (raw) {
      try {
        token = JSON.parse(raw);
      } catch {
        token = raw;
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (withJson) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  async function parseJson<T>(res: Response, fallbackMessage: string): Promise<T> {
    const contentType = (res.headers.get("content-type") || "").toLowerCase();

    if (!res.ok) {
      let message = fallbackMessage;
      try {
        if (contentType.includes("application/json")) {
          const payload = await res.json();
          if (payload?.message) {
            message = payload.message;
          }
        } else {
          const text = (await res.text()).trim();
          if (text) {
            message = `${fallbackMessage} (HTTP ${res.status})`;
          }
        }
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }

    if (!contentType.includes("application/json")) {
      throw new Error(`${fallbackMessage}: resposta invalida do servidor`);
    }

    try {
      return (await res.json()) as T;
    } catch {
      throw new Error(`${fallbackMessage}: resposta JSON invalida`);
    }
  }

  const selectedUser = useMemo(
    () => users.find((user) => String(user.id) === String(selectedUserId)) || null,
    [selectedUserId, users]
  );

  const pendingTargetUser = useMemo(() => {
    if (!pendingUserSelection) return null;
    return users.find((user) => String(user.id) === String(pendingUserSelection)) || null;
  }, [pendingUserSelection, users]);

  const permissionsByName = useMemo(() => {
    const map = new Map<string, Permission>();
    for (const permission of permissions) {
      map.set(normalizeText(permission.name), permission);
    }
    return map;
  }, [permissions]);

  const modulesById = useMemo(() => {
    const map = new Map<string, Module>();
    for (const moduleItem of modules) {
      map.set(String(moduleItem.id), moduleItem);
    }
    return map;
  }, [modules]);

  const permissionsById = useMemo(() => {
    const map = new Map<string, Permission>();
    for (const permissionItem of permissions) {
      map.set(String(permissionItem.id), permissionItem);
    }
    return map;
  }, [permissions]);

  const viewPermissionId = permissionsByName.get("view")?.id || null;
  const createPermissionId = permissionsByName.get("create")?.id || null;
  const editPermissionId = permissionsByName.get("edit")?.id || null;
  const deletePermissionId = permissionsByName.get("delete")?.id || null;

  const extraPermissions = useMemo(() => {
    const crudNames = new Set<string>(CRUD_PERMISSION_NAMES);
    return permissions.filter((permission) => !crudNames.has(normalizeText(permission.name)));
  }, [permissions]);

  const draftPermissionSet = useMemo(() => new Set(draftPermissionKeys), [draftPermissionKeys]);
  const baselinePermissionSet = useMemo(
    () => new Set(baselinePermissionKeys),
    [baselinePermissionKeys]
  );

  const hasPendingChanges = useMemo(
    () => !areSetArraysEqual(draftPermissionKeys, baselinePermissionKeys),
    [baselinePermissionKeys, draftPermissionKeys]
  );

  const pendingChangesCount = useMemo(() => {
    const grantCount = draftPermissionKeys.filter((key) => !baselinePermissionSet.has(key)).length;
    const revokeCount = baselinePermissionKeys.filter((key) => !draftPermissionSet.has(key)).length;
    return grantCount + revokeCount;
  }, [baselinePermissionKeys, baselinePermissionSet, draftPermissionKeys, draftPermissionSet]);

  const filteredModules = useMemo(() => {
    const term = normalizeText(moduleSearchTerm);

    return modules.filter((moduleItem) => {
      const searchable = `${moduleItem.display_name || ""} ${moduleItem.name || ""} ${
        moduleItem.description || ""
      }`;
      const matchesSearch = !term || normalizeText(searchable).includes(term);

      if (!matchesSearch) return false;

      const moduleHasAnyPermission = permissions.some((permission) =>
        draftPermissionSet.has(toPermissionKey(moduleItem.id, permission.id))
      );

      if (moduleAccessFilter === "with_access") return moduleHasAnyPermission;
      if (moduleAccessFilter === "without_access") return !moduleHasAnyPermission;
      return true;
    });
  }, [draftPermissionSet, moduleAccessFilter, moduleSearchTerm, modules, permissions]);

  function hasDraftPermission(moduleId: string, permissionId: string | null | undefined) {
    if (!permissionId) return false;
    return draftPermissionSet.has(toPermissionKey(moduleId, permissionId));
  }

  function applyDraftSet(nextSet: Set<string>) {
    setDraftPermissionKeys(Array.from(nextSet));
  }

  function handlePermissionToggle(moduleId: string, permissionId: string, enabled: boolean) {
    const nextSet = new Set(draftPermissionSet);
    const targetKey = toPermissionKey(moduleId, permissionId);

    if (enabled) {
      nextSet.add(targetKey);

      if ([createPermissionId, editPermissionId, deletePermissionId].includes(permissionId) && viewPermissionId) {
        nextSet.add(toPermissionKey(moduleId, viewPermissionId));
      }
    } else {
      nextSet.delete(targetKey);

      if (viewPermissionId && permissionId === viewPermissionId) {
        if (createPermissionId) nextSet.delete(toPermissionKey(moduleId, createPermissionId));
        if (editPermissionId) nextSet.delete(toPermissionKey(moduleId, editPermissionId));
        if (deletePermissionId) nextSet.delete(toPermissionKey(moduleId, deletePermissionId));
      }
    }

    applyDraftSet(nextSet);
  }

  function grantBasicDraft() {
    if (!selectedUserId || !viewPermissionId) return;
    const nextSet = new Set(draftPermissionSet);

    for (const moduleItem of modules) {
      nextSet.add(toPermissionKey(moduleItem.id, viewPermissionId));
    }

    applyDraftSet(nextSet);
  }

  function grantAllDraft() {
    if (!selectedUserId) return;
    const nextSet = new Set(draftPermissionSet);

    for (const moduleItem of modules) {
      for (const permission of permissions) {
        nextSet.add(toPermissionKey(moduleItem.id, permission.id));
      }
    }

    applyDraftSet(nextSet);
  }

  function clearAllDraft() {
    if (!selectedUserId) return;
    setConfirmClearAccessOpen(false);
    applyDraftSet(new Set());
  }

  async function loadUsers() {
    const response = await fetch(`${API_BASE_URL}/permissions/users`, {
      headers: getAuthHeaders(),
    });

    const payload = await parseJson<{ users?: User[] }>(response, "Erro ao carregar usuarios");
    const list = Array.isArray(payload?.users) ? payload.users : [];

    setUsers(
      list
        .filter((user) => normalizeText(user.status) !== "rejeitado")
        .map((user) => ({ ...user, id: String(user.id) }))
    );
  }

  async function loadModules() {
    const response = await fetch(`${API_BASE_URL}/permissions/modules`, {
      headers: getAuthHeaders(),
    });

    const payload = await parseJson<{ modules?: Module[] }>(response, "Erro ao carregar modulos");
    const list = Array.isArray(payload?.modules) ? payload.modules : [];

    setModules(list.map((item) => ({ ...item, id: String(item.id) })));
  }

  async function loadPermissionsList() {
    const response = await fetch(`${API_BASE_URL}/permissions/permissions`, {
      headers: getAuthHeaders(),
    });

    const payload = await parseJson<{ permissions?: Permission[] }>(
      response,
      "Erro ao carregar permissoes"
    );
    const list = Array.isArray(payload?.permissions) ? payload.permissions : [];

    setPermissions(list.map((item) => ({ ...item, id: String(item.id) })));
  }

  async function loadSelectedUserPermissions(userId: string) {
    if (!userId) {
      setBaselinePermissionKeys([]);
      setDraftPermissionKeys([]);
      return;
    }

    setSelectedUserLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/permissions/users/${userId}/permissions`, {
        headers: getAuthHeaders(),
      });

      const payload = await parseJson<{ permissions?: UserPermissionDetail[] }>(
        response,
        "Erro ao carregar permissoes do usuario"
      );

      const details = Array.isArray(payload?.permissions) ? payload.permissions : [];
      const permissionKeys = buildSetFromDetails(
        details.map((detail) => ({
          ...detail,
          module_id: String(detail.module_id),
          permission_id: String(detail.permission_id),
        }))
      );

      setBaselinePermissionKeys(permissionKeys);
      setDraftPermissionKeys(permissionKeys);
    } catch (error) {
      setBaselinePermissionKeys([]);
      setDraftPermissionKeys([]);
      toast({
        title: "Permissoes",
        description: error instanceof Error ? error.message : "Falha ao carregar permissoes",
        variant: "destructive",
      });
    } finally {
      setSelectedUserLoading(false);
    }
  }

  function chunkArray<T>(items: T[], chunkSize: number) {
    const safeSize = Number.isFinite(chunkSize) && chunkSize > 0 ? Math.floor(chunkSize) : 1;
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += safeSize) {
      chunks.push(items.slice(index, index + safeSize));
    }
    return chunks;
  }

  function formatOperationLabel(operation: PermissionMutationOperation) {
    const moduleLabel =
      modulesById.get(operation.moduleId)?.display_name ||
      modulesById.get(operation.moduleId)?.name ||
      operation.moduleId;
    const permissionLabel =
      permissionsById.get(operation.permissionId)?.display_name ||
      permissionsById.get(operation.permissionId)?.name ||
      operation.permissionId;
    const actionLabel = operation.type === "grant" ? "Conceder" : "Revogar";

    return `${actionLabel} ${moduleLabel} > ${permissionLabel}`;
  }

  async function runMutationOperation(operation: PermissionMutationOperation) {
    const endpoint = operation.type === "grant" ? "grant" : "revoke";
    const fallbackMessage =
      operation.type === "grant" ? "Erro ao conceder permissao" : "Erro ao revogar permissao";

    const response = await fetch(
      `${API_BASE_URL}/permissions/users/${selectedUserId}/${endpoint}`,
      {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          moduleId: operation.moduleId,
          permissionId: operation.permissionId,
        }),
      }
    );

    await parseJson(response, fallbackMessage);
  }

  async function runMutationWithRetry(
    operation: PermissionMutationOperation,
    retryLimit: number
  ) {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      try {
        await runMutationOperation(operation);
        return;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error("Falha desconhecida ao salvar permissao");
        if (attempt < retryLimit) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error("Falha ao salvar permissao");
  }

  async function saveChanges() {
    if (!selectedUserId || !hasPendingChanges) return;

    const grantOperations: PermissionMutationOperation[] = draftPermissionKeys
      .filter((key) => !baselinePermissionSet.has(key))
      .map((key) => {
        const { moduleId, permissionId } = parsePermissionKey(key);
        return { key, type: "grant", moduleId, permissionId };
      });

    const revokeOperations: PermissionMutationOperation[] = baselinePermissionKeys
      .filter((key) => !draftPermissionSet.has(key))
      .map((key) => {
        const { moduleId, permissionId } = parsePermissionKey(key);
        return { key, type: "revoke", moduleId, permissionId };
      });

    const operations = [...grantOperations, ...revokeOperations];
    if (operations.length === 0) return;

    setSaving(true);
    try {
      const failures: PermissionMutationFailure[] = [];

      for (const chunk of chunkArray(operations, MUTATION_CHUNK_SIZE)) {
        const chunkResults = await Promise.allSettled(
          chunk.map((operation) => runMutationWithRetry(operation, MUTATION_RETRY_LIMIT))
        );

        chunkResults.forEach((result, index) => {
          if (result.status === "fulfilled") return;
          const failedOperation = chunk[index];
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : "Falha desconhecida ao aplicar alteracao";
          failures.push({ ...failedOperation, message });
        });
      }

      if (failures.length > 0) {
        const details = failures
          .slice(0, 5)
          .map((failure) => `${formatOperationLabel(failure)} (${failure.message})`)
          .join("; ");

        toast({
          title: `Falha ao aplicar ${failures.length} alteracao(oes)`,
          description: details || "Algumas permissoes nao foram atualizadas.",
          variant: "destructive",
        });

        await loadSelectedUserPermissions(selectedUserId);
        return;
      }

      setBaselinePermissionKeys([...draftPermissionKeys]);
      const isEditingCurrentSessionUser =
        userProfile && String(userProfile.id) === String(selectedUserId);

      if (isEditingCurrentSessionUser) {
        try {
          await refreshSession();
        } catch (refreshError) {
          console.warn("Falha ao atualizar sessao apos salvar permissoes:", refreshError);
        }
      }

      toast({
        title: "Permissoes atualizadas",
        description: isEditingCurrentSessionUser
          ? "As alteracoes foram salvas e a sessao atual foi atualizada."
          : "As alteracoes foram salvas com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Falha ao salvar alteracoes",
        variant: "destructive",
      });
      await loadSelectedUserPermissions(selectedUserId);
    } finally {
      setSaving(false);
    }
  }

  function requestUserSelection(nextUserId: string) {
    if (nextUserId === selectedUserId) {
      setUserComboOpen(false);
      return;
    }

    if (hasPendingChanges && selectedUserId) {
      setPendingUserSelection(nextUserId);
      setConfirmDiscardOpen(true);
      return;
    }

    setSelectedUserId(nextUserId);
    setUserComboOpen(false);
  }

  function confirmDiscardAndSwitch() {
    if (!pendingUserSelection) {
      setConfirmDiscardOpen(false);
      return;
    }

    setSelectedUserId(pendingUserSelection);
    setPendingUserSelection(null);
    setConfirmDiscardOpen(false);
    setUserComboOpen(false);
  }

  function keepCurrentUserSelection() {
    setPendingUserSelection(null);
    setConfirmDiscardOpen(false);
  }

  useEffect(() => {
    const initialize = async () => {
      setPageLoading(true);
      try {
        await Promise.all([loadUsers(), loadModules(), loadPermissionsList()]);
      } catch (error) {
        toast({
          title: "Permissoes",
          description: error instanceof Error ? error.message : "Falha ao carregar dados iniciais",
          variant: "destructive",
        });
      } finally {
        setPageLoading(false);
      }
    };

    void initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadSelectedUserPermissions(selectedUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  if (pageLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-6">
      <div className="space-y-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard">Administracao</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Gerenciar Permissoes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Gerenciar Permissoes</h1>
            <p className="text-sm text-muted-foreground">
              Console de acesso por modulo com regras de consistencia entre Visualizar e CRUD.
            </p>
          </div>
          <Badge variant="outline" className="w-fit text-xs">
            <Shield className="mr-1 h-3.5 w-3.5" />
            {users.length} usuarios disponiveis
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Selecionar Usuario</CardTitle>
          <CardDescription>
            Busque por nome, email ou username para carregar e editar permissoes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Popover open={userComboOpen} onOpenChange={setUserComboOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={userComboOpen}
                className="h-10 w-full justify-between"
              >
                <span className="truncate text-left">
                  {selectedUser
                    ? `${selectedUser.name} (${selectedUser.email})`
                    : "Selecione um usuario"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
              <Command>
                <CommandInput placeholder="Buscar por nome, email ou username..." />
                <CommandList>
                  <CommandEmpty>Nenhum usuario encontrado.</CommandEmpty>
                  <CommandGroup>
                    {users.map((user) => {
                      const isSelected = String(user.id) === String(selectedUserId);

                      return (
                        <CommandItem
                          key={user.id}
                          value={`${user.name} ${user.email} ${user.username || ""} ${user.role}`}
                          onSelect={() => requestUserSelection(String(user.id))}
                        >
                          <div className="flex w-full items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{user.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {user.email}
                                {user.username ? ` � ${user.username}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant={getRoleBadgeVariant(user.role)} className="text-[10px]">
                                {user.role}
                              </Badge>
                              <Badge variant={getStatusVariant(user.status)} className="text-[10px]">
                                {user.status}
                              </Badge>
                              {isSelected && <Check className="h-4 w-4 text-primary" />}
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedUser && (
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 md:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nome</p>
                <p className="text-sm font-medium">{selectedUser.name}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{selectedUser.email}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Role</p>
                <p className="text-sm font-medium">{selectedUser.role}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
                <Badge variant={getStatusVariant(selectedUser.status)}>{selectedUser.status}</Badge>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ultimo login</p>
                <p className="text-sm">{formatDateTime(selectedUser.last_login_at)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Permissoes ativas</p>
                <p className="text-sm font-semibold">{draftPermissionKeys.length}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedUserId && (
        <Card className="sticky top-[72px] z-20 border-primary/20 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={grantBasicDraft}
                disabled={!selectedUserId || saving || selectedUserLoading || !viewPermissionId}
              >
                Acesso Basico
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={grantAllDraft}
                disabled={!selectedUserId || saving || selectedUserLoading}
              >
                Acesso Total
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmClearAccessOpen(true)}
                disabled={!selectedUserId || saving || selectedUserLoading || draftPermissionKeys.length === 0}
              >
                Remover Acessos
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={hasPendingChanges ? "secondary" : "outline"}>
                {pendingChangesCount} alteracoes pendentes
              </Badge>
              <Button onClick={() => void saveChanges()} disabled={!hasPendingChanges || saving || selectedUserLoading}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alteracoes"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base">Permissoes por Modulo</CardTitle>
              <CardDescription>
                Marque as permissoes necessarias por modulo. Regras de consistencia sao aplicadas automaticamente.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <div className="relative md:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={moduleSearchTerm}
                  onChange={(event) => setModuleSearchTerm(event.target.value)}
                  placeholder="Buscar modulo"
                  className="pl-9"
                />
              </div>
              <Select
                value={moduleAccessFilter}
                onValueChange={(value) => setModuleAccessFilter(value as ModuleAccessFilter)}
              >
                <SelectTrigger className="md:w-[220px]">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os modulos</SelectItem>
                  <SelectItem value="with_access">Somente com acesso</SelectItem>
                  <SelectItem value="without_access">Somente sem acesso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedUserId ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Selecione um usuario para visualizar e editar permissoes.
            </div>
          ) : selectedUserLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-10 w-full" />
              ))}
            </div>
          ) : modules.length === 0 || permissions.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nao ha modulos/permissoes cadastrados para configuracao.
            </div>
          ) : filteredModules.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum modulo encontrado com os filtros atuais.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <TableHead className="min-w-[280px]">Modulo</TableHead>
                    <TableHead className="w-[130px] text-center">Visualizar</TableHead>
                    <TableHead className="w-[110px] text-center">Criar</TableHead>
                    <TableHead className="w-[110px] text-center">Editar</TableHead>
                    <TableHead className="w-[110px] text-center">Excluir</TableHead>
                    {extraPermissions.length > 0 && (
                      <TableHead className="min-w-[220px]">Permissoes especiais</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredModules.map((moduleItem) => {
                    const ModuleIcon = getModuleIcon(moduleItem.name);

                    return (
                      <TableRow key={moduleItem.id}>
                        <TableCell>
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-md border bg-muted p-1.5">
                              <ModuleIcon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">{moduleItem.display_name || moduleItem.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {moduleItem.description || "Sem descricao"}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-center">
                          {viewPermissionId ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex">
                                  <Checkbox
                                    checked={hasDraftPermission(moduleItem.id, viewPermissionId)}
                                    onCheckedChange={(checked) =>
                                      handlePermissionToggle(
                                        moduleItem.id,
                                        viewPermissionId,
                                        checked === true
                                      )
                                    }
                                    aria-label={`Visualizar ${moduleItem.display_name}`}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Sem visualizar, as permissoes CRUD do modulo sao removidas.</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {createPermissionId ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex">
                                  <Checkbox
                                    checked={hasDraftPermission(moduleItem.id, createPermissionId)}
                                    onCheckedChange={(checked) =>
                                      handlePermissionToggle(
                                        moduleItem.id,
                                        createPermissionId,
                                        checked === true
                                      )
                                    }
                                    aria-label={`Criar ${moduleItem.display_name}`}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Ao marcar Criar, Visualizar e marcado automaticamente.</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {editPermissionId ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex">
                                  <Checkbox
                                    checked={hasDraftPermission(moduleItem.id, editPermissionId)}
                                    onCheckedChange={(checked) =>
                                      handlePermissionToggle(
                                        moduleItem.id,
                                        editPermissionId,
                                        checked === true
                                      )
                                    }
                                    aria-label={`Editar ${moduleItem.display_name}`}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Ao marcar Editar, Visualizar e marcado automaticamente.</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {deletePermissionId ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex">
                                  <Checkbox
                                    checked={hasDraftPermission(moduleItem.id, deletePermissionId)}
                                    onCheckedChange={(checked) =>
                                      handlePermissionToggle(
                                        moduleItem.id,
                                        deletePermissionId,
                                        checked === true
                                      )
                                    }
                                    aria-label={`Excluir ${moduleItem.display_name}`}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Ao marcar Excluir, Visualizar e marcado automaticamente.</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        {extraPermissions.length > 0 && (
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {extraPermissions.map((permission) => {
                                const permissionChecked = hasDraftPermission(moduleItem.id, permission.id);
                                return (
                                  <label
                                    key={`${moduleItem.id}:${permission.id}`}
                                    className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                                  >
                                    <Checkbox
                                      checked={permissionChecked}
                                      onCheckedChange={(checked) =>
                                        handlePermissionToggle(
                                          moduleItem.id,
                                          permission.id,
                                          checked === true
                                        )
                                      }
                                      aria-label={`${permission.display_name} ${moduleItem.display_name}`}
                                    />
                                    <span>{permission.display_name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmClearAccessOpen} onOpenChange={setConfirmClearAccessOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover todos os acessos?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os checkboxes serao desmarcados para o usuario selecionado. A alteracao so sera
              aplicada apos clicar em "Salvar Alteracoes".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={clearAllDraft}>Remover acessos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alteracoes pendentes?</AlertDialogTitle>
            <AlertDialogDescription>
              Existem alteracoes nao salvas para {selectedUser?.name || "o usuario atual"}. Deseja
              descartar e trocar para {pendingTargetUser?.name || "outro usuario"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={keepCurrentUserSelection}>Manter usuario atual</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardAndSwitch}>Descartar e trocar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
