import { useMemo, useState } from "react";
import { Building, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AgendaLabHeader } from "@/features/agendaLab/components/AgendaLabHeader";
import { useAgendaLab } from "@/features/agendaLab/context/AgendaLabContext";
import type { Room, RoomStatus, RoomType } from "@/features/agendaLab/types";
import { makeLabId } from "@/features/agendaLab/utils/id";
import { getRoomStatusLabel, statusToBadgeVariant } from "@/features/agendaLab/utils/presentation";

type RoomDraft = Omit<Room, "id">;

const ROOM_TYPES: RoomType[] = ["terapia", "multifuncional", "pedagogica", "sensorial", "movimento", "apoio"];
const ROOM_STATUS: RoomStatus[] = ["ativa", "manutencao", "inativa"];

function createDraft(unitId: string): RoomDraft {
  return {
    unitId,
    codigo: "",
    nome: "",
    nomeConhecido: "",
    descricao: "",
    tipo: "multifuncional",
    capacidadeTotal: 10,
    capacidadeRecomendada: 8,
    localizacaoInterna: "",
    especialidadePrincipal: "",
    usoPreferencial: "",
    permiteUsoCompartilhado: true,
    status: "ativa",
    acessibilidade: "",
    equipamentos: [],
    observacoes: "",
  };
}

export function RoomsLabPage() {
  const { toast } = useToast();
  const { units, rooms, upsertRoom } = useAgendaLab();
  const [unitFilter, setUnitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<RoomStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [draft, setDraft] = useState<RoomDraft>(() => createDraft(units[0]?.id || ""));
  const [equipmentText, setEquipmentText] = useState("");

  const filtered = useMemo(
    () =>
      rooms.filter((room) => {
        if (unitFilter !== "all" && room.unitId !== unitFilter) return false;
        if (statusFilter !== "all" && room.status !== statusFilter) return false;
        const text = `${room.codigo} ${room.nome} ${room.nomeConhecido} ${room.tipo} ${room.usoPreferencial}`.toLowerCase();
        return text.includes(search.trim().toLowerCase());
      }),
    [rooms, search, statusFilter, unitFilter]
  );

  const indicators = useMemo(
    () => ({
      total: rooms.length,
      active: rooms.filter((room) => room.status === "ativa").length,
      shared: rooms.filter((room) => room.permiteUsoCompartilhado).length,
    }),
    [rooms]
  );

  function openCreate() {
    setEditing(null);
    setDraft(createDraft(units[0]?.id || ""));
    setEquipmentText("");
    setOpen(true);
  }

  function openEdit(room: Room) {
    setEditing(room);
    setDraft({ ...room });
    setEquipmentText(room.equipamentos.join(", "));
    setOpen(true);
  }

  function handleSave() {
    if (!draft.unitId || !draft.codigo.trim() || !draft.nome.trim()) {
      toast({ title: "Sala", description: "Unidade, codigo e nome sao obrigatorios.", variant: "destructive" });
      return;
    }
    if (draft.capacidadeRecomendada > draft.capacidadeTotal) {
      toast({
        title: "Sala",
        description: "Capacidade recomendada nao pode ser maior que a capacidade total.",
        variant: "destructive",
      });
      return;
    }
    const payload: Room = {
      id: editing?.id || makeLabId("room"),
      ...draft,
      equipamentos: equipmentText.split(",").map((item) => item.trim()).filter(Boolean),
    };
    upsertRoom(payload);
    setOpen(false);
    toast({ title: "Sala", description: editing ? "Sala atualizada." : "Sala criada no laboratorio." });
  }

  return (
    <div className="space-y-4">
      <AgendaLabHeader
        title="Salas Teste"
        subtitle="Cadastro laboratorio de salas fisicas da unidade."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova sala
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-semibold">{indicators.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ativas</p><p className="text-2xl font-semibold">{indicators.active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Uso compartilhado</p><p className="text-2xl font-semibold">{indicators.shared}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Unidade</Label>
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RoomStatus | "all")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{ROOM_STATUS.map((status) => <SelectItem key={status} value={status}>{getRoomStatusLabel(status)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Busca</Label>
            <div className="relative"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Codigo, nome, tipo, uso" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Building className="h-4 w-4" />Salas cadastradas</CardTitle>
          <CardDescription>{filtered.length} registro(s) no filtro atual.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Codigo</TableHead><TableHead>Sala</TableHead><TableHead>Unidade</TableHead><TableHead>Tipo</TableHead><TableHead>Capacidade</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Acoes</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma sala encontrada.</TableCell></TableRow>
              ) : (
                filtered.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium">{room.codigo}</TableCell>
                    <TableCell>{room.nome}<p className="text-xs text-muted-foreground">{room.nomeConhecido || "-"}</p></TableCell>
                    <TableCell>{units.find((u) => u.id === room.unitId)?.nome || "-"}</TableCell>
                    <TableCell>{room.tipo}</TableCell>
                    <TableCell>{room.capacidadeRecomendada}/{room.capacidadeTotal}</TableCell>
                    <TableCell><Badge variant={statusToBadgeVariant(room.status)}>{getRoomStatusLabel(room.status)}</Badge></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openEdit(room)}>Editar</Button></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar sala" : "Nova sala"}</DialogTitle>
            <DialogDescription>Estrutura completa de cadastro de sala fisica para o laboratorio.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Unidade</Label><Select value={draft.unitId} onValueChange={(value) => setDraft((prev) => ({ ...prev, unitId: value }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Codigo/numero</Label><Input value={draft.codigo} onChange={(e) => setDraft((p) => ({ ...p, codigo: e.target.value }))} placeholder="Ex.: C-101" /></div>
            <div className="space-y-1"><Label>Nome da sala</Label><Input value={draft.nome} onChange={(e) => setDraft((p) => ({ ...p, nome: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Nome conhecido</Label><Input value={draft.nomeConhecido} onChange={(e) => setDraft((p) => ({ ...p, nomeConhecido: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Tipo</Label><Select value={draft.tipo} onValueChange={(value) => setDraft((prev) => ({ ...prev, tipo: value as RoomType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROOM_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Status</Label><Select value={draft.status} onValueChange={(value) => setDraft((prev) => ({ ...prev, status: value as RoomStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROOM_STATUS.map((status) => <SelectItem key={status} value={status}>{getRoomStatusLabel(status)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Capacidade total</Label><Input type="number" min={1} value={draft.capacidadeTotal} onChange={(e) => setDraft((p) => ({ ...p, capacidadeTotal: Number(e.target.value || 0) }))} /></div>
            <div className="space-y-1"><Label>Capacidade recomendada</Label><Input type="number" min={1} value={draft.capacidadeRecomendada} onChange={(e) => setDraft((p) => ({ ...p, capacidadeRecomendada: Number(e.target.value || 0) }))} /></div>
            <div className="space-y-1"><Label>Localizacao interna</Label><Input value={draft.localizacaoInterna} onChange={(e) => setDraft((p) => ({ ...p, localizacaoInterna: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Especialidade principal</Label><Input value={draft.especialidadePrincipal} onChange={(e) => setDraft((p) => ({ ...p, especialidadePrincipal: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Uso preferencial</Label><Input value={draft.usoPreferencial} onChange={(e) => setDraft((p) => ({ ...p, usoPreferencial: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Acessibilidade</Label><Input value={draft.acessibilidade} onChange={(e) => setDraft((p) => ({ ...p, acessibilidade: e.target.value }))} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Descricao</Label><Textarea rows={2} value={draft.descricao} onChange={(e) => setDraft((p) => ({ ...p, descricao: e.target.value }))} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Equipamentos (separados por virgula)</Label><Input value={equipmentText} onChange={(e) => setEquipmentText(e.target.value)} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Observacoes</Label><Textarea rows={2} value={draft.observacoes} onChange={(e) => setDraft((p) => ({ ...p, observacoes: e.target.value }))} /></div>
            <div className="flex items-center gap-3 md:col-span-2"><Switch checked={draft.permiteUsoCompartilhado} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, permiteUsoCompartilhado: checked }))} /><Label>Permite uso compartilhado entre profissionais/equipes</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
