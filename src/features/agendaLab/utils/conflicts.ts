import type { Allocation, EnrollmentStatus, GroupClass, StudentEnrollment } from "@/features/agendaLab/types";
import { overlaps, parseTimeToMinutes } from "@/features/agendaLab/utils/time";

const ALLOCATION_ACTIVE_STATUSES = new Set(["ativa", "planejada"]);
const ENROLLMENT_ACTIVE_STATUSES = new Set<EnrollmentStatus>(["ativo", "aguardando_vaga"]);

export type AllocationConflictEntry = {
  allocationId: string;
  roomConflicts: string[];
  professionalConflicts: string[];
  hasConflict: boolean;
};

export function buildAllocationConflictMap(allocations: Allocation[]) {
  const map = new Map<string, AllocationConflictEntry>();

  for (const allocation of allocations) {
    map.set(allocation.id, {
      allocationId: allocation.id,
      roomConflicts: [],
      professionalConflicts: [],
      hasConflict: false,
    });
  }

  for (let index = 0; index < allocations.length; index += 1) {
    const left = allocations[index];
    if (!ALLOCATION_ACTIVE_STATUSES.has(left.status)) continue;
    const leftStart = parseTimeToMinutes(left.horaInicial);
    const leftEnd = parseTimeToMinutes(left.horaFinal);
    if (leftStart === null || leftEnd === null || leftEnd <= leftStart) continue;

    for (let rightIndex = index + 1; rightIndex < allocations.length; rightIndex += 1) {
      const right = allocations[rightIndex];
      if (!ALLOCATION_ACTIVE_STATUSES.has(right.status)) continue;
      if (left.weekday !== right.weekday) continue;

      const rightStart = parseTimeToMinutes(right.horaInicial);
      const rightEnd = parseTimeToMinutes(right.horaFinal);
      if (rightStart === null || rightEnd === null || rightEnd <= rightStart) continue;
      if (!overlaps(leftStart, leftEnd, rightStart, rightEnd)) continue;

      if (left.roomId === right.roomId) {
        map.get(left.id)?.roomConflicts.push(right.id);
        map.get(right.id)?.roomConflicts.push(left.id);
      }
      if (left.professionalId === right.professionalId) {
        map.get(left.id)?.professionalConflicts.push(right.id);
        map.get(right.id)?.professionalConflicts.push(left.id);
      }
    }
  }

  for (const [, entry] of map) {
    entry.hasConflict = entry.roomConflicts.length > 0 || entry.professionalConflicts.length > 0;
  }

  return map;
}

export function countClassOccupancy(enrollments: StudentEnrollment[]) {
  const counts = new Map<string, { ativos: number; espera: number }>();
  for (const enrollment of enrollments) {
    const current = counts.get(enrollment.classId) || { ativos: 0, espera: 0 };
    if (enrollment.status === "ativo") current.ativos += 1;
    if (enrollment.status === "aguardando_vaga") current.espera += 1;
    counts.set(enrollment.classId, current);
  }
  return counts;
}

export function hasDuplicateActiveEnrollment(
  enrollments: StudentEnrollment[],
  classId: string,
  studentId: string,
  skipEnrollmentId?: string
) {
  return enrollments.some((item) => {
    if (skipEnrollmentId && item.id === skipEnrollmentId) return false;
    if (item.classId !== classId) return false;
    if (item.studentId !== studentId) return false;
    return ENROLLMENT_ACTIVE_STATUSES.has(item.status);
  });
}

type EnrollmentConflictEntry = {
  enrollmentId: string;
  studentId: string;
  conflictingClassIds: string[];
  hasConflict: boolean;
};

export function buildStudentScheduleConflictMap(
  enrollments: StudentEnrollment[],
  allocations: Allocation[],
  classes: GroupClass[]
) {
  const classIdSet = new Set(classes.map((item) => item.id));
  const allocationByClass = new Map<string, Allocation[]>();
  for (const allocation of allocations) {
    if (!ALLOCATION_ACTIVE_STATUSES.has(allocation.status)) continue;
    if (!classIdSet.has(allocation.classId)) continue;
    if (!allocationByClass.has(allocation.classId)) {
      allocationByClass.set(allocation.classId, []);
    }
    allocationByClass.get(allocation.classId)?.push(allocation);
  }

  const studentActiveEnrollments = new Map<string, StudentEnrollment[]>();
  for (const enrollment of enrollments) {
    if (!ENROLLMENT_ACTIVE_STATUSES.has(enrollment.status)) continue;
    if (!studentActiveEnrollments.has(enrollment.studentId)) {
      studentActiveEnrollments.set(enrollment.studentId, []);
    }
    studentActiveEnrollments.get(enrollment.studentId)?.push(enrollment);
  }

  const result = new Map<string, EnrollmentConflictEntry>();
  for (const enrollment of enrollments) {
    result.set(enrollment.id, {
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      conflictingClassIds: [],
      hasConflict: false,
    });
  }

  for (const [studentId, studentEnrollments] of studentActiveEnrollments) {
    if (studentEnrollments.length <= 1) continue;

    for (let index = 0; index < studentEnrollments.length; index += 1) {
      const leftEnrollment = studentEnrollments[index];
      const leftAllocations = allocationByClass.get(leftEnrollment.classId) || [];
      if (leftAllocations.length === 0) continue;

      for (let rightIndex = index + 1; rightIndex < studentEnrollments.length; rightIndex += 1) {
        const rightEnrollment = studentEnrollments[rightIndex];
        const rightAllocations = allocationByClass.get(rightEnrollment.classId) || [];
        if (rightAllocations.length === 0) continue;

        let foundConflict = false;
        for (const leftAllocation of leftAllocations) {
          const leftStart = parseTimeToMinutes(leftAllocation.horaInicial);
          const leftEnd = parseTimeToMinutes(leftAllocation.horaFinal);
          if (leftStart === null || leftEnd === null || leftEnd <= leftStart) continue;

          for (const rightAllocation of rightAllocations) {
            if (leftAllocation.weekday !== rightAllocation.weekday) continue;
            const rightStart = parseTimeToMinutes(rightAllocation.horaInicial);
            const rightEnd = parseTimeToMinutes(rightAllocation.horaFinal);
            if (rightStart === null || rightEnd === null || rightEnd <= rightStart) continue;
            if (overlaps(leftStart, leftEnd, rightStart, rightEnd)) {
              foundConflict = true;
              break;
            }
          }
          if (foundConflict) break;
        }

        if (foundConflict) {
          const leftEntry = result.get(leftEnrollment.id);
          const rightEntry = result.get(rightEnrollment.id);
          if (leftEntry && !leftEntry.conflictingClassIds.includes(rightEnrollment.classId)) {
            leftEntry.conflictingClassIds.push(rightEnrollment.classId);
            leftEntry.hasConflict = true;
          }
          if (rightEntry && !rightEntry.conflictingClassIds.includes(leftEnrollment.classId)) {
            rightEntry.conflictingClassIds.push(leftEnrollment.classId);
            rightEntry.hasConflict = true;
          }
        }
      }
    }
  }

  for (const [, entry] of result) {
    entry.hasConflict = entry.conflictingClassIds.length > 0;
  }

  return result;
}

