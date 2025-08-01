import { useState, useEffect } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { FirstAccessForm } from "@/components/auth/FirstAccessForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "./Dashboard";
import { useToast } from "@/hooks/use-toast";
import { apiService, User } from "@/services/api";

const Index = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstAccess, setIsFirstAccess] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const { toast } = useToast();

  // Verificar token e primeiro acesso ao carregar a página
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Verificar se é primeiro acesso
        const firstAccessCheck = await apiService.checkFirstAccess();
        if (firstAccessCheck.firstAccess) {
          setIsFirstAccess(true);
          setIsLoading(false);
          return;
        }

        // Verificar token se não for primeiro acesso
        const { valid, user: userData } = await apiService.verifyToken();
        if (valid && userData) {
          setIsAuthenticated(true);
          setUser(userData);
        }
      } catch (error) {
        console.error('Erro na verificação:', error);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const handleLogin = async (credentials: { username: string; password: string }) => {
    try {
      const response = await apiService.login(credentials.username, credentials.password);
      
      if (response.success && response.user) {
        // Verificar se precisa alterar senha
        const passwordCheck = await apiService.checkNeedsPasswordChange();
        if (passwordCheck.needsChange) {
          setNeedsPasswordChange(true);
          setUser(response.user);
          return;
        }

        setIsAuthenticated(true);
        setUser(response.user);
        
        toast({
          title: "Login realizado com sucesso!",
          description: `Bem-vindo, ${response.user.name}`,
          variant: "default",
        });
      } else {
        // Mensagens específicas baseadas no tipo de erro
        if (response.message?.includes('aprovação') || response.message?.includes('liberado')) {
          toast({
            title: "Acesso Pendente",
            description: response.message,
            variant: "destructive",
            duration: 5000
          });
        } else {
          toast({
            title: "Erro de autenticação",
            description: response.message || "Usuário ou senha incorretos",
            variant: "destructive",
          });
        }
        throw new Error(response.message || "Falha na autenticação");
      }
    } catch (error) {
      // Se o erro não foi tratado acima, lança novamente
      const errorMessage = error instanceof Error ? error.message : "Falha na autenticação";
      if (!errorMessage.includes('aprovação') && !errorMessage.includes('liberado')) {
        toast({
          title: "Erro de autenticação",
          description: "Usuário ou senha incorretos",
          variant: "destructive",
        });
      }
      throw new Error(errorMessage);
    }
  };

  const handleLogout = () => {
    apiService.logout();
    setIsAuthenticated(false);
    setUser(null);
    
    toast({
      title: "Logout realizado",
      description: "Até logo!",
      variant: "default",
    });
  };

  const handleFirstAccessSuccess = () => {
    setIsFirstAccess(false);
    toast({
      title: "Senha definida com sucesso!",
      description: "Agora você pode fazer login",
    });
  };

  const handleRegisterSuccess = () => {
    setShowRegister(false);
    toast({
      title: "Solicitação enviada!",
      description: "Aguarde a aprovação do administrador para acessar o sistema",
      duration: 5000
    });
  };

  const handlePasswordChangeSuccess = () => {
    setNeedsPasswordChange(false);
    setIsAuthenticated(true);
    toast({
      title: "Senha alterada com sucesso!",
      description: "Agora você pode usar o sistema",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isFirstAccess) {
    return <FirstAccessForm onSuccess={handleFirstAccessSuccess} />;
  }

  if (showRegister) {
    return <RegisterForm onSuccess={handleRegisterSuccess} onBackToLogin={() => setShowRegister(false)} />;
  }

  if (needsPasswordChange) {
    return <ChangePasswordForm onSuccess={handlePasswordChangeSuccess} />;
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} onRegister={() => setShowRegister(true)} />;
  }

  return (
    <Layout user={user} onLogout={handleLogout}>
      <Dashboard />
    </Layout>
  );
};

export default Index;
