import { AgendaLabProvider } from "@/features/agendaLab/context/AgendaLabContext";
import { AllocationsLabPage } from "@/features/agendaLab/pages/AllocationsLabPage";

export default function GradeTeste() {
  return (
    <AgendaLabProvider>
      <AllocationsLabPage />
    </AgendaLabProvider>
  );
}
