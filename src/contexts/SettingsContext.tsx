import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '@/services/api';

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
      const response = await fetch('http://localhost:3000/api/settings');
      const data = await response.json();

      if (data && data.success) {
        setSettings(prevSettings => ({
          ...prevSettings,
          ...data.settings
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
      const response = await fetch('http://localhost:3000/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Erro ao salvar configurações');
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