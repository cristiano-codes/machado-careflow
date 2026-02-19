import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiService, API_BASE_URL, User } from "@/services/api";

type AuthUser = User & {
  avatar_url?: string | null;
  permissions?: string[];
};

type SignUpUserData = {
  username: string;
  name: string;
  phone: string;
};

interface AuthContextType {
  user: AuthUser | null;
  userProfile: AuthUser | null;
  loading: boolean;
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    userData: SignUpUserData
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Record<string, unknown>) => Promise<{ error?: string }>;
  markPasswordChangeCompleted: () => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function persistUser(user: AuthUser | null) {
  if (!user) {
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");
    return;
  }

  const serialized = JSON.stringify(user);
  localStorage.setItem("user", serialized);
  sessionStorage.setItem("user", serialized);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");

    if (token && userStr) {
      try {
        const parsedUser = JSON.parse(userStr) as AuthUser;
        setUser(parsedUser);
        setUserProfile(parsedUser);
      } catch {
        localStorage.removeItem("token");
        persistUser(null);
      }
    }

    setLoading(false);
  }, []);

  const mustChangePassword = useMemo(
    () => Boolean(userProfile?.must_change_password),
    [userProfile]
  );

  const refreshSession = async () => {
    const verification = await apiService.verifyToken();
    if (!verification.valid || !verification.user) {
      setUser(null);
      setUserProfile(null);
      persistUser(null);
      return;
    }

    const nextUser = verification.user as AuthUser;
    setUser(nextUser);
    setUserProfile(nextUser);
    persistUser(nextUser);
  };

  const signIn = async (email: string, password: string) => {
    try {
      const result = await apiService.login(email, password);

      if (result.success && result.user) {
        const nextUser = result.user as AuthUser;
        setUser(nextUser);
        setUserProfile(nextUser);
        persistUser(nextUser);
        toast({
          title: "Login realizado com sucesso!",
          description: `Bem-vindo, ${nextUser.name}`,
        });
        return {};
      }

      return { error: result.message || "Falha de autenticacao" };
    } catch (error) {
      console.error("Erro no login:", error);
      toast({
        title: "Falha no login",
        description: "Nao foi possivel autenticar no servidor.",
        variant: "destructive",
      });
      return { error: "Erro de conexao com o servidor." };
    }
  };

  const signUp = async (email: string, password: string, userData: SignUpUserData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          confirmPassword: password,
          username: userData.username,
          name: userData.name,
          phone: userData.phone,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        toast({
          title: "Cadastro realizado com sucesso!",
          description: "Sua solicitacao foi enviada para aprovacao do administrador.",
          duration: 5000,
        });
        return {};
      }

      return { error: result?.message || "Falha ao cadastrar usuario" };
    } catch (error) {
      console.error("Erro no cadastro:", error);
      return { error: "Erro interno. Tente novamente." };
    }
  };

  const signOut = async () => {
    try {
      apiService.logout();
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      setUser(null);
      setUserProfile(null);
      persistUser(null);
      toast({
        title: "Logout realizado",
        description: "Ate logo!",
      });
    } catch (error) {
      console.error("Erro no logout:", error);
      toast({
        title: "Erro no logout",
        description: "Ocorreu um erro ao fazer logout",
        variant: "destructive",
      });
    }
  };

  const updateProfile = async (data: Record<string, unknown>) => {
    try {
      if (!user) return { error: "Usuario nao autenticado" };

      const response = await fetch(`${API_BASE_URL}/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(data),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { error: result?.message || "Erro ao atualizar perfil" };
      }

      const nextUser = { ...(userProfile || {}), ...data } as AuthUser;
      setUser(nextUser);
      setUserProfile(nextUser);
      persistUser(nextUser);
      toast({
        title: "Perfil atualizado",
        description: "Suas informacoes foram atualizadas com sucesso",
      });
      return {};
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      return { error: "Erro ao atualizar perfil" };
    }
  };

  const markPasswordChangeCompleted = () => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, must_change_password: false };
      persistUser(next);
      return next;
    });

    setUserProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, must_change_password: false };
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        mustChangePassword,
        signIn,
        signUp,
        signOut,
        updateProfile,
        markPasswordChangeCompleted,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
