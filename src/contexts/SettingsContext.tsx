// src/contexts/SettingsContext.tsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  apiService,
  type SettingsPayload,
  type BusinessHours,
  type ProfessionalsConfig,
  type RegistrationMode,
  type PublicSignupDefaultStatus,
  type LinkPolicy,
} from "@/services/api";
import { updateFaviconFromLogo } from "@/lib/favicon";
import { useAuth } from "@/contexts/AuthContext";

export interface Settings {
  instituicao_nome: string;
  instituicao_email: string;
  instituicao_telefone: string;
  instituicao_endereco: string;
  instituicao_logo_url?: string | null;
  instituicao_logo_base64?: string | null;
  instituicao_logo_updated_at?: string | null;
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  weekly_reports: boolean;
  two_factor_auth: boolean;
  password_expiry_days: number;
  max_login_attempts: number;
  session_timeout: number;
  backup_frequency: string;
  data_retention_days: number;
  auto_updates: boolean;
  debug_mode: boolean;
  registration_mode: RegistrationMode;
  public_signup_default_status: PublicSignupDefaultStatus;
  link_policy: LinkPolicy;
  allow_create_user_from_professional: boolean;
  block_duplicate_email: boolean;
  allow_public_registration: boolean;
  allow_professional_view_others: boolean;
  business_hours: BusinessHours;
  professionals_config: ProfessionalsConfig;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  saveSettings: (payload?: Partial<Settings>) => Promise<void>;
  reloadSettings: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const defaultBusinessHours: BusinessHours = {
  opening_time: "08:00",
  closing_time: "17:20",
  lunch_break_minutes: 60,
  operating_days: {
    seg: true,
    ter: true,
    qua: true,
    qui: true,
    sex: true,
    sab: false,
    dom: false,
  },
};

const defaultProfessionalsConfig: ProfessionalsConfig = {
  allowed_contract_types: ["CLT", "PJ", "Voluntário", "Estágio", "Temporário"],
  suggested_weekly_hours: [20, 30, 40],
};

const defaultSettings: Settings = {
  instituicao_nome: "Instituto Lauir Machado",
  instituicao_email: "contato@institutolauir.com.br",
  instituicao_telefone: "(11) 3456-7890",
  instituicao_endereco: "Rua das Flores, 123 - São Paulo, SP",
  instituicao_logo_url: null,
  instituicao_logo_base64: null,
  instituicao_logo_updated_at: null,
  email_notifications: true,
  sms_notifications: false,
  push_notifications: true,
  weekly_reports: true,
  two_factor_auth: false,
  password_expiry_days: 90,
  max_login_attempts: 3,
  session_timeout: 60,
  backup_frequency: "daily",
  data_retention_days: 365,
  auto_updates: true,
  debug_mode: false,
  registration_mode: "INVITE_ONLY",
  public_signup_default_status: "pendente",
  link_policy: "MANUAL_LINK_ADMIN",
  allow_create_user_from_professional: true,
  block_duplicate_email: true,
  allow_public_registration: false,
  allow_professional_view_others: false,
  business_hours: defaultBusinessHours,
  professionals_config: defaultProfessionalsConfig,
};

const SETTINGS_CACHE_KEY = "settings_cache";

function normalizeBusinessHours(value: unknown): BusinessHours {
  const fallback = defaultSettings.business_hours;
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;

  const source = value as Partial<BusinessHours>;
  const operatingDays =
    source.operating_days && typeof source.operating_days === "object" && !Array.isArray(source.operating_days)
      ? source.operating_days
      : fallback.operating_days;

  return {
    opening_time: typeof source.opening_time === "string" ? source.opening_time : fallback.opening_time,
    closing_time: typeof source.closing_time === "string" ? source.closing_time : fallback.closing_time,
    lunch_break_minutes:
      Number.isInteger(source.lunch_break_minutes) && (source.lunch_break_minutes ?? 0) >= 0
        ? Number(source.lunch_break_minutes)
        : fallback.lunch_break_minutes,
    operating_days: {
      seg: typeof operatingDays.seg === "boolean" ? operatingDays.seg : fallback.operating_days.seg,
      ter: typeof operatingDays.ter === "boolean" ? operatingDays.ter : fallback.operating_days.ter,
      qua: typeof operatingDays.qua === "boolean" ? operatingDays.qua : fallback.operating_days.qua,
      qui: typeof operatingDays.qui === "boolean" ? operatingDays.qui : fallback.operating_days.qui,
      sex: typeof operatingDays.sex === "boolean" ? operatingDays.sex : fallback.operating_days.sex,
      sab: typeof operatingDays.sab === "boolean" ? operatingDays.sab : fallback.operating_days.sab,
      dom: typeof operatingDays.dom === "boolean" ? operatingDays.dom : fallback.operating_days.dom,
    },
  };
}

function normalizeProfessionalsConfig(value: unknown): ProfessionalsConfig {
  const fallback = defaultSettings.professionals_config;
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;

  const source = value as Partial<ProfessionalsConfig>;
  const contractTypes = Array.isArray(source.allowed_contract_types)
    ? source.allowed_contract_types
        .map((item) => (item || "").toString().trim())
        .filter(Boolean)
    : [];

  const weeklyHours = Array.isArray(source.suggested_weekly_hours)
    ? source.suggested_weekly_hours
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    : [];

  return {
    allowed_contract_types: contractTypes.length > 0 ? Array.from(new Set(contractTypes)) : fallback.allowed_contract_types,
    suggested_weekly_hours:
      weeklyHours.length > 0 ? Array.from(new Set(weeklyHours)) : fallback.suggested_weekly_hours,
  };
}

function normalizeSettings(value: Partial<Settings>): Settings {
  const registrationModeRaw = (value.registration_mode || "").toString().trim().toUpperCase();
  const registrationMode: RegistrationMode =
    registrationModeRaw === "ADMIN_ONLY" ||
    registrationModeRaw === "PUBLIC_SIGNUP" ||
    registrationModeRaw === "INVITE_ONLY"
      ? registrationModeRaw
      : value.allow_public_registration
        ? "PUBLIC_SIGNUP"
        : defaultSettings.registration_mode;

  const signupStatusRaw = (value.public_signup_default_status || "").toString().trim().toLowerCase();
  const publicSignupDefaultStatus: PublicSignupDefaultStatus =
    signupStatusRaw === "ativo" || signupStatusRaw === "pendente"
      ? signupStatusRaw
      : defaultSettings.public_signup_default_status;

  const linkPolicyRaw = (value.link_policy || "").toString().trim().toUpperCase();
  const linkPolicy: LinkPolicy =
    linkPolicyRaw === "MANUAL_LINK_ADMIN" ||
    linkPolicyRaw === "AUTO_LINK_BY_EMAIL" ||
    linkPolicyRaw === "SELF_CLAIM_WITH_APPROVAL"
      ? linkPolicyRaw
      : defaultSettings.link_policy;

  const allowPublicRegistration = registrationMode === "PUBLIC_SIGNUP";

  return {
    ...defaultSettings,
    ...value,
    registration_mode: registrationMode,
    public_signup_default_status: publicSignupDefaultStatus,
    link_policy: linkPolicy,
    allow_create_user_from_professional:
      typeof value.allow_create_user_from_professional === "boolean"
        ? value.allow_create_user_from_professional
        : defaultSettings.allow_create_user_from_professional,
    block_duplicate_email:
      typeof value.block_duplicate_email === "boolean"
        ? value.block_duplicate_email
        : defaultSettings.block_duplicate_email,
    allow_public_registration: allowPublicRegistration,
    business_hours: normalizeBusinessHours(value.business_hours),
    professionals_config: normalizeProfessionalsConfig(value.professionals_config),
  };
}

function toApiSettingsPayload(settings: Settings): SettingsPayload {
  return {
    instituicao_nome: settings.instituicao_nome,
    instituicao_email: settings.instituicao_email,
    instituicao_telefone: settings.instituicao_telefone,
    instituicao_endereco: settings.instituicao_endereco,
    instituicao_logo_base64: settings.instituicao_logo_base64 ?? null,
    email_notifications: settings.email_notifications,
    sms_notifications: settings.sms_notifications,
    push_notifications: settings.push_notifications,
    weekly_reports: settings.weekly_reports,
    two_factor_auth: settings.two_factor_auth,
    password_expiry_days: settings.password_expiry_days,
    max_login_attempts: settings.max_login_attempts,
    session_timeout: settings.session_timeout,
    backup_frequency: settings.backup_frequency,
    data_retention_days: settings.data_retention_days,
    auto_updates: settings.auto_updates,
    debug_mode: settings.debug_mode,
    registration_mode: settings.registration_mode,
    public_signup_default_status: settings.public_signup_default_status,
    link_policy: settings.link_policy,
    allow_create_user_from_professional: settings.allow_create_user_from_professional,
    block_duplicate_email: settings.block_duplicate_email,
    allow_public_registration: settings.allow_public_registration,
    allow_professional_view_others: settings.allow_professional_view_others,
    business_hours: settings.business_hours,
    professionals_config: settings.professionals_config,
  };
}

function readCachedSettings(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Partial<Settings>;
  } catch {
    return null;
  }
}

function persistSettingsCache(value: Partial<Settings>) {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(value));
  } catch {
    // cache opcional
  }
}

function extractSettingsFromResponse(
  response: Partial<{ settings: unknown; data: unknown }>
): Partial<Settings> | null {
  const candidate = response.settings ?? response.data;
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as Partial<Settings>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const lastFaviconSignatureRef = useRef<string>("");
  const pendingLoadsRef = useRef(0);

  function startLoading() {
    pendingLoadsRef.current += 1;
    setLoading(true);
  }

  function endLoading() {
    pendingLoadsRef.current = Math.max(0, pendingLoadsRef.current - 1);
    if (pendingLoadsRef.current === 0) {
      setLoading(false);
    }
  }

  useEffect(() => {
    const cached = readCachedSettings();
    if (cached) {
      setSettings(normalizeSettings(cached));
    }

    const token = localStorage.getItem("token");
    if (!token) {
      void fetchPublicSettings();
      return;
    }

    void fetchSettings();
  }, []);

  useEffect(() => {
    if (!userProfile) return;
    void fetchSettings();
  }, [userProfile]);

  useEffect(() => {
    const logo = settings.instituicao_logo_base64?.trim() ?? "";
    const versionKey = settings.instituicao_logo_updated_at?.trim() || undefined;
    const signature = `${logo}::${versionKey ?? ""}`;

    if (lastFaviconSignatureRef.current === signature) {
      return;
    }

    lastFaviconSignatureRef.current = signature;
    void updateFaviconFromLogo(logo || null, versionKey);
  }, [settings.instituicao_logo_base64, settings.instituicao_logo_updated_at]);

  async function fetchSettings() {
    const token = localStorage.getItem("token");
    if (!token) {
      await fetchPublicSettings();
      return;
    }

    startLoading();
    try {
      setError(null);

      const response = await apiService.getSettings();
      const serverSettings = extractSettingsFromResponse(response);

      if (response.success && serverSettings) {
        const normalized = normalizeSettings(serverSettings);
        setSettings(normalized);
        persistSettingsCache(normalized);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar configurações");
    } finally {
      endLoading();
    }
  }

  async function fetchPublicSettings() {
    if (localStorage.getItem("token")) {
      return;
    }

    startLoading();
    try {
      const response = await apiService.getPublicSettings();
      // Evita sobrescrever estado privado caso o usuario tenha autenticado durante a request
      if (localStorage.getItem("token")) {
        return;
      }

      const publicSettingsPatch: Partial<Settings> = {};

      if (response.registration_mode) {
        publicSettingsPatch.registration_mode = response.registration_mode;
      }

      if (typeof response.allow_public_registration === "boolean") {
        publicSettingsPatch.allow_public_registration = response.allow_public_registration;
      }

      if (response.instituicao_nome !== undefined && response.instituicao_nome !== null) {
        const normalizedName = response.instituicao_nome.trim();
        if (normalizedName.length > 0) {
          publicSettingsPatch.instituicao_nome = normalizedName;
        }
      }

      if (response.instituicao_logo_url !== undefined) {
        publicSettingsPatch.instituicao_logo_url = response.instituicao_logo_url;
      }

      if (response.instituicao_logo_base64 !== undefined) {
        publicSettingsPatch.instituicao_logo_base64 = response.instituicao_logo_base64;
      }

      if (Object.keys(publicSettingsPatch).length > 0) {
        setSettings((prev) => {
          const next = normalizeSettings({ ...prev, ...publicSettingsPatch });
          persistSettingsCache(next);
          return next;
        });
      }
    } catch {
      // fallback silencioso: mantem defaults/cache local
    } finally {
      endLoading();
    }
  }
  function updateSettings(newSettings: Partial<Settings>) {
    setSettings((prev) => normalizeSettings({ ...prev, ...newSettings }));
  }

  async function saveSettings(payload?: Partial<Settings>) {
    try {
      setError(null);

      const toSave: Settings = normalizeSettings({
        ...settings,
        ...(payload ?? {}),
      });

      setSettings(toSave);

      const resp = await apiService.saveSettings(toApiSettingsPayload(toSave));
      if (!resp.success) {
        throw new Error(resp?.message || "Erro ao salvar configurações");
      }

      const persistedSettings = extractSettingsFromResponse(resp);
      if (persistedSettings) {
        const normalized = normalizeSettings(persistedSettings);
        setSettings(normalized);
        persistSettingsCache(normalized);
      } else {
        await fetchSettings();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configurações");
      throw err instanceof Error ? err : new Error("Erro ao salvar configurações");
    }
  }

  async function reloadSettings() {
    await fetchSettings();
  }

  return (
    <SettingsContext.Provider
      value={{ settings, updateSettings, saveSettings, reloadSettings, loading, error }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings deve ser usado dentro de um SettingsProvider");
  return ctx;
}


