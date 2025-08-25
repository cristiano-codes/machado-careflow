import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Settings {
  instituicao_nome: string;
  instituicao_email: string;
  instituicao_telefone: string;
  instituicao_endereco: string;
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
  saveSettings: () => void;
}

const defaultSettings: Settings = {
  instituicao_nome: "Instituto Lauir Machado",
  instituicao_email: "contato@institutolauir.com.br",
  instituicao_telefone: "(11) 3456-7890",
  instituicao_endereco: "Rua das Flores, 123 - São Paulo, SP",
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
  debug_mode: false
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Carregar configurações do banco de dados ao inicializar
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Erro ao carregar configurações:', error);
        return;
      }

      if (data) {
        setSettings(prevSettings => ({
          ...prevSettings,
          instituicao_nome: data.instituicao_nome,
          instituicao_email: data.instituicao_email,
          instituicao_telefone: data.instituicao_telefone,
          instituicao_endereco: data.instituicao_endereco,
          email_notifications: data.email_notifications,
          sms_notifications: data.sms_notifications,
          push_notifications: data.push_notifications,
          weekly_reports: data.weekly_reports,
          two_factor_auth: data.two_factor_auth,
          password_expiry_days: data.password_expiry_days,
          max_login_attempts: data.max_login_attempts,
          session_timeout: data.session_timeout,
          backup_frequency: data.backup_frequency,
          data_retention_days: data.data_retention_days,
          auto_updates: data.auto_updates,
          debug_mode: data.debug_mode
        }));
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  };

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const saveSettings = async () => {
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          instituicao_nome: settings.instituicao_nome,
          instituicao_email: settings.instituicao_email,
          instituicao_telefone: settings.instituicao_telefone,
          instituicao_endereco: settings.instituicao_endereco,
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
          debug_mode: settings.debug_mode
        });

      if (error) {
        console.error('Erro ao salvar configurações:', error);
        throw error;
      }
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      throw error;
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings deve ser usado dentro de um SettingsProvider');
  }
  return context;
}