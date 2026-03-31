import type { Activity, Allocation, GroupClass, Room, StudentEnrollment } from "@/features/agendaLab/types";

const STORAGE_KEY = "agenda_lab_dataset_v1";

type PersistedLabData = {
  rooms?: Room[];
  activities?: Activity[];
  classes?: GroupClass[];
  allocations?: Allocation[];
  enrollments?: StudentEnrollment[];
};

export function readLabStorage(): PersistedLabData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedLabData;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLabStorage(data: PersistedLabData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage write errors in lab mode.
  }
}

export function clearLabStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage clear errors in lab mode.
  }
}

