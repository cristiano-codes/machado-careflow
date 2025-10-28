// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api';

const API_BASE = `http://${window.location.hostname}:3000`;

interface AuthContextType {
  user: any | null;
  userProfile: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, userData: any) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (data: any) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Verificar autenticação no localStorage + bypass em dev
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const userData = JSON.parse(userStr);
        setUser(userData);
        setUserProfile(userData);
        setLoading(false);
        return;
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }

    // 🔓 BYPASS DEV: se está em ambiente de desenvolvimento e não há user salvo,
    // injeta um usuário "Coordenador Geral" para liberar as telas protegidas.
    if (import.meta.env.DEV) {
      const devUser = {
        id: 'd1aa940b-2c48-4d29-bdfa-9b4ec08fe409',
        email: 'admin@admin.com',
        name: 'Administrador',
        role: 'Coordenador Geral',
      };
      setUser(devUser);
      setUserProfile(devUser);
      // opcional: persistir no localStorage para refresh automático
      localStorage.setItem('user', JSON.stringify(devUser));
      localStorage.setItem('token', 'dev-bypass');
      console.log('🧩 BYPASS DEV ativo — usuário Admin local criado automaticamente');
    }

    setLoading(false);
  }, []);

  // Fazer login
  const signIn = async (email: string, password: string) => {
    try {
      const result = await apiService.login(email, password);

      if (result.success && result.user) {
        setUser(result.user);
        setUserProfile(result.user);
        toast({
          title: 'Login realizado com sucesso!',
          description: `Bem-vindo, ${result.user.name}`,
        });
        return {};
      } else {
        return { error: result.message };
      }
    } catch (error) {
      console.error('Erro no login:', error);
      toast({
        title: 'Backend não está rodando',
        description: "Execute 'cd institutoback && npm start' para iniciar o servidor",
        variant: 'destructive',
        duration: 8000,
      });
      return { error: 'Backend não está rodando. Inicie o servidor PostgreSQL e execute "cd institutoback && npm start"' };
    }
  };

  // Fazer cadastro
  const signUp = async (email: string, password: string, userData: any) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          username: userData.username,
          name: userData.name,
          phone: userData.phone,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Cadastro realizado com sucesso!',
          description: 'Sua solicitação foi enviada para aprovação do administrador.',
          duration: 5000,
        });
        return {};
      } else {
        return { error: result.message };
      }
    } catch (error) {
      console.error('Erro no cadastro:', error);
      return { error: 'Erro interno. Tente novamente.' };
    }
  };

  // Fazer logout
  const signOut = async () => {
    try {
      apiService.logout();
      setUser(null);
      setUserProfile(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      toast({
        title: 'Logout realizado',
        description: 'Até logo!',
      });
    } catch (error) {
      console.error('Erro no logout:', error);
      toast({
        title: 'Erro no logout',
        description: 'Ocorreu um erro ao fazer logout',
        variant: 'destructive',
      });
    }
  };

  // Atualizar perfil
  const updateProfile = async (data: any) => {
    try {
      if (!user) return { error: 'Usuário não autenticado' };

      const response = await fetch(`${API_BASE}/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        setUserProfile({ ...userProfile, ...data });
        toast({
          title: 'Perfil atualizado',
          description: 'Suas informações foram atualizadas com sucesso',
        });
        return {};
      } else {
        return { error: result.message };
      }
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      return { error: 'Erro ao atualizar perfil' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        signIn,
        signUp,
        signOut,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
