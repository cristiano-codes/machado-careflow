import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SettingsProvider } from "@/contexts/SettingsContext";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SettingsProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/dashboard" element={<Index />} />
            <Route path="/pre-agendamento" element={<PreAgendamento />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/pre-cadastro" element={<PreCadastro />} />
            <Route path="/entrevistas" element={<Entrevistas />} />
            <Route path="/avaliacoes" element={<Avaliacoes />} />
            <Route path="/analise-vagas" element={<AnaliseVagas />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/gerenciar-usuarios" element={<GerenciarUsuarios />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
