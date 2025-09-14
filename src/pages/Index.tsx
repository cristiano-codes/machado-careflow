import { useState, useEffect } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "./Dashboard";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { FirstAccessForm } from "@/components/auth/FirstAccessForm";
import { apiService } from "@/services/api";

const Index = () => {
  const [showRegister, setShowRegister] = useState(false);
  const [showFirstAccess, setShowFirstAccess] = useState(false);
  const { user, userProfile, loading, signIn, signUp, signOut } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      apiService.checkFirstAccess().then(res => setShowFirstAccess(!!res.firstAccess)).catch(() => setShowFirstAccess(false));
    }
  }, [user]);

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
    if (showFirstAccess) {
      return (
        <FirstAccessForm
          onSuccess={() => {
            setShowFirstAccess(false);
            toast({ title: "Senha definida!", description: "Faça login com sua nova senha." });
          }}
        />
      );
    }
    return <LoginForm onLogin={handleLogin} onRegister={() => setShowRegister(true)} />;
  }

  const layoutUser = userProfile ? {
    name: userProfile.name || userProfile.username || userProfile.email,
    email: userProfile.email,
    role: userProfile.role,
    avatar: userProfile.avatar_url
  } : undefined;

  return (
    <Layout user={layoutUser} onLogout={signOut}>
      <Dashboard />
    </Layout>
  );
};

export default Index;