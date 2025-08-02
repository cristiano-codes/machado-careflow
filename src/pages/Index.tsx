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

  const handleLogin = async (credentials: { email: string; password: string }) => {
    try {
      const { error } = await signIn(credentials.email, credentials.password);
      
      if (error) {
        throw new Error(error);
      }
    } catch (error) {
      toast({
        title: "Erro de autenticação",
        description: error instanceof Error ? error.message : "E-mail ou senha incorretos",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleRegisterSuccess = () => {
    setShowRegister(false);
    toast({
      title: "Cadastro realizado!",
      description: "Verifique seu email para confirmar a conta, ou entre em contato com o administrador.",
      duration: 5000
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (showRegister) {
    return <RegisterForm onSuccess={handleRegisterSuccess} onBackToLogin={() => setShowRegister(false)} />;
  }

  if (!user) {
    return <LoginForm onLogin={handleLogin} onRegister={() => setShowRegister(true)} />;
  }

  const layoutUser = userProfile ? {
    name: userProfile.name || userProfile.username || userProfile.email,
    email: userProfile.email,
    role: userProfile.role,
    avatar: userProfile.avatar_url
  } : undefined;

  return (
    <Layout user={layoutUser} onLogout={() => {}}>
      <Dashboard />
    </Layout>
  );
};

export default Index;