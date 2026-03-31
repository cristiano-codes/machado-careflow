import { AgendaLabProvider } from "@/features/agendaLab/context/AgendaLabContext";
import { EnrollmentsLabPage } from "@/features/agendaLab/pages/EnrollmentsLabPage";

export default function MatriculasTeste() {
  return (
    <AgendaLabProvider>
      <EnrollmentsLabPage />
    </AgendaLabProvider>
  );
}
