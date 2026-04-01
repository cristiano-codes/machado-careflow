import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { clearLabStorage, readLabStorage, writeLabStorage } from "@/features/agendaLab/utils/storage";
import { unitOperationsApi } from "@/features/agendaLab/services/unitOperationsApi";

type AgendaLabDataSource = "api" | "fallback";

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
  refreshFromServer: () => Promise<void>;
};

type PersistedLabData = {
  rooms?: Room[];
  activities?: Activity[];
  classes?: GroupClass[];
  allocations?: Allocation[];
  enrollments?: StudentEnrollment[];
};

const AgendaLabContext = createContext<AgendaLabContextValue | undefined>(undefined);

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index < 0) return [nextItem, ...items];
  const clone = [...items];
  clone[index] = nextItem;
  return clone;
}

function readFallbackDataset(persisted: PersistedLabData | null): LabDataset {
  return {
    units: DEFAULT_UNITS,
    professionals: DEFAULT_PROFESSIONALS,
    students: DEFAULT_STUDENTS,
    rooms:
      Array.isArray(persisted?.rooms) && persisted.rooms.length > 0
        ? persisted.rooms
        : DEFAULT_ROOMS,
    activities:
      Array.isArray(persisted?.activities) && persisted.activities.length > 0
        ? persisted.activities
        : DEFAULT_ACTIVITIES,
    classes:
      Array.isArray(persisted?.classes) && persisted.classes.length > 0
        ? persisted.classes
        : DEFAULT_CLASSES,
    allocations:
      Array.isArray(persisted?.allocations) && persisted.allocations.length > 0
        ? persisted.allocations
        : DEFAULT_ALLOCATIONS,
    enrollments:
      Array.isArray(persisted?.enrollments) && persisted.enrollments.length > 0
        ? persisted.enrollments
        : DEFAULT_ENROLLMENTS,
  };
}

function normalizeDataset(dataset: LabDataset): LabDataset {
  return {
    units: dataset.units.length > 0 ? dataset.units : DEFAULT_UNITS,
    professionals: dataset.professionals,
    students: dataset.students,
    rooms: dataset.rooms,
    activities: dataset.activities,
    classes: dataset.classes,
    allocations: dataset.allocations,
    enrollments: dataset.enrollments,
  };
}

export function AgendaLabProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(() => readLabStorage(), []);
  const fallbackDataset = useMemo(() => readFallbackDataset(persisted), [persisted]);

  const [units, setUnits] = useState<Unit[]>(fallbackDataset.units);
  const [professionals, setProfessionals] = useState<Professional[]>(fallbackDataset.professionals);
  const [students, setStudents] = useState<Student[]>(fallbackDataset.students);
  const [rooms, setRooms] = useState<Room[]>(fallbackDataset.rooms);
  const [activities, setActivities] = useState<Activity[]>(fallbackDataset.activities);
  const [classes, setClasses] = useState<GroupClass[]>(fallbackDataset.classes);
  const [allocations, setAllocations] = useState<Allocation[]>(fallbackDataset.allocations);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>(fallbackDataset.enrollments);

  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<AgendaLabDataSource>("fallback");

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
    } catch (error) {
      const fallback = readFallbackDataset(readLabStorage());
      applyDataset(fallback);
      setDataSource("fallback");
      setSyncError(error instanceof Error ? error.message : "Falha ao sincronizar dados operacionais");
    } finally {
      setIsLoading(false);
    }
  }, [applyDataset]);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  useEffect(() => {
    if (dataSource !== "fallback") return;
    writeLabStorage({
      rooms,
      activities,
      classes,
      allocations,
      enrollments,
    });
  }, [rooms, activities, classes, allocations, enrollments, dataSource]);

  const allocationConflicts = useMemo(
    () => buildAllocationConflictMap(allocations),
    [allocations]
  );
  const classOccupancy = useMemo(
    () => countClassOccupancy(enrollments),
    [enrollments]
  );
  const enrollmentConflicts = useMemo(
    () => buildStudentScheduleConflictMap(enrollments, allocations, classes),
    [enrollments, allocations, classes]
  );

  const upsertRoom = useCallback(
    async (item: Room) => {
      if (dataSource === "api") {
        const saved = await unitOperationsApi.upsertRoom(item);
        setRooms((current) => upsertById(current, saved));
        return;
      }

      setRooms((current) => upsertById(current, item));
    },
    [dataSource]
  );

  const upsertActivity = useCallback(
    async (item: Activity) => {
      if (dataSource === "api") {
        const saved = await unitOperationsApi.upsertActivity(item);
        setActivities((current) => upsertById(current, saved));
        return;
      }

      setActivities((current) => upsertById(current, item));
    },
    [dataSource]
  );

  const upsertClass = useCallback(
    async (item: GroupClass) => {
      if (dataSource === "api") {
        const saved = await unitOperationsApi.upsertClass(item);
        setClasses((current) => upsertById(current, saved));
        return;
      }

      setClasses((current) => upsertById(current, item));
    },
    [dataSource]
  );

  const upsertAllocation = useCallback(
    async (item: Allocation) => {
      if (dataSource === "api") {
        const saved = await unitOperationsApi.upsertAllocation(item);
        setAllocations((current) => upsertById(current, saved));
        return;
      }

      setAllocations((current) => upsertById(current, item));
    },
    [dataSource]
  );

  const upsertEnrollment = useCallback(
    async (item: StudentEnrollment) => {
      if (dataSource === "api") {
        const saved = await unitOperationsApi.upsertEnrollment(item);
        setEnrollments((current) => upsertById(current, saved));
        return;
      }

      setEnrollments((current) => upsertById(current, item));
    },
    [dataSource]
  );

  const removeAllocation = useCallback(
    async (id: string) => {
      if (dataSource === "api") {
        await unitOperationsApi.removeAllocation(id);
      }

      setAllocations((current) => current.filter((item) => item.id !== id));
    },
    [dataSource]
  );

  const resetLabData = useCallback(async () => {
    clearLabStorage();
    if (dataSource === "api") {
      await refreshFromServer();
      return;
    }

    const fallback = readFallbackDataset(null);
    applyDataset(fallback);
  }, [applyDataset, dataSource, refreshFromServer]);

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
