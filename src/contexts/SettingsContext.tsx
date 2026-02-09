// src/contexts/SettingsContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { apiService, type SettingsPayload } from "@/services/api";

export interface Settings {
  instituicao_nome: string;
  instituicao_email: string;
  instituicao_telefone: string;
  instituicao_endereco: string;
  instituicao_logo_url?: string | null;
  instituicao_logo_base64?: string | null;
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
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  /**
   * Salva as configurações no backend.
   * Se payload for passado, ele será mesclado sobre o estado atual e enviado.
   * Se não for passado, envia o estado atual.
   */
  saveSettings: (payload?: Partial<Settings>) => Promise<void>;
  reloadSettings: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const defaultSettings: Settings = {
  instituicao_nome: "Instituto Lauir Machado",
  instituicao_email: "contato@institutolauir.com.br",
  instituicao_telefone: "(11) 3456-7890",
  instituicao_endereco: "Rua das Flores, 123 - São Paulo, SP",
  instituicao_logo_url: null,
  instituicao_logo_base64: null,
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
};

const SETTINGS_CACHE_KEY = "settings_cache";

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
    // cache é opcional; erro não deve bloquear a app
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
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      setError(null);

      const cached = readCachedSettings();
      if (cached) {
        setSettings((prev) => ({ ...prev, ...cached }));
      }

      const response = await apiService.getSettings();
      const serverSettings = extractSettingsFromResponse(response);
      if (response.success && serverSettings) {
        setSettings((prev) => ({ ...prev, ...serverSettings }));
        persistSettingsCache(serverSettings);
      }
    } catch (err: any) {
      console.error("Erro ao carregar configurações:", err);
      setError(err?.message ?? "Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  }

  function updateSettings(newSettings: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }

  async function saveSettings(payload?: Partial<Settings>) {
    try {
      setError(null);

      // Se vier payload (ex.: tempSettings da tela), usamos ele para salvar,
      // evitando a race condition com o setState.
      const toSave: Settings = {
        ...settings,
        ...(payload ?? {}),
      };

      // Atualiza o estado local para refletir o que está sendo salvo (opcional, bom para UX)
      setSettings(toSave);

      const resp = await apiService.saveSettings(toApiSettingsPayload(toSave));
      if (!resp.success) {
        throw new Error(resp?.message || "Erro ao salvar configurações");
      }

      // Garante que o estado final = o que o banco salvou (evita “atraso”)
      const persistedSettings = extractSettingsFromResponse(resp);
      if (persistedSettings) {
        setSettings((prev) => ({ ...prev, ...persistedSettings }));
        persistSettingsCache(persistedSettings);
      } else {
        await fetchSettings();
      }
    } catch (err: any) {
      console.error("Erro ao salvar configurações:", err);
      setError(err?.message ?? "Erro ao salvar configurações");
      throw err;
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
