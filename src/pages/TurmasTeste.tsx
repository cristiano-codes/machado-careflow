import { AgendaLabProvider } from "@/features/agendaLab/context/AgendaLabContext";
import { ClassesLabPage } from "@/features/agendaLab/pages/ClassesLabPage";

export default function TurmasTeste() {
  return (
    <AgendaLabProvider>
      <ClassesLabPage />
    </AgendaLabProvider>
  );
}
