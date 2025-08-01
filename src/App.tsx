import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Layout } from "@/components/layout/Layout";
import Index from "./pages/Index";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import PreAgendamento from "./pages/PreAgendamento";
import Agenda from "./pages/Agenda";
import PreCadastro from "./pages/PreCadastro";
import Entrevistas from "./pages/Entrevistas";
import Avaliacoes from "./pages/Avaliacoes";
import AnaliseVagas from "./pages/AnaliseVagas";
import Configuracoes from "./pages/Configuracoes";
import GerenciarUsuarios from "./pages/GerenciarUsuarios";
import PermissionManager from "./pages/PermissionManager";
import { useAuth } from "@/contexts/AuthContext";

const queryClient = new QueryClient();

const AppContent = () => {
  const { userProfile, signOut } = useAuth();

  const layoutUser = userProfile ? {
    name: userProfile.name || userProfile.username || userProfile.email,
    email: userProfile.email,
    role: userProfile.role,
    avatar: userProfile.avatar_url
  } : undefined;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/dashboard" element={<Index />} />
        <Route path="/perfil" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <Profile />
          </Layout>
        } />
        <Route path="/pre-agendamento" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <PreAgendamento />
          </Layout>
        } />
        <Route path="/agenda" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <Agenda />
          </Layout>
        } />
        <Route path="/pre-cadastro" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <PreCadastro />
          </Layout>
        } />
        <Route path="/entrevistas" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <Entrevistas />
          </Layout>
        } />
        <Route path="/avaliacoes" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <Avaliacoes />
          </Layout>
        } />
        <Route path="/analise-vagas" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <AnaliseVagas />
          </Layout>
        } />
        <Route path="/configuracoes" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <Configuracoes />
          </Layout>
        } />
        <Route path="/gerenciar-usuarios" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <GerenciarUsuarios />
          </Layout>
        } />
        <Route path="/gerenciar-permissoes" element={
          <Layout user={layoutUser} onLogout={signOut}>
            <PermissionManager />
          </Layout>
        } />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <SettingsProvider>
          <Toaster />
          <Sonner />
          <AppContent />
        </SettingsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
