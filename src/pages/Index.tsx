import { useState, useEffect } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "./Dashboard";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const [showRegister, setShowRegister] = useState(false);
  const { user, userProfile, loading, signIn, signUp } = useAuth();
  const { toast } = useToast();

  const handleLogin = async (credentials: { username: string; password: string }) => {
    try {
      // Para compatibilidade, vamos tentar fazer login com email ou username
      let email = credentials.username;
      
      // Se não parece ser um email, vamos buscar o email pelo username no banco
      if (!email.includes('@')) {
        // Para o admin, vamos usar o email padrão
        if (credentials.username === 'admin') {
          email = 'admin@instituto.com.br';
        } else {
          throw new Error('Por favor, use seu email para fazer login');
        }
      }

      const result = await signIn(email, credentials.password);
      
      if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Falha na autenticação";
      toast({
        title: "Erro de autenticação",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleRegister = async (userData: any) => {
    try {
      const result = await signUp(userData.email, userData.password, userData);
      
      if (result.error) {
        throw new Error(result.error);
      }

      setShowRegister(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro no cadastro";
      toast({
        title: "Erro no cadastro",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (showRegister) {
    return <RegisterForm onSuccess={() => setShowRegister(false)} onBackToLogin={() => setShowRegister(false)} />;
  }

  if (!user || !userProfile) {
    return <LoginForm onLogin={handleLogin} onRegister={() => setShowRegister(true)} />;
  }

  const layoutUser = {
    name: userProfile.name || userProfile.username || userProfile.email,
    email: userProfile.email,
    role: userProfile.role,
    avatar: userProfile.avatar_url
  };

  return (
    <Layout user={layoutUser} onLogout={() => {}}>
      <Dashboard />
    </Layout>
  );
};

export default Index;
