
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { ProtectedRoute as PermissionProtectedRoute } from "@/components/common/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import {
  AGENDA_READ_REQUIRED_SCOPES,
  LEGACY_AGENDA_ROUTE_REQUIRED_SCOPES,
  OFFICIAL_AGENDA_ROUTE_REQUIRED_SCOPES,
  UNIT_OPERATIONS_ACTIVITIES_REQUIRED_SCOPES,
  UNIT_OPERATIONS_AGENDA_REQUIRED_SCOPES,
  UNIT_OPERATIONS_CLASSES_REQUIRED_SCOPES,
  UNIT_OPERATIONS_ENROLLMENTS_REQUIRED_SCOPES,
  UNIT_OPERATIONS_GRADE_REQUIRED_SCOPES,
  UNIT_OPERATIONS_LANDING_PRIORITY,
  UNIT_OPERATIONS_REQUIRED_SCOPES,
  UNIT_OPERATIONS_ROOMS_REQUIRED_SCOPES,
} from "@/permissions/permissionMap";
import Index from "./pages/Index";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import FilaDeEspera from "./pages/FilaDeEspera";
import ConsultarSolicitacao from "./pages/ConsultarSolicitacao";
import AgendaLegado from "./pages/Agenda";
import AgendaOficial from "./pages/AgendaOficial";
import AgendaTeste from "./pages/AgendaTeste";
import SalasTeste from "./pages/SalasTeste";
import AtividadesTeste from "./pages/AtividadesTeste";
import TurmasTeste from "./pages/TurmasTeste";
import GradeTeste from "./pages/GradeTeste";
import MatriculasTeste from "./pages/MatriculasTeste";
import PreCadastro from "./pages/PreCadastro";
import Entrevistas from "./pages/Entrevistas";
import Avaliacoes from "./pages/Avaliacoes";
import AnaliseVagas from "./pages/AnaliseVagas";
import TriagemSocial from "./pages/TriagemSocial";
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

const UnitOperationsLandingRoute = () => {
  const { hasAnyScope } = usePermissions();
  const nextPath =
    UNIT_OPERATIONS_LANDING_PRIORITY.find((entry) =>
      hasAnyScope(entry.requiredAnyScopes)
    )?.path || "/";

  return <Navigate to={nextPath} replace />;
};

const UnitOperationsAgendaAliasRoute = () => {
  const location = useLocation();
  return (
    <Navigate
      to={{
        pathname: "/agenda",
        search: location.search,
        hash: location.hash,
      }}
      replace
    />
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
        <Route
          path="/fila-de-espera"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={["fila_espera:view", "pre_agendamento:view"]}
              >
                <FilaDeEspera />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route path="/pre-agendamento" element={<Navigate to="/fila-de-espera" replace />} />
        <Route
          path="/triagem-social"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute module="triagem_social" permission="view">
                <TriagemSocial />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
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
                requiredAnyScopes={OFFICIAL_AGENDA_ROUTE_REQUIRED_SCOPES}
              >
                <AgendaOficial />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agenda-legado"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={LEGACY_AGENDA_ROUTE_REQUIRED_SCOPES}
              >
                <AgendaLegado />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agenda-teste"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={AGENDA_READ_REQUIRED_SCOPES}
              >
                <AgendaTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/salas-teste"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={AGENDA_READ_REQUIRED_SCOPES}
              >
                <SalasTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/atividades-teste"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={AGENDA_READ_REQUIRED_SCOPES}
              >
                <AtividadesTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/turmas-teste"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={AGENDA_READ_REQUIRED_SCOPES}
              >
                <TurmasTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/grade-teste"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={AGENDA_READ_REQUIRED_SCOPES}
              >
                <GradeTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/alocacoes-teste"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={AGENDA_READ_REQUIRED_SCOPES}
              >
                <GradeTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/matriculas-teste"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={AGENDA_READ_REQUIRED_SCOPES}
              >
                <MatriculasTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/operacao-unidade"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={UNIT_OPERATIONS_REQUIRED_SCOPES}
              >
                <UnitOperationsLandingRoute />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/operacao-unidade/agenda"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={UNIT_OPERATIONS_AGENDA_REQUIRED_SCOPES}
              >
                <UnitOperationsAgendaAliasRoute />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/operacao-unidade/salas"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={UNIT_OPERATIONS_ROOMS_REQUIRED_SCOPES}
              >
                <SalasTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/operacao-unidade/atividades"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={UNIT_OPERATIONS_ACTIVITIES_REQUIRED_SCOPES}
              >
                <AtividadesTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/operacao-unidade/turmas"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={UNIT_OPERATIONS_CLASSES_REQUIRED_SCOPES}
              >
                <TurmasTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/operacao-unidade/grade"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={UNIT_OPERATIONS_GRADE_REQUIRED_SCOPES}
              >
                <GradeTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/operacao-unidade/matriculas"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute
                requiredAnyScopes={UNIT_OPERATIONS_ENROLLMENTS_REQUIRED_SCOPES}
              >
                <MatriculasTeste />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pre-cadastro"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute module="pre_cadastro" permission="view">
                <PreCadastro />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/entrevistas"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute module="entrevistas" permission="view">
                <Entrevistas />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/avaliacoes"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute module="avaliacoes" permission="view">
                <Avaliacoes />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/analise-vagas"
          element={
            <ProtectedRoute>
              <PermissionProtectedRoute module="analise_vagas" permission="view">
                <AnaliseVagas />
              </PermissionProtectedRoute>
            </ProtectedRoute>
          }
        />
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
