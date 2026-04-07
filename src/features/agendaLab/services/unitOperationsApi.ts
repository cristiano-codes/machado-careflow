import { API_BASE_URL, AUTH_UNAUTHORIZED_EVENT } from "@/services/api";
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

type UnitOperationsDataset = {
  units: Unit[];
  professionals: Professional[];
  students: Student[];
  rooms: Room[];
  activities: Activity[];
  classes: GroupClass[];
  allocations: Allocation[];
  enrollments: StudentEnrollment[];
};

function normalizeStoredToken(raw: string | null): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;

  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string") {
        value = parsed.trim();
      }
    } catch {
      // noop
    }
  }

  const lower = value.toLowerCase();
  if (!value || lower === "null" || lower === "undefined") {
    return null;
  }

  return value;
}

function readAuthToken() {
  if (typeof window === "undefined") return null;
  return (
    normalizeStoredToken(window.localStorage.getItem("token")) ||
    normalizeStoredToken(window.sessionStorage.getItem("token"))
  );
}

function buildHeaders(withJson = true) {
  const token = readAuthToken();
  return {
    ...(withJson ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).message === "string"
  ) {
    const message = ((payload as Record<string, unknown>).message as string).trim();
    if (message.length > 0) return message;
  }

  return fallback;
}

function buildUnitOperationsUrl(path: string, bustCache = false) {
  const baseUrl = `${API_BASE_URL}/unit-operations${path}`;
  if (!bustCache) return baseUrl;

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}_ts=${Date.now()}`;
}

async function requestUnitOperations<T>(
  path: string,
  init: RequestInit,
  fallbackError: string
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const isReadRequest = method === "GET" || method === "HEAD";
  const requestHeaders = {
    ...buildHeaders(init.body !== undefined),
    ...(isReadRequest ? { "Cache-Control": "no-cache", Pragma: "no-cache" } : {}),
    ...(init.headers || {}),
  };
  const requestInit: RequestInit = {
    ...init,
    method,
    cache: isReadRequest ? "no-store" : init.cache,
    headers: requestHeaders,
  };

  let response: Response;
  try {
    response = await fetch(buildUnitOperationsUrl(path), requestInit);
    if (response.status === 304 && isReadRequest) {
      response = await fetch(buildUnitOperationsUrl(path, true), requestInit);
    }
  } catch {
    throw new Error("API operacional indisponivel no momento. Verifique a conexao.");
  }

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }
    throw new Error(getErrorMessage(payload, fallbackError));
  }

  return payload as T;
}

function sanitizeDataset(input: Partial<UnitOperationsDataset> | null | undefined): LabDataset {
  return {
    units: Array.isArray(input?.units) ? input.units : [],
    professionals: Array.isArray(input?.professionals) ? input.professionals : [],
    students: Array.isArray(input?.students) ? input.students : [],
    rooms: Array.isArray(input?.rooms) ? input.rooms : [],
    activities: Array.isArray(input?.activities) ? input.activities : [],
    classes: Array.isArray(input?.classes) ? input.classes : [],
    allocations: Array.isArray(input?.allocations) ? input.allocations : [],
    enrollments: Array.isArray(input?.enrollments) ? input.enrollments : [],
  };
}

export const unitOperationsApi = {
  async getDataset(): Promise<LabDataset> {
    const payload = await requestUnitOperations<
      { success?: boolean; dataset?: Partial<UnitOperationsDataset> } & Partial<UnitOperationsDataset>
    >(
      "/dataset",
      { method: "GET" },
      "Falha ao carregar dados operacionais de turmas"
    );

    const datasetCandidate =
      payload?.dataset && typeof payload.dataset === "object" ? payload.dataset : payload;

    return sanitizeDataset(datasetCandidate);
  },

  async upsertRoom(room: Room): Promise<Room> {
    const payload = await requestUnitOperations<{ success?: boolean; room?: Room }>(
      "/rooms/upsert",
      {
        method: "POST",
        body: JSON.stringify(room),
      },
      "Falha ao salvar sala"
    );

    if (!payload?.room) {
      throw new Error("Resposta invalida ao salvar sala");
    }

    return payload.room;
  },

  async upsertActivity(activity: Activity): Promise<Activity> {
    const payload = await requestUnitOperations<{ success?: boolean; activity?: Activity }>(
      "/activities/upsert",
      {
        method: "POST",
        body: JSON.stringify(activity),
      },
      "Falha ao salvar atividade"
    );

    if (!payload?.activity) {
      throw new Error("Resposta invalida ao salvar atividade");
    }

    return payload.activity;
  },

  async upsertClass(classItem: GroupClass): Promise<GroupClass> {
    const payload = await requestUnitOperations<{ success?: boolean; classItem?: GroupClass }>(
      "/classes/upsert",
      {
        method: "POST",
        body: JSON.stringify(classItem),
      },
      "Falha ao salvar turma"
    );

    if (!payload?.classItem) {
      throw new Error("Resposta invalida ao salvar turma");
    }

    return payload.classItem;
  },

  async upsertAllocation(allocation: Allocation): Promise<Allocation> {
    const payload = await requestUnitOperations<{ success?: boolean; allocation?: Allocation }>(
      "/schedule-slots/upsert",
      {
        method: "POST",
        body: JSON.stringify(allocation),
      },
      "Falha ao salvar alocacao"
    );

    if (!payload?.allocation) {
      throw new Error("Resposta invalida ao salvar alocacao");
    }

    return payload.allocation;
  },

  async removeAllocation(id: string): Promise<void> {
    await requestUnitOperations<{ success?: boolean }>(
      `/schedule-slots/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      "Falha ao remover alocacao"
    );
  },

  async upsertEnrollment(enrollment: StudentEnrollment): Promise<StudentEnrollment> {
    const payload = await requestUnitOperations<{ success?: boolean; enrollment?: StudentEnrollment }>(
      "/enrollments/upsert",
      {
        method: "POST",
        body: JSON.stringify(enrollment),
      },
      "Falha ao salvar matricula"
    );

    if (!payload?.enrollment) {
      throw new Error("Resposta invalida ao salvar matricula");
    }

    return payload.enrollment;
  },
};

