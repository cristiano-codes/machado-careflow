
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { ProtectedRoute as PermissionProtectedRoute } from "@/components/common/ProtectedRoute";
import Index from "./pages/Index";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import PreAgendamento from "./pages/PreAgendamento";
import ConsultarSolicitacao from "./pages/ConsultarSolicitacao";
import Agenda from "./pages/Agenda";
import PreCadastro from "./pages/PreCadastro";
import Entrevistas from "./pages/Entrevistas";
import Avaliacoes from "./pages/Avaliacoes";
import AnaliseVagas from "./pages/AnaliseVagas";
import Configuracoes from "./pages/Configuracoes";
import GerenciarUsuarios from "./pages/GerenciarUsuarios";
import PermissionManager from "./pages/PermissionManager";
import Profissionais from "./pages/Profissionais";
import NovoProfissional from "./pages/NovoProfissional";
import TrocarSenhaObrigatoria from "./pages/TrocarSenhaObrigatoria";

const queryClient = new QueryClient();

// Componente para rotas protegidas que precisam do Layout
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { userProfile, loading, signOut, mustChangePassword } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!userProfile) {
    return <Navigate to="/" replace />;
  }

  if (mustChangePassword && location.pathname !== "/trocar-senha-obrigatoria") {
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
      {children}
    </Layout>
  );
};

const AppContent = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/dashboard" element={<Index />} />
        <Route path="/trocar-senha-obrigatoria" element={<TrocarSenhaObrigatoria />} />
        <Route path="/perfil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/pre-agendamento" element={<ProtectedRoute><PreAgendamento /></ProtectedRoute>} />
        <Route
          path="/consultar-solicitacao"
          element={
            <ProtectedRoute>
              <ConsultarSolicitacao />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agenda"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={["agenda:view", "profissionais:view"]}
              >
                <Agenda />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route path="/pre-cadastro" element={<ProtectedRoute><PreCadastro /></ProtectedRoute>} />
        <Route path="/entrevistas" element={<ProtectedRoute><Entrevistas /></ProtectedRoute>} />
        <Route path="/avaliacoes" element={<ProtectedRoute><Avaliacoes /></ProtectedRoute>} />
        <Route path="/analise-vagas" element={<ProtectedRoute><AnaliseVagas /></ProtectedRoute>} />
        <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
        <Route path="/gerenciar-usuarios" element={<ProtectedRoute><GerenciarUsuarios /></ProtectedRoute>} />
        <Route path="/gerenciar-permissoes" element={<ProtectedRoute><PermissionManager /></ProtectedRoute>} />
        <Route
          path="/profissionais"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute module="profissionais" permission="view">
                <Profissionais />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profissionais/novo"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute module="profissionais" permission="view">
                <NovoProfissional />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
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
