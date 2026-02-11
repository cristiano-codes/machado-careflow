// src/services/api.ts
// Centraliza todas as chamadas HTTP do frontend (login, verify, users, settings, etc.)

/**
 * Descobre o melhor BASE URL para a API.
 * Preferência:
 * 1) VITE_API_BASE_URL (ex.: "/api" com proxy do Vite, ou "http://localhost:3000/api")
 * 2) Fallback automático baseado no hostname atual (http://<host>:3000/api)
 */
function resolveApiBase(): string {
  const envBase = import.meta.env?.VITE_API_BASE_URL as string | undefined;
  if (envBase && envBase.trim().length > 0) {
    return envBase; // ex.: "/api" (proxy) OU "http://localhost:3000/api"
  }

  const hostname = window.location.hostname;
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    isIPv4 ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

  // Fora de rede local, você pode ligar um demo-mode, se quiser
  // Aqui mantemos apenas o fallback de base URL.
  if (isLocal) {
    return `http://${hostname}:3000/api`;
  }

  return "/api";
}

const API_BASE_URL = resolveApiBase();

export type LoginResponse = {
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: string | number;
    username: string;
    email: string;
    name: string;
    role: string;
    status?: string;
    first_access?: boolean;
    created_at?: string;
    updated_at?: string;
  };
};

export type User = {
  id: string | number;
  username: string;
  email: string;
  name: string;
  role: string;
};

export type SettingsPayload = {
  instituicao_nome: string;
  instituicao_email: string;
  instituicao_telefone: string;
  instituicao_endereco: string;
  instituicao_logo_base64?: string | null;
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  weekly_reports: boolean;
  two_factor_auth: boolean;
  password_expiry_days: number;
  max_login_attempts: number;
  session_timeout: number;
  backup_frequency: "daily" | "weekly" | "monthly" | string;
  data_retention_days: number;
  auto_updates: boolean;
  debug_mode: boolean;
  business_hours: BusinessHours;
  professionals_config: ProfessionalsConfig;
};

export type OperatingDays = {
  seg: boolean;
  ter: boolean;
  qua: boolean;
  qui: boolean;
  sex: boolean;
  sab: boolean;
  dom: boolean;
};

export type BusinessHours = {
  opening_time: string;
  closing_time: string;
  lunch_break_minutes: number;
  operating_days: OperatingDays;
};

export type ProfessionalsConfig = {
  allowed_contract_types: string[];
  suggested_weekly_hours: number[];
};

export type WeekScale = {
  seg: boolean;
  ter: boolean;
  qua: boolean;
  qui: boolean;
  sex: boolean;
};

export type ProfessionalRole = {
  id: number;
  nome: string;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProfessionalPayload = {
  name: string;
  email: string;
  username: string;
  phone?: string;
  role?: string;
  crp?: string;
  specialty?: string;
  funcao?: string;
  role_id?: number | null;
  horas_semanais?: number | null;
  data_nascimento?: string | null;
  tipo_contrato: string;
  escala_semanal?: WeekScale;
  status?: "ATIVO" | "INATIVO";
};

type SettingsResponse = {
  success: boolean;
  settings?: SettingsPayload;
  data?: SettingsPayload;
  message?: string;
};

class ApiService {
  private getAuthHeaders() {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  // ---------- AUTH ----------
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = (await response.json()) as LoginResponse;

    if (data?.success && data?.token) {
      localStorage.setItem("token", data.token);
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
    }

    return data;
  }

  async verifyToken(): Promise<{ valid: boolean; user?: User }> {
    const token = localStorage.getItem("token");
    if (!token) return { valid: false };

    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      headers: this.getAuthHeaders(),
    });

    const data = await response.json();

    if (data?.success) {
      return { valid: true, user: data.user as User };
    } else {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      return { valid: false };
    }
  }

  logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  async checkFirstAccess(): Promise<{ firstAccess: boolean }> {
    const resp = await fetch(`${API_BASE_URL}/auth/first-access`, {
      headers: this.getAuthHeaders(),
    });
    return resp.json();
  }

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const resp = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return resp.json();
  }

  // ---------- USERS ----------
  async getUsers() {
    const response = await fetch(`${API_BASE_URL}/users`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  // ---------- SETTINGS ----------
  /**
   * Busca as configurações atuais
   */
  async getSettings(): Promise<SettingsResponse> {
    const r = await fetch(`${API_BASE_URL}/settings`, {
      headers: this.getAuthHeaders(),
    });
    if (!r.ok) {
      throw new Error("Falha ao carregar configurações");
    }
    return r.json();
  }

  /**
   * Salva as configurações no backend (usa exatamente as chaves snake_case
   * que o backend espera no body).
   */
  async saveSettings(payload: SettingsPayload): Promise<SettingsResponse> {
    const r = await fetch(`${API_BASE_URL}/settings`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const txt = await r.text();
      let message = `Falha ao salvar configurações (HTTP ${r.status})`;
      try {
        const parsed = JSON.parse(txt);
        if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
          message = parsed.message;
        }
      } catch {
        if (txt.trim()) {
          message = `${message}: ${txt}`;
        }
      }
      throw new Error(message);
    }
    return r.json();
  }

  // ---------- SETTINGS: PROFESSIONAL ROLES ----------
  async getProfessionalRoles(includeInactive = false): Promise<{
    success: boolean;
    roles: ProfessionalRole[];
    message?: string;
  }> {
    const suffix = includeInactive ? "?all=1" : "";
    const response = await fetch(`${API_BASE_URL}/settings/professional-roles${suffix}`, {
      headers: this.getAuthHeaders(),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao carregar funcoes profissionais");
    }
    return {
      success: Boolean(data?.success),
      roles: Array.isArray(data?.roles) ? data.roles : [],
      message: data?.message,
    };
  }

  async createProfessionalRole(nome: string): Promise<{
    success: boolean;
    role?: ProfessionalRole;
    message?: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/settings/professional-roles`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ nome }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao criar funcao profissional");
    }
    return data;
  }

  async updateProfessionalRole(id: number, nome: string): Promise<{
    success: boolean;
    role?: ProfessionalRole;
    message?: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/settings/professional-roles/${id}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ nome }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao editar funcao profissional");
    }
    return data;
  }

  async setProfessionalRoleActive(id: number, ativo: boolean): Promise<{
    success: boolean;
    role?: ProfessionalRole;
    message?: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/settings/professional-roles/${id}/ativo`, {
      method: "PATCH",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ ativo }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || "Falha ao atualizar status da funcao profissional");
    }
    return data;
  }

  // ---------- PROFISSIONAIS ----------
  async getProfessionals(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const response = await fetch(`${API_BASE_URL}/profissionais${query}`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async createProfessional(payload: ProfessionalPayload) {
    const response = await fetch(`${API_BASE_URL}/profissionais`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  async updateProfessional(id: string, payload: Partial<ProfessionalPayload>) {
    const response = await fetch(`${API_BASE_URL}/profissionais/${id}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  async updateProfessionalStatus(id: string, status: "ATIVO" | "INATIVO") {
    const response = await fetch(`${API_BASE_URL}/profissionais/${id}/status`, {
      method: "PATCH",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    return response.json();
  }

  async getProfessionalAgenda(id: string, date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const response = await fetch(`${API_BASE_URL}/profissionais/${id}/agenda${query}`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async getProfessionalsStats(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const response = await fetch(`${API_BASE_URL}/profissionais/stats/resumo${query}`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  // ---------- PACIENTES ----------
  async getPatients() {
    const response = await fetch(`${API_BASE_URL}/pacientes`, {
      headers: this.getAuthHeaders(),
    });
    const data = await response.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.pacientes)) return data.pacientes;
    return [];
  }

  // ---------- ENTREVISTAS SOCIAIS ----------
  async getSocialInterviews(patientId?: string) {
    const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
    const response = await fetch(`${API_BASE_URL}/social-interviews${query}`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Falha ao carregar entrevistas sociais");
    }
    return response.json();
  }

  async createSocialInterview(payload: Record<string, unknown>) {
    const response = await fetch(`${API_BASE_URL}/social-interviews`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Erro ao criar entrevista social: ${text}`);
    }
    return response.json();
  }

  async updateSocialInterview(id: string, payload: Record<string, unknown>) {
    const response = await fetch(`${API_BASE_URL}/social-interviews/${id}`, {
      method: "PUT",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Erro ao atualizar entrevista social: ${text}`);
    }
    return response.json();
  }
}

export const apiService = new ApiService();
export { API_BASE_URL };
