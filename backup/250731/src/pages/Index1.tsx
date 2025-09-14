import { useState, useEffect } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "./Dashboard";
import { useToast } from "@/hooks/use-toast";
import { apiService, User } from "@/services/api";

const Index = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Verificar token ao carregar a página
  useEffect(() => {
    const checkAuth = async () => {
      const { valid, user: userData } = await apiService.verifyToken();
      if (valid && userData) {
        setIsAuthenticated(true);
        setUser(userData);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const handleLogin = async (credentials: { username: string; password: string }) => {
    try {
      const response = await apiService.login(credentials.username, credentials.password);
      
      if (response.success && response.user) {
        setIsAuthenticated(true);
        setUser(response.user);
        
        toast({
          title: "Login realizado com sucesso!",
          description: `Bem-vindo, ${response.user.name}`,
          variant: "default",
        });
      } else {
        throw new Error(response.message || "Falha na autenticação");
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Falha na autenticação");
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <Layout user={user} onLogout={handleLogout}>
      <Dashboard />
    </Layout>
  );
};

export default Index;