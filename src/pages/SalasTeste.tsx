import { AgendaLabProvider } from "@/features/agendaLab/context/AgendaLabContext";
import { RoomsLabPage } from "@/features/agendaLab/pages/RoomsLabPage";

export default function SalasTeste() {
  return (
    <AgendaLabProvider>
      <RoomsLabPage />
    </AgendaLabProvider>
  );
}
