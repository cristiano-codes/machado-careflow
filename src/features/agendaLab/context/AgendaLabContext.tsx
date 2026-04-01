import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_ACTIVITIES,
  DEFAULT_ALLOCATIONS,
  DEFAULT_CLASSES,
  DEFAULT_ENROLLMENTS,
  DEFAULT_PROFESSIONALS,
  DEFAULT_ROOMS,
  DEFAULT_STUDENTS,
  DEFAULT_UNITS,
} from "@/features/agendaLab/data/defaults";
import type {
  Activity,
  Allocation,
  GroupClass,
  LabDataset,
  Professional,
  Room,
  Student,
  StudentEnrollment,
  Unit,
} from "@/features/agendaLab/types";
import {
  buildAllocationConflictMap,
  buildStudentScheduleConflictMap,
  countClassOccupancy,
} from "@/features/agendaLab/utils/conflicts";
import { unitOperationsApi } from "@/features/agendaLab/services/unitOperationsApi";

type AgendaLabDataSource = "api" | "dev_fallback";

type AgendaLabContextValue = {
  units: Unit[];
  professionals: Professional[];
  students: Student[];
  rooms: Room[];
  activities: Activity[];
  classes: GroupClass[];
  allocations: Allocation[];
  enrollments: StudentEnrollment[];
  upsertRoom: (item: Room) => Promise<void>;
  upsertActivity: (item: Activity) => Promise<void>;
  upsertClass: (item: GroupClass) => Promise<void>;
  upsertAllocation: (item: Allocation) => Promise<void>;
  upsertEnrollment: (item: StudentEnrollment) => Promise<void>;
  removeAllocation: (id: string) => Promise<void>;
  resetLabData: () => Promise<void>;
  allocationConflicts: ReturnType<typeof buildAllocationConflictMap>;
  classOccupancy: ReturnType<typeof countClassOccupancy>;
  enrollmentConflicts: ReturnType<typeof buildStudentScheduleConflictMap>;
  isLoading: boolean;
  syncError: string | null;
  dataSource: AgendaLabDataSource;
  isWriteEnabled: boolean;
  devFallbackEnabled: boolean;
  refreshFromServer: () => Promise<void>;
};

const DEV_LOCAL_FALLBACK_ENABLED =
  import.meta.env.DEV &&
  String(import.meta.env?.VITE_UNIT_OPS_DEV_LOCAL_FALLBACK || "false")
    .trim()
    .toLowerCase() === "true";

const EMPTY_DATASET: LabDataset = {
  units: [],
  professionals: [],
  students: [],
  rooms: [],
  activities: [],
  classes: [],
  allocations: [],
  enrollments: [],
};

const AgendaLabContext = createContext<AgendaLabContextValue | undefined>(undefined);

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index < 0) return [nextItem, ...items];
  const clone = [...items];
  clone[index] = nextItem;
  return clone;
}

function buildDevFallbackDataset(): LabDataset {
  return {
    units: DEFAULT_UNITS,
    professionals: DEFAULT_PROFESSIONALS,
    students: DEFAULT_STUDENTS,
    rooms: DEFAULT_ROOMS,
    activities: DEFAULT_ACTIVITIES,
    classes: DEFAULT_CLASSES,
    allocations: DEFAULT_ALLOCATIONS,
    enrollments: DEFAULT_ENROLLMENTS,
  };
}

function normalizeDataset(dataset: LabDataset): LabDataset {
  return {
    units: Array.isArray(dataset.units) ? dataset.units : [],
    professionals: Array.isArray(dataset.professionals) ? dataset.professionals : [],
    students: Array.isArray(dataset.students) ? dataset.students : [],
    rooms: Array.isArray(dataset.rooms) ? dataset.rooms : [],
    activities: Array.isArray(dataset.activities) ? dataset.activities : [],
    classes: Array.isArray(dataset.classes) ? dataset.classes : [],
    allocations: Array.isArray(dataset.allocations) ? dataset.allocations : [],
    enrollments: Array.isArray(dataset.enrollments) ? dataset.enrollments : [],
  };
}

export function AgendaLabProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<Unit[]>(EMPTY_DATASET.units);
  const [professionals, setProfessionals] = useState<Professional[]>(EMPTY_DATASET.professionals);
  const [students, setStudents] = useState<Student[]>(EMPTY_DATASET.students);
  const [rooms, setRooms] = useState<Room[]>(EMPTY_DATASET.rooms);
  const [activities, setActivities] = useState<Activity[]>(EMPTY_DATASET.activities);
  const [classes, setClasses] = useState<GroupClass[]>(EMPTY_DATASET.classes);
  const [allocations, setAllocations] = useState<Allocation[]>(EMPTY_DATASET.allocations);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>(EMPTY_DATASET.enrollments);

  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<AgendaLabDataSource>("api");
  const hasSyncedOnceRef = useRef(false);

  const applyDataset = useCallback((dataset: LabDataset) => {
    const normalized = normalizeDataset(dataset);
    setUnits(normalized.units);
    setProfessionals(normalized.professionals);
    setStudents(normalized.students);
    setRooms(normalized.rooms);
    setActivities(normalized.activities);
    setClasses(normalized.classes);
    setAllocations(normalized.allocations);
    setEnrollments(normalized.enrollments);
  }, []);

  const refreshFromServer = useCallback(async () => {
    setIsLoading(true);
    try {
      const dataset = await unitOperationsApi.getDataset();
      applyDataset(dataset);
      setDataSource("api");
      setSyncError(null);
      hasSyncedOnceRef.current = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao sincronizar dados operacionais";

      if (DEV_LOCAL_FALLBACK_ENABLED && !hasSyncedOnceRef.current) {
        applyDataset(buildDevFallbackDataset());
        setDataSource("dev_fallback");
        setSyncError(
          `${message}. Fallback local habilitado apenas para desenvolvimento e em modo somente leitura.`
        );
      } else {
        setDataSource("api");
        setSyncError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyDataset]);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  const allocationConflicts = useMemo(
    () => buildAllocationConflictMap(allocations),
    [allocations]
  );
  const classOccupancy = useMemo(() => countClassOccupancy(enrollments), [enrollments]);
  const enrollmentConflicts = useMemo(
    () => buildStudentScheduleConflictMap(enrollments, allocations, classes),
    [enrollments, allocations, classes]
  );

  const assertWriteEnabled = useCallback(() => {
    if (dataSource !== "api") {
      throw new Error(
        "Modo somente leitura: API oficial indisponivel. Nenhum dado operacional foi salvo."
      );
    }
  }, [dataSource]);

  const upsertRoom = useCallback(
    async (item: Room) => {
      assertWriteEnabled();
      const saved = await unitOperationsApi.upsertRoom(item);
      setRooms((current) => upsertById(current, saved));
    },
    [assertWriteEnabled]
  );

  const upsertActivity = useCallback(
    async (item: Activity) => {
      assertWriteEnabled();
      const saved = await unitOperationsApi.upsertActivity(item);
      setActivities((current) => upsertById(current, saved));
    },
    [assertWriteEnabled]
  );

  const upsertClass = useCallback(
    async (item: GroupClass) => {
      assertWriteEnabled();
      const saved = await unitOperationsApi.upsertClass(item);
      setClasses((current) => upsertById(current, saved));
    },
    [assertWriteEnabled]
  );

  const upsertAllocation = useCallback(
    async (item: Allocation) => {
      assertWriteEnabled();
      const saved = await unitOperationsApi.upsertAllocation(item);
      setAllocations((current) => upsertById(current, saved));
    },
    [assertWriteEnabled]
  );

  const upsertEnrollment = useCallback(
    async (item: StudentEnrollment) => {
      assertWriteEnabled();
      const saved = await unitOperationsApi.upsertEnrollment(item);
      setEnrollments((current) => upsertById(current, saved));
    },
    [assertWriteEnabled]
  );

  const removeAllocation = useCallback(
    async (id: string) => {
      assertWriteEnabled();
      await unitOperationsApi.removeAllocation(id);
      setAllocations((current) => current.filter((item) => item.id !== id));
    },
    [assertWriteEnabled]
  );

  const resetLabData = useCallback(async () => {
    await refreshFromServer();
  }, [refreshFromServer]);

  const isWriteEnabled = dataSource === "api";

  const value = useMemo<AgendaLabContextValue>(
    () => ({
      units,
      professionals,
      students,
      rooms,
      activities,
      classes,
      allocations,
      enrollments,
      upsertRoom,
      upsertActivity,
      upsertClass,
      upsertAllocation,
      upsertEnrollment,
      removeAllocation,
      resetLabData,
      allocationConflicts,
      classOccupancy,
      enrollmentConflicts,
      isLoading,
      syncError,
      dataSource,
      isWriteEnabled,
      devFallbackEnabled: DEV_LOCAL_FALLBACK_ENABLED,
      refreshFromServer,
    }),
    [
      units,
      professionals,
      students,
      rooms,
      activities,
      classes,
      allocations,
      enrollments,
      upsertRoom,
      upsertActivity,
      upsertClass,
      upsertAllocation,
      upsertEnrollment,
      removeAllocation,
      resetLabData,
      allocationConflicts,
      classOccupancy,
      enrollmentConflicts,
      isLoading,
      syncError,
      dataSource,
      isWriteEnabled,
      refreshFromServer,
    ]
  );

  return <AgendaLabContext.Provider value={value}>{children}</AgendaLabContext.Provider>;
}

export function useAgendaLab() {
  const context = useContext(AgendaLabContext);
  if (!context) {
    throw new Error("useAgendaLab deve ser usado dentro de AgendaLabProvider.");
  }
  return context;
}
