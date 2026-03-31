import { AgendaLabProvider } from "@/features/agendaLab/context/AgendaLabContext";
import { AgendaLabDashboardPage } from "@/features/agendaLab/pages/AgendaLabDashboardPage";

export default function AgendaTeste() {
  return (
    <AgendaLabProvider>
      <AgendaLabDashboardPage />
    </AgendaLabProvider>
  );
}
