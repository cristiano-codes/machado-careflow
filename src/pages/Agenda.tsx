import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PanelRightOpen,
  PlusCircle,
} from "lucide-react";

import { resolveAgendaEventPalette, agendaLegend, agendaStatusLegend } from "@/components/agenda/agendaPalette";
import { ProtectedRoute as ModuleProtectedRoute } from "@/components/common/ProtectedRoute";
import { JourneyStatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AGENDA_READ_REQUIRED_SCOPES } from "@/permissions/permissionMap";
import {
  apiService,
  type AgendaAppointmentItem,
  type AgendaAppointmentStatus,
  type ServiceOption,
  type SocialTriageQueueItem,
} from "@/services/api";

type AgendaViewMode = "day" | "week" | "month" | "list";
type AgendaRange = { from: Date; to: Date };
type FilterOption = { value: string; label: string };

type ProfessionalOption = {
  id: string;
  user_name?: string | null;
  role_nome?: string | null;
  funcao?: string | null;
  professional_name?: string | null;
  professional_role?: string | null;
  professional_specialty?: string | null;
};

type AccessContext = {
  professionalId: string | null;
  canViewAllProfessionals: boolean;
  allowProfessionalViewOthers: boolean;
  compatibilityMode: boolean;
  compatibilityNotice: string | null;
  accessMode: string | null;
};

type CreateForm = {
  patientId: string;
  professionalId: string;
  serviceId: string;
  date: string;
  time: string;
  notes: string;
  source: "manual" | "triagem_social";
};

const VIEW_ORDER: AgendaViewMode[] = ["day", "week", "month", "list"];
const VIEW_LABEL: Record<AgendaViewMode, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mes",
  list: "Lista",
};

function compactMultiLabel(selected: string[], options: FilterOption[], allLabel: string) {
  if (selected.length === 0) return allLabel;
  const labels = selected
    .map((value) => options.find((option) => option.value === value)?.label || value)
    .filter(Boolean);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.length} selecionados`;
}

function toggleMultiValue(current: string[], value: string) {
  if (!value) return current;
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}

function resolveOptionLabel(options: FilterOption[], value: string) {
  return options.find((option) => option.value === value)?.label || value;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value: string | null | undefined) {
  const text = (value || "").toString().trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const prefixed = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (prefixed?.[1]) return prefixed[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return toIsoDate(parsed);
}

function formatDateBr(value: string | null | undefined) {
  const normalized = normalizeDateKey(value);
  if (!normalized) return "-";
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString("pt-BR");
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  const text = (value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hours, minutes] = text.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeTime(value: string | null | undefined) {
  const text = (value || "").trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) return text.slice(0, 5);
  return "";
}

function normalizeStatus(value: AgendaAppointmentStatus | null | undefined) {
  const key = (value || "").toString().trim().toLowerCase();
  if (!key) return "nao_informado";
  if (["scheduled", "agendado"].includes(key)) return "agendado";
  if (["confirmed", "confirmado"].includes(key)) return "confirmado";
  if (["completed", "concluido"].includes(key)) return "concluido";
  if (["cancelled", "canceled", "cancelado"].includes(key)) return "cancelado";
  if (["rescheduled", "remarcado"].includes(key)) return "remarcado";
  return key;
}

function statusLabel(value: string) {
  const map: Record<string, string> = {
    agendado: "Agendado / pendente",
    confirmado: "Confirmado",
    cancelado: "Cancelado",
    concluido: "Concluido",
    remarcado: "Remarcado",
    nao_informado: "Nao informado",
  };
  return map[value] || value;
}

function profName(item: ProfessionalOption | AgendaAppointmentItem | null | undefined) {
  if (!item) return "-";
  const name =
    (item as ProfessionalOption).professional_name ||
    (item as ProfessionalOption).user_name ||
    (item as ProfessionalOption).role_nome ||
    (item as ProfessionalOption).funcao ||
    (item as AgendaAppointmentItem).professional_name ||
    (item as AgendaAppointmentItem).professional_role ||
    (item as AgendaAppointmentItem).professional_specialty;
  return name && name.trim().length > 0 ? name : `Profissional ${item.id}`;
}

function viewRange(mode: AgendaViewMode, cursor: Date): AgendaRange {
  if (mode === "day") return { from: cursor, to: cursor };
  if (mode === "week") return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
  if (mode === "month") {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    return { from: startOfWeek(start, { weekStartsOn: 1 }), to: endOfWeek(end, { weekStartsOn: 1 }) };
  }
  const from = startOfWeek(cursor, { weekStartsOn: 1 });
  return { from, to: addDays(from, 13) };
}

function shiftCursor(mode: AgendaViewMode, date: Date, dir: "prev" | "next") {
  if (mode === "day") return dir === "next" ? addDays(date, 1) : subDays(date, 1);
  if (mode === "week") return dir === "next" ? addWeeks(date, 1) : subWeeks(date, 1);
  if (mode === "month") return dir === "next" ? addMonths(date, 1) : subMonths(date, 1);
  return dir === "next" ? addDays(date, 14) : subDays(date, 14);
}

function mapProfessionals(raw: unknown): ProfessionalOption[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).professionals)
      ? ((raw as Record<string, unknown>).professionals as unknown[])
      : [];

  return list
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const p = entry as Record<string, unknown>;
      const id = p.id === null || p.id === undefined ? "" : String(p.id).trim();
      if (!id) return null;
      return {
        id,
        user_name: typeof p.user_name === "string" ? p.user_name : null,
        role_nome: typeof p.role_nome === "string" ? p.role_nome : null,
        funcao: typeof p.funcao === "string" ? p.funcao : null,
        professional_name: typeof p.professional_name === "string" ? p.professional_name : null,
        professional_role: typeof p.professional_role === "string" ? p.professional_role : null,
        professional_specialty:
          typeof p.professional_specialty === "string" ? p.professional_specialty : null,
      } satisfies ProfessionalOption;
    })
    .filter((item): item is ProfessionalOption => item !== null);
}

function buildSlots(opening: string | null | undefined, closing: string | null | undefined) {
  const start = parseTimeToMinutes(opening) ?? parseTimeToMinutes("08:00") ?? 480;
  const end = parseTimeToMinutes(closing) ?? parseTimeToMinutes("17:20") ?? 1040;
  if (end <= start) return ["08:00", "17:20"];
  const result: string[] = [];
  for (let cursor = start; cursor <= end; cursor += 30) {
    const h = Math.floor(cursor / 60);
    const m = cursor % 60;
    result.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return result;
}

function resolveSlotKey(time: string | null | undefined, slots: string[]) {
  const normalized = normalizeTime(time);
  if (!normalized) return "";
  if (slots.includes(normalized)) return normalized;
  const target = parseTimeToMinutes(normalized);
  if (target === null || slots.length === 0) return normalized;
  let fallback = slots[0];
  for (const slot of slots) {
    const minutes = parseTimeToMinutes(slot);
    if (minutes === null) continue;
    if (minutes <= target) fallback = slot;
    if (minutes > target) break;
  }
  return fallback;
}

function matchServiceHint(services: ServiceOption[], hint: string) {
  const raw = (hint || "").trim().toLowerCase();
  if (!raw) return null;
  const byId = services.find((item) => item.id === hint);
  if (byId) return byId;
  return services.find((item) => item.name.toLowerCase().includes(raw)) || null;
}

function sortByDateTime(items: AgendaAppointmentItem[]) {
  return [...items].sort((a, b) => {
    const left = `${normalizeDateKey(a.appointment_date) || ""} ${normalizeTime(a.appointment_time) || "00:00"}`;
    const right = `${normalizeDateKey(b.appointment_date) || ""} ${normalizeTime(b.appointment_time) || "00:00"}`;
    return left.localeCompare(right);
  });
}

export default function Agenda() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userProfile } = useAuth();
  const { settings } = useSettings();
  const { hasAnyScope, hasPermission } = usePermissions();
  const { toast } = useToast();

  const [mode, setMode] = useState<AgendaViewMode>("week");
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [appointments, setAppointments] = useState<AgendaAppointmentItem[]>([]);
  const [pendingQueue, setPendingQueue] = useState<SocialTriageQueueItem[]>([]);
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<string[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAuxPanel, setShowAuxPanel] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AgendaAppointmentItem | null>(null);
  const [patientPhone, setPatientPhone] = useState<string | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [statusLoadingKey, setStatusLoadingKey] = useState<string | null>(null);
  const [triageServiceResolved, setTriageServiceResolved] = useState(false);
  const [access, setAccess] = useState<AccessContext>({
    professionalId: null,
    canViewAllProfessionals: false,
    allowProfessionalViewOthers: false,
    compatibilityMode: false,
    compatibilityNotice: null,
    accessMode: null,
  });

  const [form, setForm] = useState<CreateForm>({
    patientId: "",
    professionalId: "",
    serviceId: "",
    date: toIsoDate(new Date()),
    time: "",
    notes: "",
    source: "manual",
  });

  const triagePatientId = (searchParams.get("patient_id") || "").toString().trim();
  const triageServiceHint = (
    searchParams.get("service_id") || searchParams.get("service") || searchParams.get("service_name") || ""
  )
    .toString()
    .trim();
  const isTriageEntry = (searchParams.get("entry") || "").toString().trim().toLowerCase() === "triagem_social";

  const canViewAgenda = hasAnyScope(AGENDA_READ_REQUIRED_SCOPES) || hasPermission("agenda", "view");
  const canWriteAgenda = canViewAgenda;
  const canViewTriageQueue = hasPermission("triagem_social", "view");

  const canViewOthers = useMemo(() => {
    if (!access.professionalId) return true;
    return (
      access.canViewAllProfessionals === true &&
      access.allowProfessionalViewOthers === true &&
      settings.allow_professional_view_others === true
    );
  }, [access.allowProfessionalViewOthers, access.canViewAllProfessionals, access.professionalId, settings.allow_professional_view_others]);

  const mustUseOwnAgenda = Boolean(access.professionalId) && !canViewOthers;
  const range = useMemo(() => viewRange(mode, cursorDate), [mode, cursorDate]);
  const rangeLabel = useMemo(() => {
    if (mode === "month") {
      return range.from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    }
    if (mode === "day") return range.from.toLocaleDateString("pt-BR");
    return `${range.from.toLocaleDateString("pt-BR")} ate ${range.to.toLocaleDateString("pt-BR")}`;
  }, [mode, range.from, range.to]);

  const slots = useMemo(
    () => buildSlots(settings.business_hours?.opening_time, settings.business_hours?.closing_time),
    [settings.business_hours?.closing_time, settings.business_hours?.opening_time]
  );

  const loadCatalog = useCallback(async () => {
    if (!canViewAgenda) {
      setProfessionals([]);
      setServices([]);
      return;
    }

    setLoadingMeta(true);
    try {
      const me = await apiService.getProfessionalMe().catch(() => null);
      const profRaw = await apiService.getProfessionals({ date: toIsoDate(cursorDate), forAgenda: true });
      const serviceList = await apiService.getServices(true).catch(() => []);

      const profList = mapProfessionals(profRaw);
      setProfessionals(profList);
      setServices(Array.isArray(serviceList) ? serviceList : []);

      const fallbackProfessionalId = userProfile?.professional_id ? String(userProfile.professional_id) : null;
      const nextAccess: AccessContext = {
        professionalId: me?.professional_id || fallbackProfessionalId,
        canViewAllProfessionals:
          me?.can_view_all_professionals === true || userProfile?.can_view_all_professionals === true,
        allowProfessionalViewOthers:
          me?.allow_professional_view_others === true || settings.allow_professional_view_others === true,
        compatibilityMode: me?.compatibility_mode === true,
        compatibilityNotice: me?.compatibility_notice || null,
        accessMode: me?.access_mode || null,
      };
      setAccess(nextAccess);

      const allowOthers =
        !nextAccess.professionalId ||
        (nextAccess.canViewAllProfessionals &&
          nextAccess.allowProfessionalViewOthers &&
          settings.allow_professional_view_others);
      const forceOwn = Boolean(nextAccess.professionalId) && !allowOthers;

      setSelectedProfessionalIds((current) => {
        if (forceOwn && nextAccess.professionalId) return [nextAccess.professionalId];
        return current.filter((id) => profList.some((item) => item.id === id));
      });

      setForm((current) => {
        if (forceOwn && nextAccess.professionalId) {
          return { ...current, professionalId: nextAccess.professionalId };
        }
        return current;
      });
    } catch (error) {
      setProfessionals([]);
      setServices([]);
      toast({
        title: "Agenda",
        description: error instanceof Error ? error.message : "Falha ao carregar catalogos da agenda.",
        variant: "destructive",
      });
    } finally {
      setLoadingMeta(false);
    }
  }, [canViewAgenda, cursorDate, settings.allow_professional_view_others, toast, userProfile?.can_view_all_professionals, userProfile?.professional_id]);

  const loadAgenda = useCallback(async () => {
    if (!canViewAgenda) {
      setAppointments([]);
      return;
    }

    setLoadingAgenda(true);
    setAgendaError(null);
    try {
      const response = await apiService.getAgendaRange({
        date_from: toIsoDate(range.from),
        date_to: toIsoDate(range.to),
        professional_ids: selectedProfessionalIds.length > 0 ? selectedProfessionalIds : null,
      });
      setAppointments(Array.isArray(response.appointments) ? response.appointments : []);
    } catch (error) {
      setAppointments([]);
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar a agenda para o periodo selecionado.";
      setAgendaError(message);
      toast({ title: "Agenda", description: message, variant: "destructive" });
    } finally {
      setLoadingAgenda(false);
    }
  }, [canViewAgenda, range.from, range.to, selectedProfessionalIds, toast]);

  const loadPending = useCallback(async () => {
    if (!canViewTriageQueue) {
      setPendingQueue([]);
      return;
    }

    setLoadingPending(true);
    setPendingError(null);
    try {
      const response = await apiService.getSocialTriageQueue({
        triagem_status: "apto_para_agendamento",
        interview_scheduled: false,
        sort: "priority",
        limit: 20,
        offset: 0,
      });
      setPendingQueue(response.items || []);
    } catch (error) {
      setPendingQueue([]);
      setPendingError(error instanceof Error ? error.message : "Falha ao carregar pendencias.");
    } finally {
      setLoadingPending(false);
    }
  }, [canViewTriageQueue]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadAgenda(), loadPending()]);
  }, [loadAgenda, loadPending]);

  useEffect(() => {
    if (!canViewAgenda) return;
    void loadCatalog();
  }, [canViewAgenda, loadCatalog]);

  useEffect(() => {
    if (!canViewAgenda) return;
    void loadAgenda();
  }, [canViewAgenda, loadAgenda]);

  useEffect(() => {
    if (!canViewAgenda) return;
    void loadPending();
  }, [canViewAgenda, loadPending]);

  useEffect(() => {
    if (!mustUseOwnAgenda || !access.professionalId) return;
    setSelectedProfessionalIds([access.professionalId]);
    setForm((current) => ({ ...current, professionalId: access.professionalId || "" }));
  }, [access.professionalId, mustUseOwnAgenda]);

  useEffect(() => {
    setTriageServiceResolved(false);
  }, [isTriageEntry, triagePatientId, triageServiceHint]);

  useEffect(() => {
    if (!isTriageEntry || !triagePatientId) return;
    setShowAuxPanel(true);
    setShowCreate(true);
    setForm((current) => ({
      ...current,
      patientId: triagePatientId,
      professionalId:
        current.professionalId ||
        (selectedProfessionalIds.length === 1 ? selectedProfessionalIds[0] : ""),
      date: current.date || toIsoDate(cursorDate),
      source: "triagem_social",
    }));
  }, [cursorDate, isTriageEntry, selectedProfessionalIds, triagePatientId]);

  useEffect(() => {
    if (!isTriageEntry || triageServiceResolved || services.length === 0) return;

    let service = triageServiceHint ? matchServiceHint(services, triageServiceHint) : null;
    if (!service) {
      service = services.find((item) => item.name.toLowerCase().includes("entrevista social")) ||
        services.find((item) => item.name.toLowerCase().includes("entrevista")) ||
        null;
    }
    if (triageServiceHint && !service) {
      toast({
        title: "Agenda",
        description:
          "Servico informado pela Triagem Social nao foi encontrado. Selecione manualmente.",
        variant: "destructive",
      });
    }
    if (service) {
      setForm((current) => ({ ...current, serviceId: current.serviceId || service!.id }));
    }
    setTriageServiceResolved(true);
  }, [isTriageEntry, services, toast, triageServiceHint, triageServiceResolved]);

  useEffect(() => {
    const patientId =
      selectedEvent?.patient_id === null || selectedEvent?.patient_id === undefined
        ? ""
        : String(selectedEvent.patient_id);
    if (!patientId) {
      setPatientPhone(null);
      return;
    }
    setLoadingPatient(true);
    void apiService
      .getPatientById(patientId)
      .then((patient) => setPatientPhone(patient?.mobile || patient?.telefone || null))
      .catch(() => setPatientPhone(null))
      .finally(() => setLoadingPatient(false));
  }, [selectedEvent?.patient_id]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of appointments) {
      set.add(normalizeStatus(item.appointment_status ?? item.status));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [appointments]);

  const professionalFilterOptions = useMemo<FilterOption[]>(
    () => professionals.map((item) => ({ value: item.id, label: profName(item) })),
    [professionals]
  );

  const serviceFilterOptions = useMemo<FilterOption[]>(
    () => services.map((item) => ({ value: item.id, label: item.name })),
    [services]
  );

  const statusFilterOptions = useMemo<FilterOption[]>(
    () => statusOptions.map((status) => ({ value: status, label: statusLabel(status) })),
    [statusOptions]
  );

  useEffect(() => {
    setSelectedProfessionalIds((current) =>
      current.filter((id) => professionalFilterOptions.some((option) => option.value === id))
    );
  }, [professionalFilterOptions]);

  useEffect(() => {
    setSelectedServiceIds((current) =>
      current.filter((id) => serviceFilterOptions.some((option) => option.value === id))
    );
  }, [serviceFilterOptions]);

  useEffect(() => {
    if (selectedStatuses.length === 0) return;
    setSelectedStatuses((current) =>
      current.filter((status) => statusOptions.includes(status))
    );
  }, [selectedStatuses.length, statusOptions]);

  const filteredAppointments = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = appointments.filter((item) => {
      if (selectedProfessionalIds.length > 0) {
        const professionalId =
          item.professional_id === null || item.professional_id === undefined
            ? ""
            : String(item.professional_id);
        if (!selectedProfessionalIds.includes(professionalId)) return false;
      }
      if (selectedServiceIds.length > 0) {
        const serviceId = item.service_id === null || item.service_id === undefined ? "" : String(item.service_id);
        if (!selectedServiceIds.includes(serviceId)) return false;
      }
      if (selectedStatuses.length > 0) {
        if (!selectedStatuses.includes(normalizeStatus(item.appointment_status ?? item.status))) return false;
      }
      if (term) {
        const hay = [
          item.patient_name,
          item.service_name,
          item.professional_name,
          item.responsible_name,
          item.notes,
          item.appointment_time,
          normalizeDateKey(item.appointment_date),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    return sortByDateTime(list);
  }, [appointments, search, selectedProfessionalIds, selectedServiceIds, selectedStatuses]);

  const loadByProfessional = useMemo(() => {
    const map = new Map<string, { name: string; total: number; pending: number }>();
    for (const item of filteredAppointments) {
      const id = item.professional_id === null || item.professional_id === undefined ? "" : String(item.professional_id);
      if (!id) continue;
      const current = map.get(id) || { name: profName(item), total: 0, pending: 0 };
      current.total += 1;
      if (normalizeStatus(item.appointment_status ?? item.status) === "agendado") {
        current.pending += 1;
      }
      map.set(id, current);
    }
    return Array.from(map.entries())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.total - a.total);
  }, [filteredAppointments]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, AgendaAppointmentItem[]>();
    for (const item of filteredAppointments) {
      const date = normalizeDateKey(item.appointment_date);
      const time = resolveSlotKey(item.appointment_time, slots);
      const key = `${date}|${time}`;
      if (!date || !time) continue;
      const bucket = map.get(key) || [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return map;
  }, [filteredAppointments, slots]);

  const dayProfessionals = useMemo(() => {
    if (selectedProfessionalIds.length > 0) {
      return professionals.filter((item) => selectedProfessionalIds.includes(item.id));
    }
    if (!canViewOthers && access.professionalId) {
      const one = professionals.find((item) => item.id === access.professionalId);
      return one ? [one] : [];
    }
    if (professionals.length > 0) return professionals;

    const map = new Map<string, ProfessionalOption>();
    for (const item of appointments) {
      const id = item.professional_id === null || item.professional_id === undefined ? "" : String(item.professional_id);
      if (!id || map.has(id)) continue;
      map.set(id, {
        id,
        professional_name: item.professional_name || null,
        professional_role: item.professional_role || null,
        professional_specialty: item.professional_specialty || null,
      });
    }
    return Array.from(map.values());
  }, [access.professionalId, appointments, canViewOthers, professionals, selectedProfessionalIds]);

  const eventsByDateProfSlot = useMemo(() => {
    const map = new Map<string, AgendaAppointmentItem[]>();
    for (const item of filteredAppointments) {
      const date = normalizeDateKey(item.appointment_date);
      const time = resolveSlotKey(item.appointment_time, slots);
      const pid = item.professional_id === null || item.professional_id === undefined ? "__none__" : String(item.professional_id);
      if (!date || !time) continue;
      const key = `${date}|${time}|${pid}`;
      const bucket = map.get(key) || [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return map;
  }, [filteredAppointments, slots]);

  const conflictMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of filteredAppointments) {
      const date = normalizeDateKey(item.appointment_date);
      const time = normalizeTime(item.appointment_time);
      const pid = item.professional_id === null || item.professional_id === undefined ? "" : String(item.professional_id);
      const status = normalizeStatus(item.appointment_status ?? item.status);
      if (!date || !time || !pid || ["cancelado", "concluido"].includes(status)) continue;
      const key = `${date}|${time}|${pid}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [filteredAppointments]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursorDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursorDate]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursorDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursorDate), { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let current = start; current <= end; current = addDays(current, 1)) {
      days.push(current);
    }
    return days;
  }, [cursorDate]);

  const handleCreate = useCallback(async () => {
    if (!canWriteAgenda) {
      toast({ title: "Agenda", description: "Sem permissao para criar agendamento.", variant: "destructive" });
      return;
    }

    const patientId = form.patientId.trim();
    const professionalId = (
      form.professionalId || (selectedProfessionalIds.length === 1 ? selectedProfessionalIds[0] : "")
    ).trim();
    const serviceId = form.serviceId.trim();
    const date = form.date.trim();
    const time = form.time.trim();

    if (!patientId || !professionalId || !serviceId || !date || !time) {
      toast({
        title: "Agenda",
        description: "Preencha assistido, profissional, servico, data e horario.",
        variant: "destructive",
      });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || parseTimeToMinutes(time) === null) {
      toast({ title: "Agenda", description: "Data/horario invalidos.", variant: "destructive" });
      return;
    }

    try {
      setCreating(true);
      const response = await apiService.createProfessionalAgendaAppointment(professionalId, {
        patient_id: patientId,
        service_id: serviceId,
        appointment_date: date,
        appointment_time: time,
        notes: form.notes.trim() || null,
      });

      if (response.success !== true) {
        toast({
          title: "Agenda",
          description: response.message || "Nao foi possivel criar agendamento.",
          variant: "destructive",
        });
        return;
      }

      if (form.source === "triagem_social" || isTriageEntry) {
        const appointmentId = response.appointment?.appointment_id
          ? String(response.appointment.appointment_id)
          : response.appointment?.id
            ? String(response.appointment.id)
            : null;
        const linkedDate = normalizeDateKey(response.appointment?.appointment_date) || date;
        const linkedAt = `${linkedDate}T${normalizeTime(response.appointment?.appointment_time) || time}:00`;
        try {
          await apiService.patchSocialTriage(patientId, {
            action_type: "vinculacao_agenda",
            triagem_status: "entrevista_agendada",
            entrevista_agendada_flag: true,
            linked_appointment_id: appointmentId,
            linked_appointment_at: linkedAt,
            note: appointmentId
              ? `Entrevista vinculada ao agendamento ${appointmentId}.`
              : "Entrevista vinculada a agenda institucional.",
            metadata: {
              source: "agenda_visual",
              selected_professional_id: professionalId,
            },
          });
        } catch (triageError) {
          toast({
            title: "Triagem Social",
            description:
              triageError instanceof Error
                ? triageError.message
                : "Agendamento criado, mas falhou a vinculacao da triagem.",
            variant: "destructive",
          });
        }
      }

      if (isTriageEntry) {
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.delete("entry");
          next.delete("service");
          next.delete("service_id");
          next.delete("service_name");
          return next;
        });
      }

      toast({ title: "Agenda", description: response.message || "Agendamento criado com sucesso." });
      setForm({
        patientId: "",
        professionalId,
        serviceId: "",
        date,
        time: "",
        notes: "",
        source: "manual",
      });
      setSelectedEvent(response.appointment || null);
      await refreshAll();
    } catch (error) {
      toast({
        title: "Agenda",
        description: error instanceof Error ? error.message : "Erro interno ao criar agendamento.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }, [canWriteAgenda, form, isTriageEntry, refreshAll, selectedProfessionalIds, setSearchParams, toast]);

  const handleStatus = useCallback(
    async (item: AgendaAppointmentItem, action: "confirm" | "cancel") => {
      const appointmentId = (item.appointment_id ?? item.id)?.toString().trim();
      const professionalId = item.professional_id === null || item.professional_id === undefined ? "" : String(item.professional_id);
      if (!appointmentId || !professionalId) {
        toast({ title: "Agenda", description: "Agendamento/profissional invalido.", variant: "destructive" });
        return;
      }

      if (action === "cancel" && typeof window !== "undefined" && !window.confirm("Confirmar cancelamento?")) {
        return;
      }

      const key = `${appointmentId}:${action}`;
      try {
        setStatusLoadingKey(key);
        const response = await apiService.updateProfessionalAgendaAppointmentStatus(professionalId, appointmentId, { action });
        if (response.success !== true) {
          toast({ title: "Agenda", description: response.message || "Falha ao atualizar status.", variant: "destructive" });
          return;
        }
        toast({ title: "Agenda", description: response.message || "Status atualizado com sucesso." });
        await refreshAll();
      } catch (error) {
        toast({
          title: "Agenda",
          description: error instanceof Error ? error.message : "Erro ao atualizar status.",
          variant: "destructive",
        });
      } finally {
        setStatusLoadingKey(null);
      }
    },
    [refreshAll, toast]
  );

  const openRemarcacao = (item: AgendaAppointmentItem) => {
    const pid = item.patient_id === null || item.patient_id === undefined ? "" : String(item.patient_id);
    const profId = item.professional_id === null || item.professional_id === undefined ? "" : String(item.professional_id);
    const serviceId = item.service_id === null || item.service_id === undefined ? "" : String(item.service_id);
    setForm((current) => ({
      ...current,
      patientId: pid || current.patientId,
      professionalId: profId || current.professionalId,
      serviceId: serviceId || current.serviceId,
      date: normalizeDateKey(item.appointment_date) || current.date,
      time: normalizeTime(item.appointment_time) || current.time,
      notes: (item.appointment_id || item.id)
        ? `Remarcacao sugerida do agendamento ${item.appointment_id || item.id}.`
        : current.notes,
    }));
    setShowAuxPanel(true);
    setShowCreate(true);
  };

  const schedulePending = (item: SocialTriageQueueItem) => {
    const suggestedService = matchServiceHint(services, item.service_interest || "") ||
      services.find((entry) => entry.name.toLowerCase().includes("entrevista")) ||
      null;
    setForm((current) => ({
      ...current,
      patientId: item.patient_id,
      serviceId: suggestedService?.id || current.serviceId,
      professionalId: current.professionalId || (selectedProfessionalIds.length === 1 ? selectedProfessionalIds[0] : ""),
      source: "triagem_social",
      notes: item.triagem_notes_summary || current.notes,
    }));
    setShowAuxPanel(true);
    setShowCreate(true);
  };

  const renderEventBlock = (item: AgendaAppointmentItem, compact = false) => {
    const status = normalizeStatus(item.appointment_status ?? item.status);
    const palette = resolveAgendaEventPalette(item);
    const date = normalizeDateKey(item.appointment_date);
    const time = normalizeTime(item.appointment_time);
    const professionalId = item.professional_id === null || item.professional_id === undefined ? "" : String(item.professional_id);
    const conflict = Boolean(date && time && professionalId && (conflictMap.get(`${date}|${time}|${professionalId}`) || 0) > 1);

    return (
      <button
        key={`${item.id}-${compact ? "compact" : "full"}`}
        type="button"
        onClick={() => setSelectedEvent(item)}
        className={cn(
          "w-full rounded-md border px-2 py-1 text-left text-xs transition hover:shadow-sm",
          palette.eventClass,
          palette.statusAccentClass,
          conflict && "ring-1 ring-red-500/60"
        )}
      >
        <div className="flex items-start justify-between gap-1">
          <p className={cn("font-semibold", compact ? "line-clamp-1" : "line-clamp-2")}>
            {normalizeTime(item.appointment_time) || "--:--"} {item.patient_name || "Assistido"}
          </p>
          <span className="rounded-sm bg-white/60 px-1 py-0.5 text-[10px]">{statusLabel(status)}</span>
        </div>
        {!compact ? (
          <>
            <p className="line-clamp-1 text-[11px]">{item.service_name || "Servico nao informado"}</p>
            <p className="line-clamp-1 text-[11px] text-foreground/70">{profName(item)}</p>
            {conflict ? <p className="text-[10px] text-red-700">Conflito de horario</p> : null}
          </>
        ) : null}
      </button>
    );
  };

  return (
    <ModuleProtectedRoute requiredAnyScopes={AGENDA_READ_REQUIRED_SCOPES}>
      <div className="mx-auto w-full max-w-[1560px] space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
            <p className="text-sm text-muted-foreground">
              Agenda operacional visual integrada com Triagem Social, Entrevistas e Avaliacoes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCursorDate((d) => shiftCursor(mode, d, "prev"))}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursorDate(new Date())}>Hoje</Button>
            <Button variant="outline" size="sm" onClick={() => setCursorDate((d) => shiftCursor(mode, d, "next"))}>
              Proximo
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <Badge variant="secondary">{rangeLabel}</Badge>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Visualizacao</CardTitle>
                <CardDescription>Modo padrao semanal com alternancia Dia/Semana/Mes/Lista.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {VIEW_ORDER.map((item) => (
                  <Button key={item} size="sm" variant={mode === item ? "default" : "outline"} onClick={() => setMode(item)}>
                    {VIEW_LABEL[item]}
                  </Button>
                ))}
                <Button size="sm" variant="outline" onClick={() => setShowAuxPanel((current) => !current)}>
                  <PanelRightOpen className="mr-1 h-4 w-4" />
                  Painel auxiliar
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setShowAuxPanel(true);
                    setShowCreate((current) => !current);
                  }}
                >
                  <PlusCircle className="mr-1 h-4 w-4" />Novo agendamento
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
              <div className="space-y-1">
                <Label>Profissional</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 w-full justify-start px-2 text-left font-normal"
                      disabled={loadingMeta || mustUseOwnAgenda}
                    >
                      <span className="truncate">
                        {compactMultiLabel(
                          selectedProfessionalIds,
                          professionalFilterOptions,
                          "Todos os profissionais"
                        )}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-2" align="start">
                    <button
                      type="button"
                      onClick={() => setSelectedProfessionalIds([])}
                      className={cn(
                        "mb-2 flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted/60",
                        selectedProfessionalIds.length === 0 && "bg-muted font-medium"
                      )}
                    >
                      <Checkbox checked={selectedProfessionalIds.length === 0} />
                      Todos os profissionais
                    </button>
                    <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                      {professionalFilterOptions.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() =>
                            setSelectedProfessionalIds((current) =>
                              toggleMultiValue(current, option.value)
                            )
                          }
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted/60"
                        >
                          <Checkbox checked={selectedProfessionalIds.includes(option.value)} />
                          <span className="line-clamp-1">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedProfessionalIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedProfessionalIds.slice(0, 2).map((id) => (
                      <Badge key={id} variant="secondary" className="text-[10px]">
                        {resolveOptionLabel(professionalFilterOptions, id)}
                      </Badge>
                    ))}
                    {selectedProfessionalIds.length > 2 ? (
                      <Badge variant="outline" className="text-[10px]">
                        +{selectedProfessionalIds.length - 2}
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={() => setSelectedProfessionalIds([])}
                    >
                      Limpar
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label>Servico</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 w-full justify-start px-2 text-left font-normal"
                    >
                      <span className="truncate">
                        {compactMultiLabel(selectedServiceIds, serviceFilterOptions, "Todos os servicos")}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-2" align="start">
                    <button
                      type="button"
                      onClick={() => setSelectedServiceIds([])}
                      className={cn(
                        "mb-2 flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted/60",
                        selectedServiceIds.length === 0 && "bg-muted font-medium"
                      )}
                    >
                      <Checkbox checked={selectedServiceIds.length === 0} />
                      Todos os servicos
                    </button>
                    <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                      {serviceFilterOptions.length === 0 ? (
                        <p className="px-2 py-1 text-sm text-muted-foreground">Sem servicos cadastrados.</p>
                      ) : (
                        serviceFilterOptions.map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            onClick={() =>
                              setSelectedServiceIds((current) => toggleMultiValue(current, option.value))
                            }
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted/60"
                          >
                            <Checkbox checked={selectedServiceIds.includes(option.value)} />
                            <span className="line-clamp-1">{option.label}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedServiceIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedServiceIds.slice(0, 2).map((id) => (
                      <Badge key={id} variant="secondary" className="text-[10px]">
                        {resolveOptionLabel(serviceFilterOptions, id)}
                      </Badge>
                    ))}
                    {selectedServiceIds.length > 2 ? (
                      <Badge variant="outline" className="text-[10px]">
                        +{selectedServiceIds.length - 2}
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={() => setSelectedServiceIds([])}
                    >
                      Limpar
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 w-full justify-start px-2 text-left font-normal"
                    >
                      <span className="truncate">
                        {compactMultiLabel(selectedStatuses, statusFilterOptions, "Todos os status")}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-2" align="start">
                    <button
                      type="button"
                      onClick={() => setSelectedStatuses([])}
                      className={cn(
                        "mb-2 flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted/60",
                        selectedStatuses.length === 0 && "bg-muted font-medium"
                      )}
                    >
                      <Checkbox checked={selectedStatuses.length === 0} />
                      Todos os status
                    </button>
                    <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                      {statusFilterOptions.length === 0 ? (
                        <p className="px-2 py-1 text-sm text-muted-foreground">Sem status no periodo.</p>
                      ) : (
                        statusFilterOptions.map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            onClick={() =>
                              setSelectedStatuses((current) => toggleMultiValue(current, option.value))
                            }
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted/60"
                          >
                            <Checkbox checked={selectedStatuses.includes(option.value)} />
                            <span className="line-clamp-1">{option.label}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedStatuses.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedStatuses.slice(0, 2).map((id) => (
                      <Badge key={id} variant="secondary" className="text-[10px]">
                        {resolveOptionLabel(statusFilterOptions, id)}
                      </Badge>
                    ))}
                    {selectedStatuses.length > 2 ? (
                      <Badge variant="outline" className="text-[10px]">
                        +{selectedStatuses.length - 2}
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={() => setSelectedStatuses([])}
                    >
                      Limpar
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1 md:col-span-2 xl:col-span-2">
                <Label>Busca</Label>
                <Input
                  className="h-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Crianca, responsavel, telefone, profissional, servico"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button className="h-9 w-full" variant="outline" onClick={() => void refreshAll()}>
                  Atualizar
                </Button>
              </div>
            </div>
            {access.compatibilityMode ? (
              <div className="rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Modo legado ativo ({access.accessMode || "compatibilidade"}). {access.compatibilityNotice || "Migracao de escopos em andamento."}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div
          className={cn(
            "grid gap-4",
            showAuxPanel ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "xl:grid-cols-1"
          )}
        >
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>{VIEW_LABEL[mode]}</CardTitle>
                <CardDescription>Periodo: {rangeLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAgenda ? (
                  <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando agenda...</div>
                ) : agendaError ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{agendaError}</div>
                ) : filteredAppointments.length === 0 ? (
                  <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">Sem agendamentos para os filtros selecionados.</div>
                ) : mode === "list" ? (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Hora</TableHead><TableHead>Crianca</TableHead><TableHead>Profissional</TableHead><TableHead>Servico</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Acoes</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {filteredAppointments.map((item) => (
                          <TableRow key={`list-${item.id}`}>
                            <TableCell>{formatDateBr(item.appointment_date)}</TableCell>
                            <TableCell>{normalizeTime(item.appointment_time) || "-"}</TableCell>
                            <TableCell className="font-medium">{item.patient_name || "-"}</TableCell>
                            <TableCell>{profName(item)}</TableCell>
                            <TableCell>{item.service_name || "-"}</TableCell>
                            <TableCell><Badge variant="outline">{statusLabel(normalizeStatus(item.appointment_status ?? item.status))}</Badge></TableCell>
                            <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelectedEvent(item)}>Detalhes</Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : mode === "month" ? (
                  <div className="overflow-x-auto">
                    <div className="min-w-[940px] overflow-hidden rounded-md border border-slate-300/90 bg-slate-100/50">
                      <div className="grid grid-cols-7 border-b border-slate-300/90 bg-slate-200/70">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].map((d) => <div key={d} className="border-r border-slate-300/80 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/80 last:border-r-0">{d}</div>)}</div>
                      <div className="grid grid-cols-7">
                        {monthDays.map((day) => {
                          const key = toIsoDate(day);
                          const dayItems = filteredAppointments.filter((item) => normalizeDateKey(item.appointment_date) === key);
                          const inMonth = day.getMonth() === cursorDate.getMonth();
                          return (
                            <div key={key} className={cn("min-h-[118px] border-r border-b border-slate-300/70 p-1.5 last:border-r-0", !inMonth ? "bg-slate-200/35" : "bg-slate-50/70")}>
                              <div className="mb-1.5 flex items-center justify-between"><span className={cn("text-sm font-semibold", !inMonth && "text-muted-foreground")}>{day.getDate()}</span><span className="text-[10px] text-muted-foreground">{dayItems.length}</span></div>
                              <div className="space-y-1">{dayItems.slice(0, 3).map((item) => renderEventBlock(item, true))}{dayItems.length > 3 ? <span className="text-xs text-muted-foreground">+{dayItems.length - 3} mais</span> : null}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="grid min-w-[940px] overflow-hidden rounded-md border border-slate-300/90 bg-slate-100/55" style={{ gridTemplateColumns: `74px repeat(${mode === "week" ? weekDays.length : Math.max(dayProfessionals.length, 1)}, minmax(164px, 1fr))` }}>
                      <div className="border-b border-r border-slate-300/90 bg-slate-200/70 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">Horario</div>
                      {mode === "week"
                        ? weekDays.map((day) => (
                            <div key={toIsoDate(day)} className="border-b border-r border-slate-300/90 bg-slate-200/70 px-2 py-1.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{day.toLocaleDateString("pt-BR", { weekday: "short" })}</p><p className="text-sm font-semibold">{day.toLocaleDateString("pt-BR")}</p></div>
                          ))
                        : (dayProfessionals.length === 0 ? [{ id: "__none__", professional_name: "Profissional" }] : dayProfessionals).map((prof) => (
                            <div key={prof.id} className="border-b border-r border-slate-300/90 bg-slate-200/70 px-2 py-1.5"><p className="text-sm font-semibold">{profName(prof)}</p><p className="text-[11px] text-muted-foreground">{cursorDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</p></div>
                          ))}

                      {slots.map((slot) => (
                        <div key={slot} className="contents">
                          <div className="border-r border-b border-slate-300/80 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-foreground/75">{slot}</div>
                          {(mode === "week" ? weekDays.map((day) => ({ type: "day", key: toIsoDate(day) })) : (dayProfessionals.length === 0 ? [{ type: "prof", key: "__none__" }] : dayProfessionals.map((prof) => ({ type: "prof", key: prof.id })))).map((col) => {
                            const dateKey = mode === "week" ? col.key : toIsoDate(cursorDate);
                            const items = mode === "week"
                              ? slotsByDate.get(`${dateKey}|${slot}`) || []
                              : eventsByDateProfSlot.get(`${dateKey}|${slot}|${col.key}`) || [];
                            return (
                              <div key={`${col.key}-${slot}`} className={cn("min-h-[58px] border-r border-b border-slate-300/70 px-1 py-1", items.length === 0 ? "bg-slate-50/65" : "bg-white/80")}>
                                {items.length === 0 ? <div className="h-full rounded-sm border border-dashed border-slate-300/80 bg-white/35" /> : <div className="space-y-1">{items.map((item) => renderEventBlock(item, true))}</div>}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {showAuxPanel ? (
            <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle>Pendentes de agendamento</CardTitle><CardDescription>Casos aptos vindos da Triagem Social.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {!canViewTriageQueue ? (
                  <p className="text-sm text-muted-foreground">Sem permissao para visualizar pendencias da triagem.</p>
                ) : loadingPending ? (
                  <p className="text-sm text-muted-foreground">Carregando pendencias...</p>
                ) : pendingError ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{pendingError}</div>
                ) : pendingQueue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum caso apto pendente.</p>
                ) : (
                  pendingQueue.slice(0, 8).map((item) => (
                    <div key={item.patient_id} className="rounded-md border p-2">
                      <p className="text-sm font-medium">{item.child_name || "-"}</p>
                      <p className="text-xs text-muted-foreground">Responsavel: {item.responsible_name || "-"}</p>
                      <p className="text-xs text-muted-foreground">Telefone: {item.main_phone || "-"}</p>
                      <p className="text-xs text-muted-foreground">Servico: {item.service_interest || "-"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => schedulePending(item)}>Agendar rapido</Button>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/pre-cadastro?patient_id=${encodeURIComponent(item.patient_id)}&entry=triagem_social`)}>Pre-cadastro</Button>
                        <Button size="sm" variant="ghost" onClick={() => navigate("/triagem-social")}>Triagem</Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {showCreate ? (
              <Card>
                <CardHeader className="pb-2"><CardTitle>Novo agendamento</CardTitle><CardDescription>Criacao contextual sem perder a visao do calendario.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1"><Label>Patient ID</Label><Input value={form.patientId} onChange={(e) => setForm((c) => ({ ...c, patientId: e.target.value }))} placeholder="ID do assistido" /></div>
                    <div className="space-y-1"><Label>Profissional</Label><Select value={form.professionalId} onValueChange={(v) => setForm((c) => ({ ...c, professionalId: v }))} disabled={mustUseOwnAgenda}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{professionals.map((item) => <SelectItem key={item.id} value={item.id}>{profName(item)}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1"><Label>Servico</Label><Select value={form.serviceId} onValueChange={(v) => setForm((c) => ({ ...c, serviceId: v }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{services.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1"><Label>Data</Label><Input type="date" value={form.date} onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))} /></div>
                    <div className="space-y-1"><Label>Horario</Label><Input value={form.time} onChange={(e) => setForm((c) => ({ ...c, time: e.target.value }))} placeholder="HH:MM" /></div>
                    <div className="space-y-1"><Label>Origem</Label><Input value={form.source} readOnly /></div>
                  </div>
                  <div className="space-y-1"><Label>Observacoes</Label><Textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} rows={3} placeholder="Detalhes do agendamento" /></div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void handleCreate()} disabled={creating}>{creating ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Criando...</> : "Criar agendamento"}</Button>
                    <Button variant="outline" onClick={() => setForm((c) => ({ ...c, patientId: "", serviceId: "", time: "", notes: "", source: "manual" }))}>Limpar</Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="pb-2"><CardTitle>Legenda de cores</CardTitle><CardDescription>Cor principal por servico e marcador por status.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2">{agendaLegend().map((item) => <div key={item.key} className="flex items-center gap-2 text-sm"><span className={cn("h-2.5 w-2.5 rounded-full", item.dotClass)} />{item.label}</div>)}</div>
                <div className="space-y-2">{agendaStatusLegend().map((item) => <div key={item.key} className="flex items-center gap-2 text-xs"><span className={cn("h-4 w-5 rounded-sm border", item.className)} />{item.label}</div>)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Distribuicao por profissional</CardTitle>
                <CardDescription>Carga operacional no periodo atual.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadByProfessional.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados para distribuicao.</p>
                ) : (
                  loadByProfessional.map((entry) => (
                    <div key={entry.id} className="rounded-md border p-2">
                      <p className="text-sm font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Total: {entry.total} | Pendentes: {entry.pending}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            </div>
          ) : null}
        </div>

        <Dialog open={Boolean(selectedEvent)} onOpenChange={(open) => !open && setSelectedEvent(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes do agendamento</DialogTitle>
              <DialogDescription>Acao operacional sem alterar status_jornada indevidamente.</DialogDescription>
            </DialogHeader>
            {selectedEvent ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedEvent.service_name || "Servico"}</Badge>
                  <Badge variant="secondary">{statusLabel(normalizeStatus(selectedEvent.appointment_status ?? selectedEvent.status))}</Badge>
                  <JourneyStatusBadge status={selectedEvent.status_jornada || selectedEvent.journey_status} />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div><p className="text-xs text-muted-foreground">Crianca/Assistido</p><p className="text-sm font-medium">{selectedEvent.patient_name || "-"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Profissional</p><p className="text-sm font-medium">{profName(selectedEvent)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Data/Hora</p><p className="text-sm font-medium">{formatDateBr(selectedEvent.appointment_date)} {normalizeTime(selectedEvent.appointment_time) || "--:--"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Contato</p><p className="text-sm font-medium">{loadingPatient ? "Carregando..." : patientPhone || "Nao informado"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Origem</p><p className="text-sm font-medium">{selectedEvent.event_type_institutional || "-"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Responsavel operacional</p><p className="text-sm font-medium">{selectedEvent.responsible_name || "-"}</p></div>
                </div>
                {selectedEvent.notes ? <div><p className="text-xs text-muted-foreground">Observacoes</p><p className="rounded-md border bg-muted/20 p-2 text-sm">{selectedEvent.notes}</p></div> : null}
                {selectedEvent.write_validation_message ? <div className="rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-800"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{selectedEvent.write_validation_message}</span></div></div> : null}
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!selectedEvent || normalizeStatus(selectedEvent.appointment_status ?? selectedEvent.status) !== "agendado" || statusLoadingKey === `${(selectedEvent.appointment_id ?? selectedEvent.id)?.toString()}:confirm`} onClick={() => selectedEvent && void handleStatus(selectedEvent, "confirm")}>Confirmar</Button>
                <Button size="sm" variant="destructive" disabled={!selectedEvent || !["agendado", "confirmado"].includes(normalizeStatus(selectedEvent.appointment_status ?? selectedEvent.status)) || statusLoadingKey === `${(selectedEvent.appointment_id ?? selectedEvent.id)?.toString()}:cancel`} onClick={() => selectedEvent && void handleStatus(selectedEvent, "cancel")}>Cancelar</Button>
                <Button size="sm" variant="outline" disabled={!selectedEvent} onClick={() => selectedEvent && openRemarcacao(selectedEvent)}>Remarcar</Button>
                <Button size="sm" variant="outline" disabled title="Conclusao permanece no modulo especifico nesta fase.">Concluir (modulo clinico)</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" disabled={!selectedEvent?.patient_id} onClick={() => selectedEvent?.patient_id && navigate(`/pre-cadastro?patient_id=${encodeURIComponent(String(selectedEvent.patient_id))}`)}>Abrir cadastro</Button>
                <Button size="sm" variant="ghost" onClick={() => navigate("/triagem-social")}>Abrir triagem</Button>
                <Button size="sm" variant="ghost" disabled={!selectedEvent?.patient_id} onClick={() => selectedEvent?.patient_id && navigate(`/entrevistas?patient_id=${encodeURIComponent(String(selectedEvent.patient_id))}`)}>Abrir modulo relacionado</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ModuleProtectedRoute>
  );
}
