import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Plus, Printer, Save } from "lucide-react";
import { apiService } from "@/services/api";

type FamilyMember = {
  id: string;
  nome: string;
  parentesco: string;
  sexo: string;
  estadoCivil: string;
  idade: string;
  escolaridade: string;
  profissao: string;
};

type SocialInterviewDraft = {
  dataEntrevista: string;
  assistenteSocial: string;
  atendidoId: string;
  atendidoNome: string;
  dataNascimento: string;
  sexo: string;
  corRaca: string;
  mae: string;
  corMae: string;
  pai: string;
  corPai: string;
  responsavel: string;
  cpfResponsavel: string;
  endereco: string;
  bairro: string;
  cep: string;
  referencia: string;
  telefones: string;
  possuiWhatsApp: boolean;
  possuiLaudo: boolean;
  cids: string;
  rg: string;
  cpf: string;
  certidaoNascimento: string;
  possuiCarteiraVacinacao: boolean;
  encaminhadaPor: string;
  motivoEncaminhamento: string;
  postoSaude: string;
  enderecoPosto: string;
  dataUltimaConsulta: string;
  especialidadeUltimaConsulta: string;
  terapias: string[];
  idadeInicioEscola: string;
  adaptacao: string;
  escolaAtual: string;
  serie: string;
  turno: string;
  horario: string;
  repeticao: string;
  rendimento: string;
  membrosFamilia: FamilyMember[];
  statusPais: string;
  relacionamentoCasa: string;
  ocupacaoMae: string;
  rendaMae: string;
  localTrabalhoMae: string;
  ocupacaoPai: string;
  rendaPai: string;
  localTrabalhoPai: string;
  ocupacaoResponsavel: string;
  rendaResponsavel: string;
  localTrabalhoResponsavel: string;
  crasReferencia: string;
  bolsaFamilia: boolean;
  valorBolsaFamilia: string;
  bpc: boolean;
  valorBpc: string;
  quemCuida: string;
  terapiaOutraInstituicao: boolean;
  qualTerapiaOutra: string;
  tipoMoradia: string;
  observacoesMoradia: string;
  valorMoradia: string;
  numeroComodos: string;
  tratamentoAgua: string;
  tipoIluminacao: string;
  escoamentoSanitario: string;
  destinoLixo: string;
  observacoesGerais: string;
  parecerSocial: string;
  resultadoTerapeutas: string;
  dataResultadoTerapeutas: string;
};

type SocialInterviewRecord = SocialInterviewDraft & { id: string };

type Paciente = {
  id: string;
  nome: string;
  name?: string;
  dataNascimento: string;
  sexo: string;
  corRaca: string;
  mae: string;
  corMae: string;
  pai: string;
  corPai: string;
  responsavel: string;
  cpfResponsavel: string;
  endereco: string;
  bairro: string;
  cep: string;
  referencia: string;
  telefones: string;
  cpf?: string;
};

const pacientesMock: Paciente[] = [
  {
    id: "p1",
    nome: "Caua Vitorio Anastacio Santos",
    dataNascimento: "2013-10-21",
    sexo: "Masculino",
    corRaca: "Pardo",
    mae: "Claudia da Silva Anastacio",
    corMae: "Parda",
    pai: "Jorge Luiz Anastacio",
    corPai: "Branca",
    responsavel: "Claudia da Silva Anastacio",
    cpfResponsavel: "576.157.995-20",
    endereco: "Estrada Paulo de Medeiros, 80 BL 7 Ap",
    bairro: "Agua Santa",
    cep: "20745-220",
    referencia: "Proximo ao Presidio Ary Franco",
    telefones: "21 98091-2089",
    cpf: "",
  },
  {
    id: "p2",
    nome: "Maria Silva",
    dataNascimento: "2014-05-12",
    sexo: "Feminino",
    corRaca: "Parda",
    mae: "Ana Paula Silva",
    corMae: "Parda",
    pai: "Carlos Silva",
    corPai: "Pardo",
    responsavel: "Ana Paula Silva",
    cpfResponsavel: "321.654.987-00",
    endereco: "Rua das Acacias, 120",
    bairro: "Meyer",
    cep: "20720-230",
    referencia: "Proximo ao CEAC",
    telefones: "21 99999-0000",
    cpf: "123.456.789-00",
  },
];

const terapiasDisponiveis = [
  "Fonoaudiologia",
  "Psicologia",
  "Psicopedagogia",
  "Terapia Ocupacional",
  "Servico Social",
];

const tiposMoradia = ["Propria", "Alugada", "Cedida", "Compartilhada", "Outro"];

const gerarId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`);

const createEmptyDraft = (paciente?: Paciente): SocialInterviewDraft => ({
  dataEntrevista: new Date().toISOString().slice(0, 10),
  assistenteSocial: "Assistente Social",
  atendidoId: paciente?.id ?? "",
  atendidoNome: paciente?.nome || paciente?.name || "",
  dataNascimento: paciente?.dataNascimento ?? "",
  sexo: paciente?.sexo ?? "",
  corRaca: paciente?.corRaca ?? "",
  mae: paciente?.mae ?? "",
  corMae: paciente?.corMae ?? "",
  pai: paciente?.pai ?? "",
  corPai: paciente?.corPai ?? "",
  responsavel: paciente?.responsavel ?? "",
  cpfResponsavel: paciente?.cpfResponsavel ?? "",
  endereco: paciente?.endereco ?? "",
  bairro: paciente?.bairro ?? "",
  cep: paciente?.cep ?? "",
  referencia: paciente?.referencia ?? "",
  telefones: paciente?.telefones ?? "",
  possuiWhatsApp: true,
  possuiLaudo: true,
  cids: "F84.0, G40.0",
  rg: "183.586.157 10",
  cpf: paciente?.cpf ?? "",
  certidaoNascimento: "0931380155 2013 1 00103 052 0030652 91",
  possuiCarteiraVacinacao: true,
  encaminhadaPor: "Pediatra",
  motivoEncaminhamento: "CID: F84.0, G40.0",
  postoSaude: "Clinica da Familia Amelia",
  enderecoPosto: "R. Pompilio de Albuquerque, 386 - Encantado, RJ",
  dataUltimaConsulta: "2025-10-01",
  especialidadeUltimaConsulta: "Clinico",
  terapias: ["Fonoaudiologia", "Psicologia", "Psicopedagogia"],
  idadeInicioEscola: "2",
  adaptacao: "Dificil",
  escolaAtual: "EM Brigadeiro Faria Lima",
  serie: "6",
  turno: "Manha",
  horario: "07:30 as 14:30",
  repeticao: "Nao",
  rendimento: "Regular",
  membrosFamilia: [],
  statusPais: "Casados",
  relacionamentoCasa: "Tranquilo",
  ocupacaoMae: "Do lar / diarista",
  rendaMae: "500",
  localTrabalhoMae: "",
  ocupacaoPai: "Aposentado",
  rendaPai: "2000",
  localTrabalhoPai: "",
  ocupacaoResponsavel: "",
  rendaResponsavel: "",
  localTrabalhoResponsavel: "",
  crasReferencia: "Sobral Pinto",
  bolsaFamilia: true,
  valorBolsaFamilia: "650",
  bpc: false,
  valorBpc: "",
  quemCuida: "Mae",
  terapiaOutraInstituicao: false,
  qualTerapiaOutra: "",
  tipoMoradia: "Propria",
  observacoesMoradia: "Pagando prestacao do imovel",
  valorMoradia: "",
  numeroComodos: "5",
  tratamentoAgua: "Filtrada",
  tipoIluminacao: "Relogio proprio",
  escoamentoSanitario: "Rede publica",
  destinoLixo: "Coleta regular",
  observacoesGerais: "",
  parecerSocial: "",
  resultadoTerapeutas: "",
  dataResultadoTerapeutas: "",
});

const formatDate = (dateString: string) =>
  dateString ? new Date(dateString).toLocaleDateString("pt-BR") : "-";

const SectionTitle = ({ title, description }: { title: string; description?: string }) => (
  <div className="space-y-1">
    <h3 className="text-lg font-semibold">{title}</h3>
    {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    <div className="border-b" />
  </div>
);

const InfoLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="font-medium">{value || "-"}</span>
  </div>
);

const mapFromApi = (dto: any): SocialInterviewRecord => ({
  id: dto.id,
  dataEntrevista: dto.interview_date || "",
  assistenteSocial: dto.assistente_social || dto.assistente_social_id || "",
  atendidoId: dto.patient_id || "",
  atendidoNome: dto.atendido_nome || "",
  dataNascimento: dto.data_nascimento || "",
  sexo: dto.sexo || "",
  corRaca: dto.cor_raca || "",
  mae: dto.mae || "",
  corMae: dto.cor_mae || "",
  pai: dto.pai || "",
  corPai: dto.cor_pai || "",
  responsavel: dto.responsavel || "",
  cpfResponsavel: dto.cpf_responsavel || "",
  endereco: dto.endereco || "",
  bairro: dto.bairro || "",
  cep: dto.cep || "",
  referencia: dto.referencia || "",
  telefones: dto.telefones || "",
  possuiWhatsApp: Boolean(dto.possui_whatsapp),
  possuiLaudo: Boolean(dto.possui_laudo),
  cids: dto.cids || "",
  rg: dto.rg || "",
  cpf: dto.cpf || "",
  certidaoNascimento: dto.certidao_nascimento || "",
  possuiCarteiraVacinacao: Boolean(dto.possui_carteira_vacinacao),
  encaminhadaPor: dto.encaminhada_por || "",
  motivoEncaminhamento: dto.motivo_encaminhamento || "",
  postoSaude: dto.posto_saude || "",
  enderecoPosto: dto.endereco_posto || "",
  dataUltimaConsulta: dto.data_ultima_consulta || "",
  especialidadeUltimaConsulta: dto.especialidade_ultima_consulta || "",
  terapias: dto.terapias || [],
  idadeInicioEscola: dto.idade_inicio_escola != null ? String(dto.idade_inicio_escola) : "",
  adaptacao: dto.adaptacao || "",
  escolaAtual: dto.escola_atual || "",
  serie: dto.serie || "",
  turno: dto.turno || "",
  horario: dto.horario || "",
  repeticao: dto.repeticao || "",
  rendimento: dto.rendimento || "",
  membrosFamilia: dto.membros_familia || [],
  statusPais: dto.status_pais || "",
  relacionamentoCasa: dto.relacionamento_casa || "",
  ocupacaoMae: dto.ocupacao_mae || "",
  rendaMae: dto.renda_mae != null ? String(dto.renda_mae) : "",
  localTrabalhoMae: dto.local_trabalho_mae || "",
  ocupacaoPai: dto.ocupacao_pai || "",
  rendaPai: dto.renda_pai != null ? String(dto.renda_pai) : "",
  localTrabalhoPai: dto.local_trabalho_pai || "",
  ocupacaoResponsavel: dto.ocupacao_responsavel || "",
  rendaResponsavel: dto.renda_responsavel != null ? String(dto.renda_responsavel) : "",
  localTrabalhoResponsavel: dto.local_trabalho_responsavel || "",
  crasReferencia: dto.cras_referencia || "",
  bolsaFamilia: Boolean(dto.bolsa_familia),
  valorBolsaFamilia: dto.valor_bolsa_familia != null ? String(dto.valor_bolsa_familia) : "",
  bpc: Boolean(dto.bpc),
  valorBpc: dto.valor_bpc != null ? String(dto.valor_bpc) : "",
  quemCuida: dto.quem_cuida || "",
  terapiaOutraInstituicao: Boolean(dto.terapia_outra_instituicao),
  qualTerapiaOutra: dto.qual_terapia_outra || "",
  tipoMoradia: dto.tipo_moradia || "",
  observacoesMoradia: dto.observacoes_moradia || "",
  valorMoradia: dto.valor_moradia != null ? String(dto.valor_moradia) : "",
  numeroComodos: dto.numero_comodos != null ? String(dto.numero_comodos) : "",
  tratamentoAgua: dto.tratamento_agua || "",
  tipoIluminacao: dto.tipo_iluminacao || "",
  escoamentoSanitario: dto.escoamento_sanitario || "",
  destinoLixo: dto.destino_lixo || "",
  observacoesGerais: dto.observacoes_gerais || "",
  parecerSocial: dto.parecer_social || "",
  resultadoTerapeutas: dto.resultado_terapeutas || "",
  dataResultadoTerapeutas: dto.data_resultado_terapeutas || "",
});

const mapToApi = (draft: SocialInterviewDraft, patientId?: string) => ({
  patient_id: patientId || draft.atendidoId,
  assistente_social: draft.assistenteSocial,
  interview_date: draft.dataEntrevista,
  interview_time: null,
  atendido_nome: draft.atendidoNome,
  data_nascimento: draft.dataNascimento,
  sexo: draft.sexo,
  cor_raca: draft.corRaca,
  mae: draft.mae,
  cor_mae: draft.corMae,
  pai: draft.pai,
  cor_pai: draft.corPai,
  responsavel: draft.responsavel,
  cpf_responsavel: draft.cpfResponsavel,
  endereco: draft.endereco,
  bairro: draft.bairro,
  cep: draft.cep,
  referencia: draft.referencia,
  telefones: draft.telefones,
  possui_whatsapp: draft.possuiWhatsApp,
  possui_laudo: draft.possuiLaudo,
  cids: draft.cids,
  rg: draft.rg,
  cpf: draft.cpf,
  certidao_nascimento: draft.certidaoNascimento,
  possui_carteira_vacinacao: draft.possuiCarteiraVacinacao,
  encaminhada_por: draft.encaminhadaPor,
  motivo_encaminhamento: draft.motivoEncaminhamento,
  posto_saude: draft.postoSaude,
  endereco_posto: draft.enderecoPosto,
  data_ultima_consulta: draft.dataUltimaConsulta,
  especialidade_ultima_consulta: draft.especialidadeUltimaConsulta,
  terapias: draft.terapias,
  idade_inicio_escola: draft.idadeInicioEscola ? Number(draft.idadeInicioEscola) : null,
  adaptacao: draft.adaptacao,
  escola_atual: draft.escolaAtual,
  serie: draft.serie,
  turno: draft.turno,
  horario: draft.horario,
  repeticao: draft.repeticao,
  rendimento: draft.rendimento,
  membros_familia: draft.membrosFamilia,
  status_pais: draft.statusPais,
  relacionamento_casa: draft.relacionamentoCasa,
  ocupacao_mae: draft.ocupacaoMae,
  renda_mae: draft.rendaMae ? Number(draft.rendaMae) : null,
  local_trabalho_mae: draft.localTrabalhoMae,
  ocupacao_pai: draft.ocupacaoPai,
  renda_pai: draft.rendaPai ? Number(draft.rendaPai) : null,
  local_trabalho_pai: draft.localTrabalhoPai,
  ocupacao_responsavel: draft.ocupacaoResponsavel,
  renda_responsavel: draft.rendaResponsavel ? Number(draft.rendaResponsavel) : null,
  local_trabalho_responsavel: draft.localTrabalhoResponsavel,
  cras_referencia: draft.crasReferencia,
  bolsa_familia: draft.bolsaFamilia,
  valor_bolsa_familia: draft.valorBolsaFamilia ? Number(draft.valorBolsaFamilia) : null,
  bpc: draft.bpc,
  valor_bpc: draft.valorBpc ? Number(draft.valorBpc) : null,
  quem_cuida: draft.quemCuida,
  terapia_outra_instituicao: draft.terapiaOutraInstituicao,
  qual_terapia_outra: draft.qualTerapiaOutra,
  tipo_moradia: draft.tipoMoradia,
  observacoes_moradia: draft.observacoesMoradia,
  valor_moradia: draft.valorMoradia ? Number(draft.valorMoradia) : null,
  numero_comodos: draft.numeroComodos ? Number(draft.numeroComodos) : null,
  tratamento_agua: draft.tratamentoAgua,
  tipo_iluminacao: draft.tipoIluminacao,
  escoamento_sanitario: draft.escoamentoSanitario,
  destino_lixo: draft.destinoLixo,
  observacoes_gerais: draft.observacoesGerais,
  parecer_social: draft.parecerSocial,
  resultado_terapeutas: draft.resultadoTerapeutas,
  data_resultado_terapeutas: draft.dataResultadoTerapeutas || null,
});

export default function Entrevistas() {
  const [viewMode, setViewMode] = useState<"list" | "create" | "view">("list");
  const [patients, setPatients] = useState<Paciente[]>(pacientesMock);
  const [selectedPacienteId, setSelectedPacienteId] = useState(pacientesMock[0]?.id ?? "");
  const [draft, setDraft] = useState<SocialInterviewDraft>(createEmptyDraft(pacientesMock[0]));
  const [entrevistas, setEntrevistas] = useState<SocialInterviewRecord[]>([]);
  const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedInterview = useMemo(
    () => entrevistas.find((ent) => ent.id === selectedInterviewId),
    [entrevistas, selectedInterviewId]
  );

  const loadPatients = async () => {
    try {
      const data = await apiService.getPatients();
      if (Array.isArray(data) && data.length > 0) {
        const normalized = data.map((p: any) => ({
          id: p.id,
          nome: p.nome || p.name,
          dataNascimento: p.dataNascimento || p.date_of_birth || "",
          sexo: p.sexo || p.gender || "",
          corRaca: p.corRaca || p.race || "",
          mae: p.mae || "",
          corMae: p.corMae || "",
          pai: p.pai || "",
          corPai: p.corPai || "",
          responsavel: p.responsavel || "",
          cpfResponsavel: p.cpfResponsavel || p.cpf_responsavel || "",
          endereco: p.endereco || p.address || "",
          bairro: p.bairro || p.neighborhood || "",
          cep: p.cep || p.zip_code || "",
          referencia: p.referencia || "",
          telefones: p.telefones || p.phone || p.mobile || "",
          cpf: p.cpf || "",
        })) as Paciente[];
        setPatients(normalized);
        const first = normalized[0];
        setSelectedPacienteId(first.id);
        setDraft(createEmptyDraft(first));
      }
    } catch (error) {
      console.error("Falha ao carregar pacientes, usando mock.", error);
      setPatients(pacientesMock);
    }
  };

  const loadInterviews = async (patientId: string) => {
    if (!patientId) return;
    setLoading(true);
    try {
      const data = await apiService.getSocialInterviews(patientId);
      const mapped = Array.isArray(data) ? data.map(mapFromApi) : [];
      setEntrevistas(mapped);
      setSelectedInterviewId(mapped[0]?.id ?? null);
      if (mapped.length > 0) {
        setViewMode("view");
      }
    } catch (error) {
      console.error("Falha ao carregar entrevistas sociais", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    if (selectedPacienteId) {
      loadInterviews(selectedPacienteId);
    }
  }, [selectedPacienteId]);

  const handleSelectPaciente = (id: string) => {
    setSelectedPacienteId(id);
    const paciente = patients.find((p) => p.id === id) || pacientesMock.find((p) => p.id === id);
    setDraft((prev) => ({
      ...createEmptyDraft(paciente),
      parecerSocial: prev.parecerSocial,
      resultadoTerapeutas: prev.resultadoTerapeutas,
      dataResultadoTerapeutas: prev.dataResultadoTerapeutas,
    }));
  };

  const handleDraftChange = <K extends keyof SocialInterviewDraft>(
    key: K,
    value: SocialInterviewDraft[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTerapia = (terapia: string) => {
    setDraft((prev) => {
      const exists = prev.terapias.includes(terapia);
      return {
        ...prev,
        terapias: exists ? prev.terapias.filter((t) => t !== terapia) : [...prev.terapias, terapia],
      };
    });
  };

  const handleAddMembro = () => {
    const novo: FamilyMember = {
      id: gerarId(),
      nome: "",
      parentesco: "",
      sexo: "",
      estadoCivil: "",
      idade: "",
      escolaridade: "",
      profissao: "",
    };
    setDraft((prev) => ({ ...prev, membrosFamilia: [...prev.membrosFamilia, novo] }));
  };

  const handleUpdateMembro = (id: string, field: keyof FamilyMember, value: string) => {
    setDraft((prev) => ({
      ...prev,
      membrosFamilia: prev.membrosFamilia.map((m) => (m.id === id ? { ...m, [field]: value } : m)),
    }));
  };

  const handleRemoveMembro = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      membrosFamilia: prev.membrosFamilia.filter((m) => m.id !== id),
    }));
  };

  const handleNovaEntrevista = () => {
    const paciente = patients.find((p) => p.id === selectedPacienteId) || pacientesMock.find((p) => p.id === selectedPacienteId);
    setDraft(createEmptyDraft(paciente));
    setViewMode("create");
    setSelectedInterviewId(null);
  };

  const handleSave = async () => {
    if (!selectedPacienteId) return;
    setLoading(true);
    try {
      const payload = mapToApi(draft, selectedPacienteId);
      if (selectedInterviewId) {
        await apiService.updateSocialInterview(selectedInterviewId, payload);
      } else {
        await apiService.createSocialInterview(payload);
      }
      await loadInterviews(selectedPacienteId);
      setViewMode("view");
    } catch (error) {
      console.error("Erro ao salvar entrevista social", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVisualizar = (id: string) => {
    setSelectedInterviewId(id);
    setViewMode("view");
  };

  const handleEditar = () => {
    if (!selectedInterview) return;
    const { id: _id, ...rest } = selectedInterview;
    setDraft(rest);
    setViewMode("create");
  };

  const handleExportar = () => {
    window.print();
  };

  const estatisticas = {
    total: entrevistas.length,
    pendentesResultado: entrevistas.filter((e) => !e.resultadoTerapeutas).length,
    comParecer: entrevistas.filter((e) => !!e.parecerSocial).length,
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Entrevistas Sociais</h1>
            <p className="text-muted-foreground text-sm">
              Dossies sociais baseados no modelo ENTREVISTA SOCIAL - IDSLM
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleNovaEntrevista}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Entrevista Social
            </Button>
            {selectedInterview ? (
              <Button variant="outline" onClick={handleExportar}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimir / Exportar PDF
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total de entrevistas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{estatisticas.total}</div>
              <p className="text-sm text-muted-foreground">Dossies sociais cadastrados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Com parecer social</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-600">{estatisticas.comParecer}</div>
              <p className="text-sm text-muted-foreground">Registros com parecer preenchido</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pendentes de resultado clinico</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">{estatisticas.pendentesResultado}</div>
              <p className="text-sm text-muted-foreground">Aguardando resultado dos terapeutas</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="lista" value={viewMode === "list" ? "lista" : "detalhe"}>
          <TabsList>
            <TabsTrigger value="lista" onClick={() => setViewMode("list")}>
              Lista
            </TabsTrigger>
            <TabsTrigger value="detalhe" disabled>
              Detalhe / Formulario
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Dossies de Entrevista Social
                </CardTitle>
                <CardDescription>Registros vinculados ao cadastro dos atendidos</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="w-full md:w-80">
                    <label className="text-sm font-medium">Selecionar atendido</label>
                    <select
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                      value={selectedPacienteId}
                      onChange={(e) => handleSelectPaciente(e.target.value)}
                    >
                      {(patients.length ? patients : pacientesMock).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome || p.name || "Paciente"} - {p.cpfResponsavel || p.cpf || "sem CPF"}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Dados serao pre-preenchidos a partir do cadastro.
                    </p>
                  </div>
                  <Button className="self-start" onClick={handleNovaEntrevista}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Entrevista Social
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Atendido</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Assistente Social</TableHead>
                      <TableHead>Resultado terapeutas</TableHead>
                      <TableHead>Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entrevistas.map((ent) => (
                      <TableRow key={ent.id}>
                        <TableCell className="font-medium">{ent.atendidoNome}</TableCell>
                        <TableCell>{formatDate(ent.dataEntrevista)}</TableCell>
                        <TableCell>{ent.assistenteSocial || "-"}</TableCell>
                        <TableCell>
                          {ent.resultadoTerapeutas ? (
                            <Badge variant="outline">Integrado ao modulo clinico</Badge>
                          ) : (
                            <Badge variant="secondary">Aguardando</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleVisualizar(ent.id)}>
                              Ver
                            </Button>
                            <Button size="sm" onClick={() => handleVisualizar(ent.id)}>
                              Acompanhar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {viewMode === "create" ? (
          <Card id="form-entrevista">
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Nova Entrevista Social</CardTitle>
                <CardDescription>Formulario baseado no modelo oficial do IDSLM</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setViewMode("list")}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar dossie
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-8">
              <SectionTitle title="Cabecalho" description="Informacoes iniciais da entrevista social" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Atendido</label>
                  <select
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    value={draft.atendidoId}
                    onChange={(e) => {
                      handleSelectPaciente(e.target.value);
                    }}
                  >
                    {(patients.length ? patients : pacientesMock).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome || p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Data da entrevista</label>
                  <Input
                    type="date"
                    value={draft.dataEntrevista}
                    onChange={(e) => handleDraftChange("dataEntrevista", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Assistente social responsavel</label>
                  <Input
                    value={draft.assistenteSocial}
                    onChange={(e) => handleDraftChange("assistenteSocial", e.target.value)}
                  />
                </div>
              </div>

              <SectionTitle title="Dados pessoais" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Nome</label>
                  <Input
                    value={draft.atendidoNome}
                    onChange={(e) => handleDraftChange("atendidoNome", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Data de nascimento</label>
                  <Input
                    type="date"
                    value={draft.dataNascimento}
                    onChange={(e) => handleDraftChange("dataNascimento", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Sexo</label>
                  <Input value={draft.sexo} onChange={(e) => handleDraftChange("sexo", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Cor / Raca</label>
                  <Input
                    value={draft.corRaca}
                    onChange={(e) => handleDraftChange("corRaca", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Mae</label>
                  <Input value={draft.mae} onChange={(e) => handleDraftChange("mae", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Cor da mae</label>
                  <Input value={draft.corMae} onChange={(e) => handleDraftChange("corMae", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Pai</label>
                  <Input value={draft.pai} onChange={(e) => handleDraftChange("pai", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Cor do pai</label>
                  <Input value={draft.corPai} onChange={(e) => handleDraftChange("corPai", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Responsavel</label>
                  <Input
                    value={draft.responsavel}
                    onChange={(e) => handleDraftChange("responsavel", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">CPF do responsavel</label>
                  <Input
                    value={draft.cpfResponsavel}
                    onChange={(e) => handleDraftChange("cpfResponsavel", e.target.value)}
                  />
                </div>
              </div>

              <SectionTitle title="Endereco e contato" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Endereco</label>
                  <Input
                    value={draft.endereco}
                    onChange={(e) => handleDraftChange("endereco", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Bairro</label>
                  <Input value={draft.bairro} onChange={(e) => handleDraftChange("bairro", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">CEP</label>
                  <Input value={draft.cep} onChange={(e) => handleDraftChange("cep", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Ponto de referencia</label>
                  <Input
                    value={draft.referencia}
                    onChange={(e) => handleDraftChange("referencia", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Telefones</label>
                  <Input
                    value={draft.telefones}
                    onChange={(e) => handleDraftChange("telefones", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <Checkbox
                    id="possuiWhatsApp"
                    checked={draft.possuiWhatsApp}
                    onCheckedChange={(checked) => handleDraftChange("possuiWhatsApp", Boolean(checked))}
                  />
                  <label htmlFor="possuiWhatsApp" className="text-sm">
                    Possui WhatsApp?
                  </label>
                </div>
              </div>

              <SectionTitle title="Laudos e documentacao" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="possuiLaudo"
                    checked={draft.possuiLaudo}
                    onCheckedChange={(checked) => handleDraftChange("possuiLaudo", Boolean(checked))}
                  />
                  <label htmlFor="possuiLaudo" className="text-sm">
                    Usuario possui laudo?
                  </label>
                </div>
                <div>
                  <label className="text-sm font-medium">CID(s)</label>
                  <Input value={draft.cids} onChange={(e) => handleDraftChange("cids", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">RG / Identidade</label>
                  <Input value={draft.rg} onChange={(e) => handleDraftChange("rg", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">CPF</label>
                  <Input value={draft.cpf} onChange={(e) => handleDraftChange("cpf", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Certidao de nascimento</label>
                  <Input
                    value={draft.certidaoNascimento}
                    onChange={(e) => handleDraftChange("certidaoNascimento", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="carteiraVacina"
                    checked={draft.possuiCarteiraVacinacao}
                    onCheckedChange={(checked) => handleDraftChange("possuiCarteiraVacinacao", Boolean(checked))}
                  />
                  <label htmlFor="carteiraVacina" className="text-sm">
                    Possui carteira de vacinacao?
                  </label>
                </div>
              </div>

              <SectionTitle title="Encaminhamento e saude" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Encaminhada por</label>
                  <Input
                    value={draft.encaminhadaPor}
                    onChange={(e) => handleDraftChange("encaminhadaPor", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Motivo do encaminhamento</label>
                  <Input
                    value={draft.motivoEncaminhamento}
                    onChange={(e) => handleDraftChange("motivoEncaminhamento", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Posto de saude de referencia</label>
                  <Input
                    value={draft.postoSaude}
                    onChange={(e) => handleDraftChange("postoSaude", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Endereco do posto</label>
                  <Input
                    value={draft.enderecoPosto}
                    onChange={(e) => handleDraftChange("enderecoPosto", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Data da ultima consulta</label>
                  <Input
                    type="date"
                    value={draft.dataUltimaConsulta}
                    onChange={(e) => handleDraftChange("dataUltimaConsulta", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Especialidade da ultima consulta</label>
                  <Input
                    value={draft.especialidadeUltimaConsulta}
                    onChange={(e) => handleDraftChange("especialidadeUltimaConsulta", e.target.value)}
                  />
                </div>
              </div>

              <SectionTitle title="Atividades no IDSLM" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {terapiasDisponiveis.map((terapia) => (
                  <div key={terapia} className="flex items-center gap-2">
                    <Checkbox
                      id={terapia}
                      checked={draft.terapias.includes(terapia)}
                      onCheckedChange={() => toggleTerapia(terapia)}
                    />
                    <label htmlFor={terapia} className="text-sm">
                      {terapia}
                    </label>
                  </div>
                ))}
              </div>

              <SectionTitle title="Escolaridade" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Idade de inicio na escola</label>
                  <Input
                    value={draft.idadeInicioEscola}
                    onChange={(e) => handleDraftChange("idadeInicioEscola", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Adaptacao</label>
                  <Input
                    value={draft.adaptacao}
                    onChange={(e) => handleDraftChange("adaptacao", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Escola atual</label>
                  <Input
                    value={draft.escolaAtual}
                    onChange={(e) => handleDraftChange("escolaAtual", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Serie</label>
                  <Input value={draft.serie} onChange={(e) => handleDraftChange("serie", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Turno</label>
                  <Input value={draft.turno} onChange={(e) => handleDraftChange("turno", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Horario</label>
                  <Input
                    value={draft.horario}
                    onChange={(e) => handleDraftChange("horario", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Alguma repeticao</label>
                  <Input
                    value={draft.repeticao}
                    onChange={(e) => handleDraftChange("repeticao", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Rendimento atual</label>
                  <Input
                    value={draft.rendimento}
                    onChange={(e) => handleDraftChange("rendimento", e.target.value)}
                  />
                </div>
              </div>

              <SectionTitle
                title="Composicao familiar"
                description="Adicione os membros que residem com o atendido"
              />
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleAddMembro}>
                  Adicionar membro
                </Button>
              </div>
              <div className="space-y-4">
                {draft.membrosFamilia.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum membro adicionado. Use "Adicionar membro" para iniciar a tabela.
                  </p>
                ) : null}
                {draft.membrosFamilia.map((membro) => (
                  <div key={membro.id} className="grid grid-cols-1 md:grid-cols-4 gap-3 border p-3 rounded-md">
                    <div>
                      <label className="text-sm font-medium">Nome</label>
                      <Input
                        value={membro.nome}
                        onChange={(e) => handleUpdateMembro(membro.id, "nome", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Parentesco</label>
                      <Input
                        value={membro.parentesco}
                        onChange={(e) => handleUpdateMembro(membro.id, "parentesco", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Sexo</label>
                      <Input
                        value={membro.sexo}
                        onChange={(e) => handleUpdateMembro(membro.id, "sexo", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Estado civil</label>
                      <Input
                        value={membro.estadoCivil}
                        onChange={(e) => handleUpdateMembro(membro.id, "estadoCivil", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Idade</label>
                      <Input
                        value={membro.idade}
                        onChange={(e) => handleUpdateMembro(membro.id, "idade", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Escolaridade</label>
                      <Input
                        value={membro.escolaridade}
                        onChange={(e) => handleUpdateMembro(membro.id, "escolaridade", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Profissao</label>
                      <Input
                        value={membro.profissao}
                        onChange={(e) => handleUpdateMembro(membro.id, "profissao", e.target.value)}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button variant="destructive" size="sm" onClick={() => handleRemoveMembro(membro.id)}>
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Status dos pais</label>
                  <Input
                    value={draft.statusPais}
                    onChange={(e) => handleDraftChange("statusPais", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Relacionamento em casa</label>
                  <Input
                    value={draft.relacionamentoCasa}
                    onChange={(e) => handleDraftChange("relacionamentoCasa", e.target.value)}
                  />
                </div>
              </div>

              <SectionTitle title="Responsaveis e beneficios" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Ocupacao da mae</label>
                  <Input
                    value={draft.ocupacaoMae}
                    onChange={(e) => handleDraftChange("ocupacaoMae", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Renda da mae (R$)</label>
                  <Input value={draft.rendaMae} onChange={(e) => handleDraftChange("rendaMae", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Local de trabalho (mae)</label>
                  <Input
                    value={draft.localTrabalhoMae}
                    onChange={(e) => handleDraftChange("localTrabalhoMae", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Ocupacao do pai</label>
                  <Input
                    value={draft.ocupacaoPai}
                    onChange={(e) => handleDraftChange("ocupacaoPai", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Renda do pai (R$)</label>
                  <Input value={draft.rendaPai} onChange={(e) => handleDraftChange("rendaPai", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Local de trabalho (pai)</label>
                  <Input
                    value={draft.localTrabalhoPai}
                    onChange={(e) => handleDraftChange("localTrabalhoPai", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Ocupacao do responsavel</label>
                  <Input
                    value={draft.ocupacaoResponsavel}
                    onChange={(e) => handleDraftChange("ocupacaoResponsavel", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Renda do responsavel (R$)</label>
                  <Input
                    value={draft.rendaResponsavel}
                    onChange={(e) => handleDraftChange("rendaResponsavel", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Local de trabalho (responsavel)</label>
                  <Input
                    value={draft.localTrabalhoResponsavel}
                    onChange={(e) => handleDraftChange("localTrabalhoResponsavel", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">CRAS de referencia</label>
                  <Input
                    value={draft.crasReferencia}
                    onChange={(e) => handleDraftChange("crasReferencia", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <Checkbox
                    id="bolsaFamilia"
                    checked={draft.bolsaFamilia}
                    onCheckedChange={(checked) => handleDraftChange("bolsaFamilia", Boolean(checked))}
                  />
                  <label htmlFor="bolsaFamilia" className="text-sm">
                    Bolsa Familia
                  </label>
                </div>
                <div>
                  <label className="text-sm font-medium">Valor Bolsa Familia (R$)</label>
                  <Input
                    value={draft.valorBolsaFamilia}
                    onChange={(e) => handleDraftChange("valorBolsaFamilia", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bpc"
                    checked={draft.bpc}
                    onCheckedChange={(checked) => handleDraftChange("bpc", Boolean(checked))}
                  />
                  <label htmlFor="bpc" className="text-sm">
                    BPC
                  </label>
                </div>
                <div>
                  <label className="text-sm font-medium">Valor BPC (R$)</label>
                  <Input value={draft.valorBpc} onChange={(e) => handleDraftChange("valorBpc", e.target.value)} />
                </div>
              </div>

              <SectionTitle title="Acolhimento e moradia" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Quem fica com a crianca</label>
                  <Input value={draft.quemCuida} onChange={(e) => handleDraftChange("quemCuida", e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="outraTerapia"
                    checked={draft.terapiaOutraInstituicao}
                    onCheckedChange={(checked) => handleDraftChange("terapiaOutraInstituicao", Boolean(checked))}
                  />
                  <label htmlFor="outraTerapia" className="text-sm">
                    Realiza terapia em outra instituicao?
                  </label>
                </div>
                <div>
                  <label className="text-sm font-medium">Qual?</label>
                  <Input
                    value={draft.qualTerapiaOutra}
                    onChange={(e) => handleDraftChange("qualTerapiaOutra", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo de moradia</label>
                  <select
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    value={draft.tipoMoradia}
                    onChange={(e) => handleDraftChange("tipoMoradia", e.target.value)}
                  >
                    {tiposMoradia.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Observacoes de moradia</label>
                  <Input
                    value={draft.observacoesMoradia}
                    onChange={(e) => handleDraftChange("observacoesMoradia", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Valor pago (aluguel ou prestacao)</label>
                  <Input
                    value={draft.valorMoradia}
                    onChange={(e) => handleDraftChange("valorMoradia", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Numero de comodos</label>
                  <Input
                    value={draft.numeroComodos}
                    onChange={(e) => handleDraftChange("numeroComodos", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Tratamento da agua</label>
                  <Input
                    value={draft.tratamentoAgua}
                    onChange={(e) => handleDraftChange("tratamentoAgua", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo de iluminacao</label>
                  <Input
                    value={draft.tipoIluminacao}
                    onChange={(e) => handleDraftChange("tipoIluminacao", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Escoamento sanitario</label>
                  <Input
                    value={draft.escoamentoSanitario}
                    onChange={(e) => handleDraftChange("escoamentoSanitario", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Destino do lixo</label>
                  <Input
                    value={draft.destinoLixo}
                    onChange={(e) => handleDraftChange("destinoLixo", e.target.value)}
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-sm font-medium">Observacoes gerais</label>
                  <Textarea
                    value={draft.observacoesGerais}
                    onChange={(e) => handleDraftChange("observacoesGerais", e.target.value)}
                  />
                </div>
              </div>

              <SectionTitle title="Parecer social" description="Campo obrigatorio" />
              <Textarea
                value={draft.parecerSocial}
                onChange={(e) => handleDraftChange("parecerSocial", e.target.value)}
                placeholder="Descreva a analise social e encaminhamentos."
              />

              <SectionTitle
                title="Resultado da avaliacao dos terapeutas"
                description="Campo sincronizavel com o modulo clinico/PIA"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Data da avaliacao</label>
                  <Input
                    type="date"
                    value={draft.dataResultadoTerapeutas}
                    onChange={(e) => handleDraftChange("dataResultadoTerapeutas", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Resultado / parecer clinico</label>
                  <Textarea
                    value={draft.resultadoTerapeutas}
                    onChange={(e) => handleDraftChange("resultadoTerapeutas", e.target.value)}
                    placeholder="Texto que tambem sera consumido pelo modulo clinico."
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {viewMode === "view" && selectedInterview ? (
          <Card id="visualizacao-entrevista">
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Entrevista Social - {selectedInterview.atendidoNome}</CardTitle>
                <CardDescription>
                  {formatDate(selectedInterview.dataEntrevista)} | {selectedInterview.assistenteSocial}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleEditar}>
                  Editar
                </Button>
                <Button onClick={handleExportar}>
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir / Exportar PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoLine label="Data da entrevista" value={formatDate(selectedInterview.dataEntrevista)} />
                <InfoLine label="Assistente social" value={selectedInterview.assistenteSocial} />
              </div>

              <SectionTitle title="Dados pessoais" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <InfoLine label="Nome" value={selectedInterview.atendidoNome} />
                <InfoLine label="Data de nascimento" value={formatDate(selectedInterview.dataNascimento)} />
                <InfoLine label="Sexo" value={selectedInterview.sexo} />
                <InfoLine label="Cor / raca" value={selectedInterview.corRaca} />
                <InfoLine label="Mae / cor" value={`${selectedInterview.mae} (${selectedInterview.corMae})`} />
                <InfoLine label="Pai / cor" value={`${selectedInterview.pai} (${selectedInterview.corPai})`} />
                <InfoLine label="Responsavel" value={selectedInterview.responsavel} />
                <InfoLine label="CPF do responsavel" value={selectedInterview.cpfResponsavel} />
              </div>

              <SectionTitle title="Endereco e contato" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <InfoLine label="Endereco" value={selectedInterview.endereco} />
                <InfoLine label="Bairro" value={selectedInterview.bairro} />
                <InfoLine label="CEP" value={selectedInterview.cep} />
                <InfoLine label="Referencia" value={selectedInterview.referencia} />
                <InfoLine label="Telefones" value={selectedInterview.telefones} />
                <InfoLine label="Possui WhatsApp" value={selectedInterview.possuiWhatsApp ? "Sim" : "Nao"} />
              </div>

              <SectionTitle title="Laudos e documentacao" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <InfoLine label="Possui laudo" value={selectedInterview.possuiLaudo ? "Sim" : "Nao"} />
                <InfoLine label="CID(s)" value={selectedInterview.cids} />
                <InfoLine label="RG" value={selectedInterview.rg} />
                <InfoLine label="CPF" value={selectedInterview.cpf} />
                <InfoLine label="Certidao de nascimento" value={selectedInterview.certidaoNascimento} />
                <InfoLine
                  label="Carteira de vacinacao"
                  value={selectedInterview.possuiCarteiraVacinacao ? "Sim" : "Nao"}
                />
              </div>

              <SectionTitle title="Encaminhamento e saude" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <InfoLine label="Encaminhada por" value={selectedInterview.encaminhadaPor} />
                <InfoLine label="Motivo" value={selectedInterview.motivoEncaminhamento} />
                <InfoLine label="Posto de saude" value={selectedInterview.postoSaude} />
                <InfoLine label="Endereco do posto" value={selectedInterview.enderecoPosto} />
                <InfoLine label="Data da ultima consulta" value={formatDate(selectedInterview.dataUltimaConsulta)} />
                <InfoLine label="Especialidade" value={selectedInterview.especialidadeUltimaConsulta} />
              </div>

              <SectionTitle title="Atividades no IDSLM" />
              <div className="flex flex-wrap gap-2">
                {selectedInterview.terapias.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>

              <SectionTitle title="Escolaridade" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <InfoLine label="Idade de inicio na escola" value={selectedInterview.idadeInicioEscola} />
                <InfoLine label="Adaptacao" value={selectedInterview.adaptacao} />
                <InfoLine label="Escola atual" value={selectedInterview.escolaAtual} />
                <InfoLine label="Serie" value={selectedInterview.serie} />
                <InfoLine label="Turno" value={selectedInterview.turno} />
                <InfoLine label="Horario" value={selectedInterview.horario} />
                <InfoLine label="Alguma repeticao" value={selectedInterview.repeticao} />
                <InfoLine label="Rendimento atual" value={selectedInterview.rendimento} />
              </div>

              <SectionTitle title="Composicao familiar" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <InfoLine label="Status dos pais" value={selectedInterview.statusPais} />
                <InfoLine label="Relacionamento em casa" value={selectedInterview.relacionamentoCasa} />
              </div>
              {selectedInterview.membrosFamilia.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Parentesco</TableHead>
                      <TableHead>Sexo</TableHead>
                      <TableHead>Estado civil</TableHead>
                      <TableHead>Idade</TableHead>
                      <TableHead>Escolaridade</TableHead>
                      <TableHead>Profissao</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedInterview.membrosFamilia.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.nome}</TableCell>
                        <TableCell>{m.parentesco}</TableCell>
                        <TableCell>{m.sexo}</TableCell>
                        <TableCell>{m.estadoCivil}</TableCell>
                        <TableCell>{m.idade}</TableCell>
                        <TableCell>{m.escolaridade}</TableCell>
                        <TableCell>{m.profissao}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum membro informado.</p>
              )}

              <SectionTitle title="Responsaveis e beneficios" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <InfoLine label="Ocupacao da mae" value={selectedInterview.ocupacaoMae} />
                <InfoLine label="Renda da mae" value={selectedInterview.rendaMae} />
                <InfoLine label="Local de trabalho (mae)" value={selectedInterview.localTrabalhoMae} />
                <InfoLine label="Ocupacao do pai" value={selectedInterview.ocupacaoPai} />
                <InfoLine label="Renda do pai" value={selectedInterview.rendaPai} />
                <InfoLine label="Local de trabalho (pai)" value={selectedInterview.localTrabalhoPai} />
                <InfoLine label="Ocupacao do responsavel" value={selectedInterview.ocupacaoResponsavel} />
                <InfoLine label="Renda do responsavel" value={selectedInterview.rendaResponsavel} />
                <InfoLine
                  label="Local de trabalho (responsavel)"
                  value={selectedInterview.localTrabalhoResponsavel}
                />
                <InfoLine label="CRAS de referencia" value={selectedInterview.crasReferencia} />
                <InfoLine
                  label="Bolsa Familia"
                  value={selectedInterview.bolsaFamilia ? `Sim (R$ ${selectedInterview.valorBolsaFamilia})` : "Nao"}
                />
                <InfoLine
                  label="BPC"
                  value={selectedInterview.bpc ? `Sim (R$ ${selectedInterview.valorBpc})` : "Nao"}
                />
              </div>

              <SectionTitle title="Acolhimento e moradia" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <InfoLine label="Quem fica com a crianca" value={selectedInterview.quemCuida} />
                <InfoLine
                  label="Terapia em outra instituicao"
                  value={
                    selectedInterview.terapiaOutraInstituicao
                      ? selectedInterview.qualTerapiaOutra || "Sim"
                      : "Nao"
                  }
                />
                <InfoLine label="Tipo de moradia" value={selectedInterview.tipoMoradia} />
                <InfoLine label="Observacoes de moradia" value={selectedInterview.observacoesMoradia} />
                <InfoLine label="Valor pago" value={selectedInterview.valorMoradia || "-"} />
                <InfoLine label="Numero de comodos" value={selectedInterview.numeroComodos} />
                <InfoLine label="Tratamento da agua" value={selectedInterview.tratamentoAgua} />
                <InfoLine label="Tipo de iluminacao" value={selectedInterview.tipoIluminacao} />
                <InfoLine label="Escoamento sanitario" value={selectedInterview.escoamentoSanitario} />
                <InfoLine label="Destino do lixo" value={selectedInterview.destinoLixo} />
                <InfoLine label="Observacoes gerais" value={selectedInterview.observacoesGerais} />
              </div>

              <SectionTitle title="Parecer social" />
              <div className="border rounded-md p-3 text-sm whitespace-pre-wrap">
                {selectedInterview.parecerSocial || "Nao preenchido"}
              </div>

              <SectionTitle title="Resultado da avaliacao dos terapeutas" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <InfoLine
                  label="Data da avaliacao"
                  value={
                    selectedInterview.dataResultadoTerapeutas
                      ? formatDate(selectedInterview.dataResultadoTerapeutas)
                      : "-"
                  }
                />
                <InfoLine
                  label="Resultado"
                  value={selectedInterview.resultadoTerapeutas || "Aguardando atualizacao pelo modulo clinico"}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Layout>
  );
}
