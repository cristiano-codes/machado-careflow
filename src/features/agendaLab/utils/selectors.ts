import type {
  Activity,
  Allocation,
  GroupClass,
  Professional,
  Room,
  Student,
  StudentEnrollment,
} from "@/features/agendaLab/types";

export function byIdMap<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

export function getClassEnrollmentSummary(
  enrollments: StudentEnrollment[]
) {
  const map = new Map<string, { ativos: number; espera: number; total: number }>();
  for (const enrollment of enrollments) {
    const current = map.get(enrollment.classId) || { ativos: 0, espera: 0, total: 0 };
    current.total += 1;
    if (enrollment.status === "ativo") current.ativos += 1;
    if (enrollment.status === "aguardando_vaga") current.espera += 1;
    map.set(enrollment.classId, current);
  }
  return map;
}

export type EnrichedAllocation = {
  allocation: Allocation;
  classData: GroupClass | null;
  room: Room | null;
  activity: Activity | null;
  professional: Professional | null;
  activeStudents: Student[];
  waitingStudents: Student[];
};

export function enrichAllocations(params: {
  allocations: Allocation[];
  classes: GroupClass[];
  rooms: Room[];
  activities: Activity[];
  professionals: Professional[];
  students: Student[];
  enrollments: StudentEnrollment[];
}) {
  const classMap = byIdMap(params.classes);
  const roomMap = byIdMap(params.rooms);
  const activityMap = byIdMap(params.activities);
  const professionalMap = byIdMap(params.professionals);
  const studentMap = byIdMap(params.students);

  const activeEnrollmentsByClass = new Map<string, StudentEnrollment[]>();
  const waitingEnrollmentsByClass = new Map<string, StudentEnrollment[]>();

  for (const enrollment of params.enrollments) {
    if (enrollment.status === "ativo") {
      if (!activeEnrollmentsByClass.has(enrollment.classId)) {
        activeEnrollmentsByClass.set(enrollment.classId, []);
      }
      activeEnrollmentsByClass.get(enrollment.classId)?.push(enrollment);
    }
    if (enrollment.status === "aguardando_vaga") {
      if (!waitingEnrollmentsByClass.has(enrollment.classId)) {
        waitingEnrollmentsByClass.set(enrollment.classId, []);
      }
      waitingEnrollmentsByClass.get(enrollment.classId)?.push(enrollment);
    }
  }

  return params.allocations.map((allocation) => {
    const classData = classMap.get(allocation.classId) || null;
    const room = roomMap.get(allocation.roomId) || null;
    const professional = professionalMap.get(allocation.professionalId) || null;
    const activity = classData ? activityMap.get(classData.activityId) || null : null;

    const activeStudents = (activeEnrollmentsByClass.get(allocation.classId) || [])
      .map((item) => studentMap.get(item.studentId))
      .filter((item): item is Student => Boolean(item));
    const waitingStudents = (waitingEnrollmentsByClass.get(allocation.classId) || [])
      .map((item) => studentMap.get(item.studentId))
      .filter((item): item is Student => Boolean(item));

    return {
      allocation,
      classData,
      room,
      activity,
      professional,
      activeStudents,
      waitingStudents,
    };
  });
}

