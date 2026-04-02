import { AgendaLabProvider } from "@/features/agendaLab/context/AgendaLabContext";
import { AgendaLabDashboardPage } from "@/features/agendaLab/pages/AgendaLabDashboardPage";
import { Navigate, useLocation } from "react-router-dom";

export default function AgendaOficial() {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const requiresLegacyAgenda =
    query.has("patient_id") ||
    query.has("appointment_id") ||
    query.get("entry") === "triagem_social";

  if (requiresLegacyAgenda) {
    return (
      <Navigate
        to={{
          pathname: "/agenda-legado",
          search: location.search,
          hash: location.hash,
        }}
        replace
      />
    );
  }

  return (
    <AgendaLabProvider>
      <AgendaLabDashboardPage />
    </AgendaLabProvider>
  );
}
