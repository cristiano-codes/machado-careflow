import {
  createContext,
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
import type { Activity, Allocation, GroupClass, Room, StudentEnrollment } from "@/features/agendaLab/types";
import {
  buildAllocationConflictMap,
  buildStudentScheduleConflictMap,
  countClassOccupancy,
} from "@/features/agendaLab/utils/conflicts";
import { clearLabStorage, readLabStorage, writeLabStorage } from "@/features/agendaLab/utils/storage";

type AgendaLabContextValue = {
  units: typeof DEFAULT_UNITS;
  professionals: typeof DEFAULT_PROFESSIONALS;
  students: typeof DEFAULT_STUDENTS;
  rooms: Room[];
  activities: Activity[];
  classes: GroupClass[];
  allocations: Allocation[];
  enrollments: StudentEnrollment[];
  upsertRoom: (item: Room) => void;
  upsertActivity: (item: Activity) => void;
  upsertClass: (item: GroupClass) => void;
  upsertAllocation: (item: Allocation) => void;
  upsertEnrollment: (item: StudentEnrollment) => void;
  removeAllocation: (id: string) => void;
  resetLabData: () => void;
  allocationConflicts: ReturnType<typeof buildAllocationConflictMap>;
  classOccupancy: ReturnType<typeof countClassOccupancy>;
  enrollmentConflicts: ReturnType<typeof buildStudentScheduleConflictMap>;
};

const AgendaLabContext = createContext<AgendaLabContextValue | undefined>(undefined);

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index < 0) return [nextItem, ...items];
  const clone = [...items];
  clone[index] = nextItem;
  return clone;
}

export function AgendaLabProvider({ children }: { children: ReactNode }) {
  const persisted = readLabStorage();

  const [rooms, setRooms] = useState<Room[]>(() =>
    Array.isArray(persisted?.rooms) && persisted.rooms.length > 0 ? persisted.rooms : DEFAULT_ROOMS
  );
  const [activities, setActivities] = useState<Activity[]>(() =>
    Array.isArray(persisted?.activities) && persisted.activities.length > 0
      ? persisted.activities
      : DEFAULT_ACTIVITIES
  );
  const [classes, setClasses] = useState<GroupClass[]>(() =>
    Array.isArray(persisted?.classes) && persisted.classes.length > 0 ? persisted.classes : DEFAULT_CLASSES
  );
  const [allocations, setAllocations] = useState<Allocation[]>(() =>
    Array.isArray(persisted?.allocations) && persisted.allocations.length > 0
      ? persisted.allocations
      : DEFAULT_ALLOCATIONS
  );
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>(() =>
    Array.isArray(persisted?.enrollments) && persisted.enrollments.length > 0
      ? persisted.enrollments
      : DEFAULT_ENROLLMENTS
  );

  useEffect(() => {
    writeLabStorage({
      rooms,
      activities,
      classes,
      allocations,
      enrollments,
    });
  }, [rooms, activities, classes, allocations, enrollments]);

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

  const value = useMemo<AgendaLabContextValue>(
    () => ({
      units: DEFAULT_UNITS,
      professionals: DEFAULT_PROFESSIONALS,
      students: DEFAULT_STUDENTS,
      rooms,
      activities,
      classes,
      allocations,
      enrollments,
      upsertRoom: (item) => setRooms((current) => upsertById(current, item)),
      upsertActivity: (item) => setActivities((current) => upsertById(current, item)),
      upsertClass: (item) => setClasses((current) => upsertById(current, item)),
      upsertAllocation: (item) => setAllocations((current) => upsertById(current, item)),
      upsertEnrollment: (item) => setEnrollments((current) => upsertById(current, item)),
      removeAllocation: (id) =>
        setAllocations((current) => current.filter((item) => item.id !== id)),
      resetLabData: () => {
        clearLabStorage();
        setRooms(DEFAULT_ROOMS);
        setActivities(DEFAULT_ACTIVITIES);
        setClasses(DEFAULT_CLASSES);
        setAllocations(DEFAULT_ALLOCATIONS);
        setEnrollments(DEFAULT_ENROLLMENTS);
      },
      allocationConflicts,
      classOccupancy,
      enrollmentConflicts,
    }),
    [
      rooms,
      activities,
      classes,
      allocations,
      enrollments,
      allocationConflicts,
      classOccupancy,
      enrollmentConflicts,
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

