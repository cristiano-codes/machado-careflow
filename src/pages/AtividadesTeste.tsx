import { AgendaLabProvider } from "@/features/agendaLab/context/AgendaLabContext";
import { ActivitiesLabPage } from "@/features/agendaLab/pages/ActivitiesLabPage";

export default function AtividadesTeste() {
  return (
    <AgendaLabProvider>
      <ActivitiesLabPage />
    </AgendaLabProvider>
  );
}
