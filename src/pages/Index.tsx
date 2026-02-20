import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "./Dashboard";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { FirstAccessForm } from "@/components/auth/FirstAccessForm";
import { apiService } from "@/services/api";

const Index = () => {
  const [showRegister, setShowRegister] = useState(false);
  const [showFirstAccess, setShowFirstAccess] = useState(false);
  const [firstAccessUsername, setFirstAccessUsername] = useState<string | undefined>(undefined);
  const { user, userProfile, loading, signIn, signOut, mustChangePassword } = useAuth();
  const { settings } = useSettings();
  const { toast } = useToast();
  const canShowPublicSignup =
    settings.registration_mode === "PUBLIC_SIGNUP" || settings.allow_public_registration;

  useEffect(() => {
    if (!user) {
      apiService
        .checkFirstAccess()
        .then((res) => {
          const isFirst = !!res.firstAccess;
          setShowFirstAccess(isFirst);
          if (isFirst) setFirstAccessUsername(res.username || "admin");
        })
        .catch(() => {
          setShowFirstAccess(false);
          setFirstAccessUsername(undefined);
        });
    }
  }, [user]);

  useEffect(() => {
    if (!canShowPublicSignup && showRegister) {
      setShowRegister(false);
    }
  }, [canShowPublicSignup, showRegister]);

  const handleLogin = async (credentials: { email: string; password: string }) => {
    try {
      const { error } = await signIn(credentials.email, credentials.password);

      if (error) {
        throw new Error(error);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "E-mail ou senha incorretos";
      if (/Primeiro acesso/i.test(msg)) {
        setShowFirstAccess(true);
        setFirstAccessUsername(credentials.email);
      }
      toast({
        title: "Erro de autenticação",
        description: msg,
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

  if (showRegister && canShowPublicSignup) {
    return <RegisterForm onSuccess={handleRegisterSuccess} onBackToLogin={() => setShowRegister(false)} />;
  }

  if (!user) {
    if (showFirstAccess) {
      return (
        <FirstAccessForm
          username={firstAccessUsername}
          onSuccess={() => {
            setShowFirstAccess(false);
            setFirstAccessUsername(undefined);
            toast({ title: "Senha definida!", description: "Faça login com sua nova senha." });
          }}
        />
      );
    }
    return <LoginForm onLogin={handleLogin} onRegister={() => setShowRegister(true)} />;
  }

  if (mustChangePassword) {
    return <Navigate to="/trocar-senha-obrigatoria" replace />;
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
