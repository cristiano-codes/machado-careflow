import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Building,
  CalendarDays,
  ChevronsUpDown,
  Clock3,
  Filter,
  MapPin,
  Plus,
  Search,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type WeekdayKey = "seg" | "ter" | "qua" | "qui" | "sex";
type ClassStatus = "ativa" | "lotada" | "planejada" | "pausada";
type AgendaTesteView = "grade" | "turmas" | "profissional" | "sala";

type Unit = {
  id: string;
  nome: string;
};

type Room = {
  id: string;
  unitId: string;
  nome: string;
  capacidadeBase: number;
};

type Activity = {
  id: string;
  nome: string;
  servico: string;
};

type Professional = {
  id: string;
  nome: string;
  funcao: string;
};

type Student = {
  id: string;
  nome: string;
};

type ClassSchedule = {
  weekday: WeekdayKey;
  startTime: string;
  endTime: string;
};

type ClassGroup = {
  id: string;
  unitId: string;
  nome: string;
  activityId: string;
  roomId: string;
  professionalId: string;
  status: ClassStatus;
  capacidadeMaxima: number;
  studentIds: string[];
  observacoes: string;
  schedules: ClassSchedule[];
};

type GridSlot = {
  id: string;
  classData: ClassGroup;
  schedule: ClassSchedule;
  activity: Activity;
  room: Room;
  professional: Professional;
  students: Student[];
  startMinutes: number;
  endMinutes: number;
};

type MultiSelectOption = {
  value: string;
  label: string;
};

const WEEK_DAYS: Array<{ key: WeekdayKey; label: string; short: string }> = [
  { key: "seg", label: "Segunda", short: "SEG" },
  { key: "ter", label: "Terca", short: "TER" },
  { key: "qua", label: "Quarta", short: "QUA" },
  { key: "qui", label: "Quinta", short: "QUI" },
  { key: "sex", label: "Sexta", short: "SEX" },
];

const DAY_START_MINUTES = 7 * 60;
const DAY_END_MINUTES = 20 * 60;
const TOTAL_DAY_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;
const GRID_HEIGHT_PX = 780;
const HOUR_MARKERS = Array.from(
  { length: TOTAL_DAY_MINUTES / 60 + 1 },
  (_, index) => DAY_START_MINUTES + index * 60
);

const MOCK_UNITS: Unit[] = [
  { id: "u-centro", nome: "Unidade Centro" },
  { id: "u-norte", nome: "Unidade Norte" },
];

const MOCK_ROOMS: Room[] = [
  { id: "r-azul", unitId: "u-centro", nome: "Sala Azul", capacidadeBase: 12 },
  { id: "r-verde", unitId: "u-centro", nome: "Sala Verde", capacidadeBase: 10 },
  { id: "r-multi", unitId: "u-centro", nome: "Sala Multiuso", capacidadeBase: 16 },
  { id: "r-norte-1", unitId: "u-norte", nome: "Sala Norte 1", capacidadeBase: 9 },
  { id: "r-norte-2", unitId: "u-norte", nome: "Sala Norte 2", capacidadeBase: 8 },
];

const MOCK_ACTIVITIES: Activity[] = [
  { id: "a-habilidades", nome: "Habilidades Sociais", servico: "Oficina Terapeutica" },
  { id: "a-letramento", nome: "Letramento Funcional", servico: "Apoio Pedagogico" },
  { id: "a-musica", nome: "Musica e Ritmo", servico: "Expressao Artistica" },
  { id: "a-vida-diaria", nome: "Vida Diaria", servico: "Treino de Autonomia" },
  { id: "a-psicomotricidade", nome: "Psicomotricidade", servico: "Estimulo Motor" },
];

const MOCK_PROFESSIONALS: Professional[] = [
  { id: "p-ana", nome: "Ana Ribeiro", funcao: "Psicologa" },
  { id: "p-carla", nome: "Carla Nascimento", funcao: "Pedagoga" },
  { id: "p-lucas", nome: "Lucas Torres", funcao: "Educador Fisico" },
  { id: "p-marta", nome: "Marta Figueira", funcao: "Terapeuta Ocupacional" },
  { id: "p-rogerio", nome: "Rogerio Alves", funcao: "Musicoterapeuta" },
];

const MOCK_STUDENTS: Student[] = [
  { id: "s-001", nome: "Joao Pedro" },
  { id: "s-002", nome: "Maria Eduarda" },
  { id: "s-003", nome: "Gabriel Henrique" },
  { id: "s-004", nome: "Yasmin Souza" },
  { id: "s-005", nome: "Arthur Lima" },
  { id: "s-006", nome: "Helena Costa" },
  { id: "s-007", nome: "Rafael Moura" },
  { id: "s-008", nome: "Laura Neri" },
  { id: "s-009", nome: "Vinicius Prado" },
  { id: "s-010", nome: "Isabela Freitas" },
  { id: "s-011", nome: "Enzo Matias" },
  { id: "s-012", nome: "Sofia Mello" },
  { id: "s-013", nome: "Bruno Nascimento" },
  { id: "s-014", nome: "Livia Araujo" },
  { id: "s-015", nome: "Felipe Dantas" },
  { id: "s-016", nome: "Alice Pires" },
];

const MOCK_CLASSES: ClassGroup[] = [
  {
    id: "t-hab-1",
    unitId: "u-centro",
    nome: "Turma Horizonte",
    activityId: "a-habilidades",
    roomId: "r-azul",
    professionalId: "p-ana",
    status: "ativa",
    capacidadeMaxima: 12,
    studentIds: ["s-001", "s-002", "s-003", "s-004", "s-005", "s-006", "s-007", "s-008"],
    observacoes: "Turma com foco em interacao social e autorregulacao.",
    schedules: [
      { weekday: "seg", startTime: "08:00", endTime: "09:30" },
      { weekday: "qua", startTime: "08:00", endTime: "09:30" },
    ],
  },
  {
    id: "t-let-1",
    unitId: "u-centro",
    nome: "Turma Vanguarda",
    activityId: "a-letramento",
    roomId: "r-verde",
    professionalId: "p-carla",
    status: "ativa",
    capacidadeMaxima: 10,
    studentIds: ["s-009", "s-010", "s-011", "s-012", "s-013"],
    observacoes: "Atividade de alfabetizacao funcional com reforco de rotina.",
    schedules: [
      { weekday: "ter", startTime: "09:00", endTime: "10:30" },
      { weekday: "qui", startTime: "09:00", endTime: "10:30" },
    ],
  },
  {
    id: "t-mus-1",
    unitId: "u-centro",
    nome: "Turma Harmonia",
    activityId: "a-musica",
    roomId: "r-multi",
    professionalId: "p-rogerio",
    status: "lotada",
    capacidadeMaxima: 16,
    studentIds: [
      "s-001",
      "s-002",
      "s-003",
      "s-004",
      "s-005",
      "s-006",
      "s-007",
      "s-008",
      "s-009",
      "s-010",
      "s-011",
      "s-012",
      "s-013",
      "s-014",
      "s-015",
      "s-016",
    ],
    observacoes: "Turma lotada. Lista de espera prevista para o proximo ciclo.",
    schedules: [{ weekday: "sex", startTime: "14:00", endTime: "15:30" }],
  },
  {
    id: "t-vida-1",
    unitId: "u-centro",
    nome: "Turma Autonomia 1",
    activityId: "a-vida-diaria",
    roomId: "r-azul",
    professionalId: "p-marta",
    status: "ativa",
    capacidadeMaxima: 8,
    studentIds: ["s-003", "s-006", "s-009", "s-012", "s-015"],
    observacoes: "Treino de habilidades de vida diaria com foco em independencia.",
    schedules: [{ weekday: "qui", startTime: "13:00", endTime: "14:30" }],
  },
  {
    id: "t-psi-1",
    unitId: "u-centro",
    nome: "Turma Movimento",
    activityId: "a-psicomotricidade",
    roomId: "r-multi",
    professionalId: "p-lucas",
    status: "planejada",
    capacidadeMaxima: 12,
    studentIds: ["s-005", "s-007", "s-011"],
    observacoes: "Planejada para iniciar no proximo mes apos ajuste de sala.",
    schedules: [{ weekday: "ter", startTime: "15:00", endTime: "16:30" }],
  },
  {
    id: "t-norte-1",
    unitId: "u-norte",
    nome: "Turma Norte Integracao",
    activityId: "a-habilidades",
    roomId: "r-norte-1",
    professionalId: "p-ana",
    status: "ativa",
    capacidadeMaxima: 9,
    studentIds: ["s-001", "s-004", "s-008", "s-012", "s-016"],
    observacoes: "Turma da unidade norte com perfil misto.",
    schedules: [{ weekday: "seg", startTime: "10:00", endTime: "11:30" }],
  },
  {
    id: "t-norte-2",
    unitId: "u-norte",
    nome: "Turma Norte Rotina",
    activityId: "a-vida-diaria",
    roomId: "r-norte-2",
    professionalId: "p-marta",
    status: "pausada",
    capacidadeMaxima: 8,
    studentIds: ["s-002", "s-006", "s-010"],
    observacoes: "Pausada temporariamente por ajuste de equipe.",
    schedules: [{ weekday: "qua", startTime: "14:30", endTime: "16:00" }],
  },
];

function parseTimeToMinutes(value: string) {
  const [hh, mm] = (value || "").split(":").map((item) => Number.parseInt(item, 10));
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function formatMinutes(minutes: number) {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function getStatusLabel(status: ClassStatus) {
  if (status === "ativa") return "Ativa";
  if (status === "lotada") return "Lotada";
  if (status === "planejada") return "Planejada";
  return "Pausada";
}

function getStatusVariant(status: ClassStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "ativa") return "default";
  if (status === "lotada") return "destructive";
  if (status === "planejada") return "secondary";
  return "outline";
}

function getSlotColorClass(status: ClassStatus) {
  if (status === "ativa") return "border-emerald-500 bg-emerald-100 text-emerald-950";
  if (status === "lotada") return "border-rose-500 bg-rose-100 text-rose-950";
  if (status === "planejada") return "border-blue-500 bg-blue-100 text-blue-950";
  return "border-slate-500 bg-slate-200 text-slate-900";
}

function buildMultiSelectSummary(selected: string[], options: MultiSelectOption[], placeholder: string) {
  if (selected.length === 0) return placeholder;
  const labels = options
    .filter((item) => selected.includes(item.value))
    .map((item) => item.label);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

type MultiSelectFilterProps = {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
};

function MultiSelectFilter({ label, options, selected, placeholder, onChange }: MultiSelectFilterProps) {
  function toggle(value: string, checked: boolean) {
    if (checked) {
      onChange(Array.from(new Set([...selected, value])));
      return;
    }
    onChange(selected.filter((item) => item !== value));
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 w-full justify-between font-normal">
            <span className="truncate text-left">
              {buildMultiSelectSummary(selected, options, placeholder)}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {selected.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onChange([])}
              >
                Limpar
              </Button>
            ) : null}
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">Sem opcoes para este filtro.</p>
            ) : (
              options.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.includes(option.value)}
                    onCheckedChange={(checked) => toggle(option.value, checked === true)}
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type WeeklyGridProps = {
  slots: GridSlot[];
  onSelectSlot: (slot: GridSlot) => void;
};

function WeeklyGrid({ slots, onSelectSlot }: WeeklyGridProps) {
  const slotsByDay = useMemo(() => {
    const map = new Map<WeekdayKey, GridSlot[]>();
    for (const day of WEEK_DAYS) {
      map.set(day.key, []);
    }
    for (const slot of slots) {
      map.get(slot.schedule.weekday)?.push(slot);
    }
    for (const day of WEEK_DAYS) {
      map.get(day.key)?.sort((a, b) => a.startMinutes - b.startMinutes);
    }
    return map;
  }, [slots]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[980px] overflow-hidden rounded-xl border border-slate-300 bg-slate-100 shadow-sm">
        <div
          className="grid border-b border-slate-300 bg-slate-200"
          style={{ gridTemplateColumns: "88px repeat(5, minmax(0, 1fr))" }}
        >
          <div className="flex items-center justify-center border-r border-slate-300 px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Hora
          </div>
          {WEEK_DAYS.map((day) => (
            <div
              key={day.key}
              className="border-r border-slate-300 px-3 py-3 text-left last:border-r-0"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{day.short}</p>
              <p className="text-sm font-semibold text-slate-800">{day.label}</p>
            </div>
          ))}
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: "88px repeat(5, minmax(0, 1fr))" }}
        >
          <div className="relative border-r border-slate-300 bg-slate-200/80" style={{ height: GRID_HEIGHT_PX }}>
            {HOUR_MARKERS.map((minute) => {
              const top = ((minute - DAY_START_MINUTES) / TOTAL_DAY_MINUTES) * GRID_HEIGHT_PX;
              return (
                <div
                  key={`hour-${minute}`}
                  className="absolute left-0 right-0 -translate-y-1/2 px-2"
                  style={{ top }}
                >
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {formatMinutes(minute)}
                  </span>
                </div>
              );
            })}
          </div>

          {WEEK_DAYS.map((day) => (
            <div
              key={day.key}
              className="relative border-r border-slate-300 bg-slate-50/90 last:border-r-0"
              style={{ height: GRID_HEIGHT_PX }}
            >
              {HOUR_MARKERS.map((minute) => {
                const top = ((minute - DAY_START_MINUTES) / TOTAL_DAY_MINUTES) * GRID_HEIGHT_PX;
                return (
                  <div
                    key={`${day.key}-${minute}`}
                    className="absolute left-0 right-0 border-t border-slate-300/80"
                    style={{ top }}
                  />
                );
              })}

              {(slotsByDay.get(day.key) || []).map((slot) => {
                const top = ((slot.startMinutes - DAY_START_MINUTES) / TOTAL_DAY_MINUTES) * GRID_HEIGHT_PX;
                const height = Math.max(
                  ((slot.endMinutes - slot.startMinutes) / TOTAL_DAY_MINUTES) * GRID_HEIGHT_PX,
                  86
                );
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => onSelectSlot(slot)}
                    className={cn(
                      "absolute left-1 right-1 rounded-md border p-2 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/60",
                      getSlotColorClass(slot.classData.status)
                    )}
                    style={{ top: Math.max(top, 0) + 2, height }}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-xs font-bold">{slot.classData.nome}</p>
                      <Badge variant={getStatusVariant(slot.classData.status)} className="text-[10px]">
                        {getStatusLabel(slot.classData.status)}
                      </Badge>
                    </div>
                    <p className="line-clamp-1 text-[11px] font-medium">{slot.activity.nome}</p>
                    <p className="line-clamp-1 text-[11px]">{slot.room.nome}</p>
                    <p className="line-clamp-1 text-[11px]">{slot.professional.nome}</p>
                    <div className="mt-1 flex items-center justify-between text-[10px] font-medium">
                      <span>
                        {slot.students.length}/{slot.classData.capacidadeMaxima} alunos
                      </span>
                      <span>
                        {slot.schedule.startTime} - {slot.schedule.endTime}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type AgendaTesteDrawerProps = {
  slot: GridSlot | null;
  onOpenChange: (open: boolean) => void;
  onAction: (action: string) => void;
};

function AgendaTesteDrawer({ slot, onOpenChange, onAction }: AgendaTesteDrawerProps) {
  return (
    <Sheet open={Boolean(slot)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        {slot ? (
          <div className="space-y-4 p-6">
            <SheetHeader>
              <SheetTitle>{slot.classData.nome}</SheetTitle>
              <SheetDescription>
                Painel laboratorio para validacao da experiencia de agenda por turma.
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-2">
              <Card className="bg-slate-50">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Atividade</p>
                  <p className="text-sm font-semibold">{slot.activity.nome}</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-50">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Profissional</p>
                  <p className="text-sm font-semibold">{slot.professional.nome}</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-50">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Sala</p>
                  <p className="text-sm font-semibold">{slot.room.nome}</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-50">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Capacidade</p>
                  <p className="text-sm font-semibold">
                    {slot.students.length}/{slot.classData.capacidadeMaxima}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Alunos matriculados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {slot.students.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem alunos vinculados.</p>
                ) : (
                  slot.students.map((student) => (
                    <div
                      key={student.id}
                      className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2"
                    >
                      <span className="text-sm">{student.nome}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {student.id.toUpperCase()}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Observacoes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{slot.classData.observacoes}</p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="outline" onClick={() => onAction("editar")}>
                Editar
              </Button>
              <Button variant="outline" onClick={() => onAction("alunos")}>
                Ver alunos
              </Button>
              <Button onClick={() => onAction("presenca")}>Simular presenca</Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default function AgendaTeste() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeView, setActiveView] = useState<AgendaTesteView>("grade");
  const [selectedUnit, setSelectedUnit] = useState<string>(MOCK_UNITS[0]?.id || "");
  const [selectedProfessionals, setSelectedProfessionals] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<ClassStatus[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>("all");
  const [selectedWeekday, setSelectedWeekday] = useState<WeekdayKey | "all">("all");
  const [search, setSearch] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<GridSlot | null>(null);
  const [newClassDialogOpen, setNewClassDialogOpen] = useState(false);
  const [newClassDraftName, setNewClassDraftName] = useState("");
  const [newClassDraftNotes, setNewClassDraftNotes] = useState("");

  const activityMap = useMemo(() => new Map(MOCK_ACTIVITIES.map((item) => [item.id, item])), []);
  const roomMap = useMemo(() => new Map(MOCK_ROOMS.map((item) => [item.id, item])), []);
  const professionalMap = useMemo(
    () => new Map(MOCK_PROFESSIONALS.map((item) => [item.id, item])),
    []
  );
  const studentMap = useMemo(() => new Map(MOCK_STUDENTS.map((item) => [item.id, item])), []);

  const roomOptions = useMemo(
    () =>
      MOCK_ROOMS.filter((room) => room.unitId === selectedUnit).map((room) => ({
        value: room.id,
        label: room.nome,
      })),
    [selectedUnit]
  );

  const professionalOptions = useMemo<MultiSelectOption[]>(
    () =>
      MOCK_PROFESSIONALS.map((professional) => ({
        value: professional.id,
        label: `${professional.nome} - ${professional.funcao}`,
      })),
    []
  );

  const activityOptions = useMemo<MultiSelectOption[]>(
    () =>
      MOCK_ACTIVITIES.map((activity) => ({
        value: activity.id,
        label: activity.nome,
      })),
    []
  );

  const statusOptions = useMemo<MultiSelectOption[]>(
    () => [
      { value: "ativa", label: "Ativa" },
      { value: "lotada", label: "Lotada" },
      { value: "planejada", label: "Planejada" },
      { value: "pausada", label: "Pausada" },
    ],
    []
  );

  const normalizedSearch = search.trim().toLowerCase();

  const filteredClasses = useMemo(() => {
    return MOCK_CLASSES.filter((classItem) => {
      if (selectedUnit && classItem.unitId !== selectedUnit) return false;
      if (selectedProfessionals.length > 0 && !selectedProfessionals.includes(classItem.professionalId)) {
        return false;
      }
      if (selectedActivities.length > 0 && !selectedActivities.includes(classItem.activityId)) return false;
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(classItem.status)) return false;
      if (selectedRoom !== "all" && classItem.roomId !== selectedRoom) return false;
      if (selectedWeekday !== "all" && !classItem.schedules.some((slot) => slot.weekday === selectedWeekday)) {
        return false;
      }
      if (!normalizedSearch) return true;

      const activity = activityMap.get(classItem.activityId);
      const professional = professionalMap.get(classItem.professionalId);
      const room = roomMap.get(classItem.roomId);

      return [
        classItem.nome,
        activity?.nome,
        activity?.servico,
        professional?.nome,
        room?.nome,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [
    activityMap,
    normalizedSearch,
    professionalMap,
    roomMap,
    selectedActivities,
    selectedProfessionals,
    selectedRoom,
    selectedStatuses,
    selectedUnit,
    selectedWeekday,
  ]);

  const filteredSlots = useMemo<GridSlot[]>(() => {
    return filteredClasses.flatMap((classItem) => {
      const activity = activityMap.get(classItem.activityId);
      const room = roomMap.get(classItem.roomId);
      const professional = professionalMap.get(classItem.professionalId);
      if (!activity || !room || !professional) return [];

      const students = classItem.studentIds
        .map((id) => studentMap.get(id))
        .filter((student): student is Student => Boolean(student));

      return classItem.schedules
        .filter((schedule) => selectedWeekday === "all" || schedule.weekday === selectedWeekday)
        .map((schedule, index) => {
          const startMinutes = parseTimeToMinutes(schedule.startTime);
          const endMinutes = parseTimeToMinutes(schedule.endTime);
          if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
          return {
            id: `${classItem.id}-${schedule.weekday}-${schedule.startTime}-${index}`,
            classData: classItem,
            schedule,
            activity,
            room,
            professional,
            students,
            startMinutes,
            endMinutes,
          };
        })
        .filter((slot): slot is GridSlot => Boolean(slot));
    });
  }, [
    activityMap,
    filteredClasses,
    professionalMap,
    roomMap,
    selectedWeekday,
    studentMap,
  ]);

  const groupedByProfessional = useMemo(() => {
    return MOCK_PROFESSIONALS.map((professional) => {
      const classItems = filteredClasses.filter((classItem) => classItem.professionalId === professional.id);
      return { professional, classItems };
    }).filter((entry) => entry.classItems.length > 0);
  }, [filteredClasses]);

  const groupedByRoom = useMemo(() => {
    return MOCK_ROOMS.filter((room) => room.unitId === selectedUnit)
      .map((room) => {
        const classItems = filteredClasses.filter((classItem) => classItem.roomId === room.id);
        return { room, classItems };
      })
      .filter((entry) => entry.classItems.length > 0);
  }, [filteredClasses, selectedUnit]);

  function clearFilters() {
    setSelectedProfessionals([]);
    setSelectedActivities([]);
    setSelectedStatuses([]);
    setSelectedRoom("all");
    setSelectedWeekday("all");
    setSearch("");
  }

  function handleDrawerAction(action: string) {
    toast({
      title: "Agenda teste",
      description: `Acao "${action}" simulada com sucesso nesta versao laboratorio.`,
    });
  }

  function handleCreateMockClass() {
    toast({
      title: "Nova turma simulada",
      description:
        "Este fluxo ainda usa mock local. Na proxima etapa sera conectado ao backend real.",
    });
    setNewClassDialogOpen(false);
    setNewClassDraftName("");
    setNewClassDraftNotes("");
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-300 bg-gradient-to-r from-slate-100 to-slate-50">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarDays className="h-5 w-5" />
                Agenda de Atividades da Unidade (Laboratorio)
              </CardTitle>
              <CardDescription>
                Area de homologacao visual e funcional para evoluir a nova experiencia de agenda por
                turmas, salas e grade semanal.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => navigate(-1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={() => setNewClassDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo teste de turma
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros operacionais
          </CardTitle>
          <CardDescription>
            Filtros locais (mock) para simular a futura operacao diaria por unidade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Unidade</Label>
              <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {MOCK_UNITS.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <MultiSelectFilter
              label="Profissional"
              options={professionalOptions}
              selected={selectedProfessionals}
              onChange={setSelectedProfessionals}
              placeholder="Todos os profissionais"
            />

            <MultiSelectFilter
              label="Servico/Atividade"
              options={activityOptions}
              selected={selectedActivities}
              onChange={setSelectedActivities}
              placeholder="Todas as atividades"
            />

            <MultiSelectFilter
              label="Status"
              options={statusOptions}
              selected={selectedStatuses}
              onChange={(values) => setSelectedStatuses(values as ClassStatus[])}
              placeholder="Todos os status"
            />

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sala</Label>
              <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas as salas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as salas</SelectItem>
                  {roomOptions.map((room) => (
                    <SelectItem key={room.value} value={room.value}>
                      {room.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Dia da semana</Label>
              <Select
                value={selectedWeekday}
                onValueChange={(value) => setSelectedWeekday(value as WeekdayKey | "all")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos os dias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os dias</SelectItem>
                  {WEEK_DAYS.map((day) => (
                    <SelectItem key={day.key} value={day.key}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 xl:col-span-2">
              <Label className="text-xs text-muted-foreground">Busca por turma</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-9 pl-8"
                  placeholder="Nome da turma, atividade, profissional ou sala"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-slate-50 p-2">
            <p className="text-xs text-muted-foreground">
              {filteredClasses.length} turma(s) e {filteredSlots.length} bloco(s) no recorte atual.
            </p>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as AgendaTesteView)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <TabsList className="grid w-full max-w-[620px] grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="grade">Grade semanal</TabsTrigger>
            <TabsTrigger value="turmas">Lista de turmas</TabsTrigger>
            <TabsTrigger value="profissional">Visao por profissional</TabsTrigger>
            <TabsTrigger value="sala">Visao por sala</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="grade" className="mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Grade semanal operacional</CardTitle>
              <CardDescription>
                Clique em um bloco para abrir o painel lateral com detalhes da turma.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredSlots.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Nenhum bloco encontrado para os filtros selecionados.
                </div>
              ) : (
                <WeeklyGrid slots={filteredSlots} onSelectSlot={setSelectedSlot} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="turmas" className="mt-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Lista de turmas</CardTitle>
              <CardDescription>
                Visao tabular para leitura rapida de capacidade, horarios e responsavel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Turma</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Sala</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Vagas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Horarios</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClasses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Nenhuma turma encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClasses.map((classItem) => {
                      const activity = activityMap.get(classItem.activityId);
                      const room = roomMap.get(classItem.roomId);
                      const professional = professionalMap.get(classItem.professionalId);
                      return (
                        <TableRow key={classItem.id}>
                          <TableCell className="font-medium">{classItem.nome}</TableCell>
                          <TableCell>{activity?.nome || "-"}</TableCell>
                          <TableCell>{room?.nome || "-"}</TableCell>
                          <TableCell>{professional?.nome || "-"}</TableCell>
                          <TableCell>
                            {classItem.studentIds.length}/{classItem.capacidadeMaxima}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(classItem.status)}>
                              {getStatusLabel(classItem.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {classItem.schedules.map((schedule, index) => (
                                <span key={`${classItem.id}-schedule-${index}`} className="text-xs text-muted-foreground">
                                  {WEEK_DAYS.find((day) => day.key === schedule.weekday)?.label || schedule.weekday}{" "}
                                  {schedule.startTime} - {schedule.endTime}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profissional" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            {groupedByProfessional.length === 0 ? (
              <Card className="lg:col-span-2">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Sem turmas para o recorte de filtros atual.
                </CardContent>
              </Card>
            ) : (
              groupedByProfessional.map((entry) => (
                <Card key={entry.professional.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UserCheck className="h-4 w-4" />
                      {entry.professional.nome}
                    </CardTitle>
                    <CardDescription>{entry.professional.funcao}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {entry.classItems.map((classItem) => {
                      const activity = activityMap.get(classItem.activityId);
                      const room = roomMap.get(classItem.roomId);
                      return (
                        <button
                          key={classItem.id}
                          type="button"
                          className="w-full rounded-md border bg-slate-50 p-3 text-left transition hover:bg-slate-100"
                          onClick={() => {
                            const schedule = classItem.schedules[0];
                            if (!schedule) return;
                            const activityData = activityMap.get(classItem.activityId);
                            const roomData = roomMap.get(classItem.roomId);
                            const professionalData = professionalMap.get(classItem.professionalId);
                            if (!activityData || !roomData || !professionalData) return;
                            const students = classItem.studentIds
                              .map((id) => studentMap.get(id))
                              .filter((student): student is Student => Boolean(student));
                            const startMinutes = parseTimeToMinutes(schedule.startTime);
                            const endMinutes = parseTimeToMinutes(schedule.endTime);
                            if (startMinutes === null || endMinutes === null) return;
                            setSelectedSlot({
                              id: `${classItem.id}-${schedule.weekday}-${schedule.startTime}`,
                              classData: classItem,
                              schedule,
                              activity: activityData,
                              room: roomData,
                              professional: professionalData,
                              students,
                              startMinutes,
                              endMinutes,
                            });
                          }}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{classItem.nome}</p>
                            <Badge variant={getStatusVariant(classItem.status)}>
                              {getStatusLabel(classItem.status)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{activity?.nome}</p>
                          <p className="text-xs text-muted-foreground">{room?.nome}</p>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="sala" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            {groupedByRoom.length === 0 ? (
              <Card className="lg:col-span-2">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma ocupacao de sala para os filtros selecionados.
                </CardContent>
              </Card>
            ) : (
              groupedByRoom.map((entry) => (
                <Card key={entry.room.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Building className="h-4 w-4" />
                      {entry.room.nome}
                    </CardTitle>
                    <CardDescription>Capacidade base: {entry.room.capacidadeBase} alunos</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {entry.classItems.map((classItem) => {
                      const professional = professionalMap.get(classItem.professionalId);
                      const activity = activityMap.get(classItem.activityId);
                      return (
                        <div key={classItem.id} className="rounded-md border bg-slate-50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{classItem.nome}</p>
                            <Badge variant={getStatusVariant(classItem.status)}>
                              {getStatusLabel(classItem.status)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{activity?.nome || "-"}</p>
                          <p className="text-xs text-muted-foreground">{professional?.nome || "-"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {classItem.studentIds.length}/{classItem.capacidadeMaxima} alunos
                          </p>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="grid gap-2 p-4 text-xs text-muted-foreground md:grid-cols-3">
          <div className="flex items-center gap-2">
            <Clock3 className="h-3.5 w-3.5" />
            Grade semanal com escala horaria e blocos de turma.
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" />
            Simulacao de alocacao por sala com filtros operacionais.
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            Mock estruturado para troca futura por API real.
          </div>
        </CardContent>
      </Card>

      <AgendaTesteDrawer
        slot={selectedSlot}
        onOpenChange={(open) => {
          if (!open) setSelectedSlot(null);
        }}
        onAction={handleDrawerAction}
      />

      <Dialog open={newClassDialogOpen} onOpenChange={setNewClassDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo teste de turma</DialogTitle>
            <DialogDescription>
              Formulario de laboratorio para validar a UX inicial. Ainda sem persistencia real.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Nome da turma</Label>
              <Input
                value={newClassDraftName}
                onChange={(event) => setNewClassDraftName(event.target.value)}
                placeholder="Ex.: Turma Integracao Norte"
              />
            </div>

            <div className="space-y-1">
              <Label>Observacoes</Label>
              <Textarea
                value={newClassDraftNotes}
                onChange={(event) => setNewClassDraftNotes(event.target.value)}
                placeholder="Informacoes gerais para o teste"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewClassDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateMockClass}>
              <BookOpen className="mr-2 h-4 w-4" />
              Salvar simulacao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
