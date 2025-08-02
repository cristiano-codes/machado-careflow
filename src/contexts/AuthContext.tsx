import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  userProfile: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, userData: any) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (data: any) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Carregar perfil do usuário
  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setUserProfile(data);
      return data;
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
      return null;
    }
  };

  // Nova função para buscar usuário por email
  const loadUserProfileByEmail = async (email: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erro ao carregar perfil por email:', error);
      return null;
    }
  };

  // Configurar listener de autenticação
  useEffect(() => {
    // Verificar se há admin no localStorage primeiro
    const adminProfile = localStorage.getItem('admin_profile');
    if (adminProfile) {
      try {
        const admin = JSON.parse(adminProfile);
        if (admin.email === 'admin@lovable.ia') {
          const fakeUser = {
            id: admin.id,
            email: admin.email,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            aud: 'authenticated',
            role: 'authenticated'
          };
          setUser(fakeUser as any);
          setUserProfile(admin);
          setLoading(false);
          return;
        }
      } catch (error) {
        localStorage.removeItem('admin_profile');
      }
    }

    // Verificar sessão atual do Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      }
      setLoading(false);
    });

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await loadUserProfile(session.user.id);
        } else {
          setUserProfile(null);
        }
        
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Fazer login
  const signIn = async (email: string, password: string) => {
    try {
      // Para o admin nativo, aceitar login direto sem validação de banco
      if (email === 'admin@lovable.ia' && password === 'admin') {
        // Buscar o usuário admin na base
        const { data: adminUser, error } = await supabase
          .from('users')
          .select('*')
          .eq('username', 'admin')
          .maybeSingle();
        
        if (adminUser) {
          // Simular login bem-sucedido para o admin nativo
          const fakeUser = {
            id: adminUser.id,
            email: adminUser.email,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            aud: 'authenticated',
            role: 'authenticated'
          };
          
          setUser(fakeUser as any);
          setUserProfile(adminUser);
          
          // Salvar perfil do admin no localStorage para o hook de permissões
          localStorage.setItem('admin_profile', JSON.stringify(adminUser));
          
          toast({
            title: "Login realizado com sucesso!",
            description: `Bem-vindo, ${adminUser.name}`,
          });
          
          return {};
        }
      }

      // Para outros usuários, verificar se existe na tabela users
      const existingUser = await loadUserProfileByEmail(email);
      
      if (!existingUser) {
        return { error: 'Usuário não encontrado no sistema.' };
      }

      if (existingUser.status !== 'ativo') {
        return { 
          error: 'Seu acesso ainda não foi liberado pelo administrador. Aguarde aprovação.' 
        };
      }

      // Tentar login normal com Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        const profile = await loadUserProfile(data.user.id);
        
        // Verificar status do usuário
        if (profile && profile.status !== 'ativo') {
          await supabase.auth.signOut();
          return { 
            error: 'Seu acesso ainda não foi liberado pelo administrador. Aguarde aprovação.' 
          };
        }

        toast({
          title: "Login realizado com sucesso!",
          description: `Bem-vindo, ${profile?.name || data.user.email}`,
        });
      }

      return {};
    } catch (error) {
      console.error('Erro no login:', error);
      return { error: 'Erro interno. Tente novamente.' };
    }
  };

  // Fazer cadastro
  const signUp = async (email: string, password: string, userData: any) => {
    try {
      // Primeiro, criar usuário na tabela users
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          email,
          username: userData.username,
          name: userData.name,
          phone: userData.phone,
          role: 'Usuário',
          status: 'pendente'
        });

      if (insertError) {
        if (insertError.code === '23505') {
          return { error: 'Usuário ou email já existe' };
        }
        throw insertError;
      }

      toast({
        title: "Cadastro realizado com sucesso!",
        description: "Sua solicitação foi enviada para aprovação do administrador.",
        duration: 5000
      });

      return {};
    } catch (error) {
      console.error('Erro no cadastro:', error);
      return { error: 'Erro interno. Tente novamente.' };
    }
  };

  // Fazer logout
  const signOut = async () => {
    try {
      // Se for admin nativo, apenas limpar estados locais
      if (userProfile?.email === 'admin@lovable.ia') {
        setUser(null);
        setUserProfile(null);
        localStorage.removeItem('admin_profile');
      } else {
        await supabase.auth.signOut();
        setUserProfile(null);
      }
      
      toast({
        title: "Logout realizado",
        description: "Até logo!",
      });
    } catch (error) {
      console.error('Erro no logout:', error);
    }
  };

  // Atualizar perfil
  const updateProfile = async (data: any) => {
    try {
      if (!user) return { error: 'Usuário não autenticado' };

      const { error } = await supabase
        .from('users')
        .update(data)
        .eq('id', user.id);

      if (error) throw error;

      await loadUserProfile(user.id);
      
      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram atualizadas com sucesso",
      });

      return {};
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      return { error: 'Erro ao atualizar perfil' };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      loading,
      signIn,
      signUp,
      signOut,
      updateProfile
    }}>
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