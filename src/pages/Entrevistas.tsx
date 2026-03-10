import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useModulePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, FileText, Loader2, Plus, Printer, Save } from "lucide-react";
import { apiService, type SocialInterviewMutationResponse } from "@/services/api";

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

type SocialInterviewRecord = SocialInterviewDraft & { id: string; isDraft: boolean };

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
  status?: string;
  statusJornada?: string;
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

const ENABLE_MOCK_FALLBACK =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_ENABLE_ENTREVISTAS_MOCK_FALLBACK || "")
    .trim()
    .toLowerCase() === "true";

const JOURNEY_STATUS_LABELS: Record<string, string> = {
  em_fila_espera: "Em fila de espera",
  entrevista_realizada: "Entrevista realizada",
  em_avaliacao: "Em avaliacao multidisciplinar",
  em_analise_vaga: "Em analise de vaga",
  aprovado: "Aprovado",
  encaminhado: "Encaminhado",
  matriculado: "Matriculado",
  ativo: "Ativo",
  inativo_assistencial: "Inativo assistencial",
  desligado: "Desligado",
};

const createEmptyDraft = (paciente?: Paciente): SocialInterviewDraft => ({
  dataEntrevista: new Date().toISOString().slice(0, 10),
  assistenteSocial: "",
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
  possuiWhatsApp: false,
  possuiLaudo: false,
  cids: "",
  rg: "",
  cpf: paciente?.cpf ?? "",
  certidaoNascimento: "",
  possuiCarteiraVacinacao: false,
  encaminhadaPor: "",
  motivoEncaminhamento: "",
  postoSaude: "",
  enderecoPosto: "",
  dataUltimaConsulta: "",
  especialidadeUltimaConsulta: "",
  terapias: [],
  idadeInicioEscola: "",
  adaptacao: "",
  escolaAtual: "",
  serie: "",
  turno: "",
  horario: "",
  repeticao: "",
  rendimento: "",
  membrosFamilia: [],
  statusPais: "",
  relacionamentoCasa: "",
  ocupacaoMae: "",
  rendaMae: "",
  localTrabalhoMae: "",
  ocupacaoPai: "",
  rendaPai: "",
  localTrabalhoPai: "",
  ocupacaoResponsavel: "",
  rendaResponsavel: "",
  localTrabalhoResponsavel: "",
  crasReferencia: "",
  bolsaFamilia: false,
  valorBolsaFamilia: "",
  bpc: false,
  valorBpc: "",
  quemCuida: "",
  terapiaOutraInstituicao: false,
  qualTerapiaOutra: "",
  tipoMoradia: "",
  observacoesMoradia: "",
  valorMoradia: "",
  numeroComodos: "",
  tratamentoAgua: "",
  tipoIluminacao: "",
  escoamentoSanitario: "",
  destinoLixo: "",
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

type JsonRecord = Record<string, unknown>;
type SocialInterviewApiDto = JsonRecord;
type PatientApiDto = JsonRecord;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseRecord = (value: unknown): JsonRecord => {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const coerceString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return "";
};

const coerceBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "sim", "yes", "t"].includes(normalized)) return true;
    if (["false", "0", "nao", "não", "no", "f"].includes(normalized)) return false;
  }
  return false;
};

const coerceStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceString(item))
      .filter((item) => item.length > 0);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => coerceString(item))
          .filter((item) => item.length > 0);
      }
    } catch {
      // Segue como lista CSV.
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
};

const coerceFamilyMembers = (value: unknown): FamilyMember[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!isRecord(item)) return null;
      return {
        id: coerceString(item.id) || `membro-${index + 1}`,
        nome: coerceString(item.nome),
        parentesco: coerceString(item.parentesco),
        sexo: coerceString(item.sexo),
        estadoCivil: coerceString(item.estadoCivil ?? item.estado_civil),
        idade: coerceString(item.idade),
        escolaridade: coerceString(item.escolaridade),
        profissao: coerceString(item.profissao),
      };
    })
    .filter((member): member is FamilyMember => member !== null);
};

const pickFieldValue = (sources: JsonRecord[], ...keys: string[]): unknown => {
  for (const key of keys) {
    for (const source of sources) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = source[key];
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      return value;
    }
  }
  return undefined;
};

const stringField = (sources: JsonRecord[], ...keys: string[]) =>
  coerceString(pickFieldValue(sources, ...keys));

const numberStringField = (sources: JsonRecord[], ...keys: string[]) => {
  const value = pickFieldValue(sources, ...keys);
  if (value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return coerceString(value);
};

const booleanField = (sources: JsonRecord[], ...keys: string[]) =>
  coerceBoolean(pickFieldValue(sources, ...keys));

const formatJourneyStatus = (rawStatus: string | undefined) => {
  const normalized = (rawStatus || "").trim().toLowerCase();
  if (!normalized) return "Nao informado";
  if (JOURNEY_STATUS_LABELS[normalized]) return JOURNEY_STATUS_LABELS[normalized];
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const normalizePatientFromApi = (dto: PatientApiDto): Paciente | null => {
  const source = parseRecord(dto);
  const id = stringField([source], "id");
  if (!id) return null;
  return {
    id,
    nome: stringField([source], "nome", "name"),
    name: stringField([source], "name"),
    dataNascimento: stringField([source], "dataNascimento", "date_of_birth"),
    sexo: stringField([source], "sexo", "gender"),
    corRaca: stringField([source], "corRaca", "race"),
    mae: stringField([source], "mae"),
    corMae: stringField([source], "corMae"),
    pai: stringField([source], "pai"),
    corPai: stringField([source], "corPai"),
    responsavel: stringField([source], "responsavel"),
    cpfResponsavel: stringField([source], "cpfResponsavel", "cpf_responsavel"),
    endereco: stringField([source], "endereco", "address"),
    bairro: stringField([source], "bairro", "neighborhood"),
    cep: stringField([source], "cep", "zip_code"),
    referencia: stringField([source], "referencia"),
    telefones: stringField([source], "telefones", "telefone", "phone", "mobile"),
    cpf: stringField([source], "cpf"),
    status: stringField([source], "status"),
    statusJornada: stringField([source], "status_jornada", "statusJornada"),
  };
};

const extractInterviewList = (raw: unknown): SocialInterviewApiDto[] => {
  if (Array.isArray(raw)) {
    return raw.filter(isRecord);
  }
  if (!isRecord(raw)) return [];

  if (Array.isArray(raw.interviews)) {
    return raw.interviews.filter(isRecord);
  }
  if (Array.isArray(raw.entrevistas)) {
    return raw.entrevistas.filter(isRecord);
  }
  if (isRecord(raw.interview)) {
    return [raw.interview];
  }

  return [];
};

const mapFromApi = (dto: SocialInterviewApiDto): SocialInterviewRecord => {
  const root = parseRecord(dto);
  const payload = parseRecord(root.payload);
  const sources = [payload, root];
  const parecerSocial = stringField(sources, "parecer_social", "parecerSocial");
  const draftFlagRaw = pickFieldValue(sources, "is_draft", "isDraft");
  const isDraft = draftFlagRaw === undefined ? parecerSocial.trim().length === 0 : coerceBoolean(draftFlagRaw);

  return {
    id: stringField([root], "id") || gerarId(),
    isDraft,
    dataEntrevista: stringField(sources, "interview_date", "data_entrevista", "dataEntrevista"),
    assistenteSocial: stringField(
      sources,
      "assistente_social",
      "assistente_social_id",
      "assistenteSocial"
    ),
    atendidoId: stringField(sources, "patient_id", "atendido_id", "atendidoId"),
    atendidoNome: stringField(sources, "atendido_nome", "atendidoNome", "nome"),
    dataNascimento: stringField(sources, "data_nascimento", "dataNascimento", "date_of_birth"),
    sexo: stringField(sources, "sexo"),
    corRaca: stringField(sources, "cor_raca", "corRaca", "raca"),
    mae: stringField(sources, "mae"),
    corMae: stringField(sources, "cor_mae", "corMae"),
    pai: stringField(sources, "pai"),
    corPai: stringField(sources, "cor_pai", "corPai"),
    responsavel: stringField(sources, "responsavel"),
    cpfResponsavel: stringField(sources, "cpf_responsavel", "cpfResponsavel"),
    endereco: stringField(sources, "endereco", "address"),
    bairro: stringField(sources, "bairro", "neighborhood"),
    cep: stringField(sources, "cep", "zip_code"),
    referencia: stringField(sources, "referencia"),
    telefones: stringField(sources, "telefones", "telefone", "phone", "mobile"),
    possuiWhatsApp: booleanField(sources, "possui_whatsapp", "possuiWhatsApp"),
    possuiLaudo: booleanField(sources, "possui_laudo", "possuiLaudo"),
    cids: stringField(sources, "cids", "cid"),
    rg: stringField(sources, "rg"),
    cpf: stringField(sources, "cpf"),
    certidaoNascimento: stringField(
      sources,
      "certidao_nascimento",
      "certidaoNascimento"
    ),
    possuiCarteiraVacinacao: booleanField(
      sources,
      "possui_carteira_vacinacao",
      "possuiCarteiraVacinacao"
    ),
    encaminhadaPor: stringField(sources, "encaminhada_por", "encaminhadaPor"),
    motivoEncaminhamento: stringField(
      sources,
      "motivo_encaminhamento",
      "motivoEncaminhamento"
    ),
    postoSaude: stringField(sources, "posto_saude", "postoSaude"),
    enderecoPosto: stringField(sources, "endereco_posto", "enderecoPosto"),
    dataUltimaConsulta: stringField(
      sources,
      "data_ultima_consulta",
      "dataUltimaConsulta"
    ),
    especialidadeUltimaConsulta: stringField(
      sources,
      "especialidade_ultima_consulta",
      "especialidadeUltimaConsulta"
    ),
    terapias: coerceStringArray(pickFieldValue(sources, "terapias")),
    idadeInicioEscola: numberStringField(
      sources,
      "idade_inicio_escola",
      "idadeInicioEscola"
    ),
    adaptacao: stringField(sources, "adaptacao"),
    escolaAtual: stringField(sources, "escola_atual", "escolaAtual"),
    serie: stringField(sources, "serie"),
    turno: stringField(sources, "turno"),
    horario: stringField(sources, "horario"),
    repeticao: stringField(sources, "repeticao"),
    rendimento: stringField(sources, "rendimento"),
    membrosFamilia: coerceFamilyMembers(
      pickFieldValue(sources, "membros_familia", "membrosFamilia")
    ),
    statusPais: stringField(sources, "status_pais", "statusPais"),
    relacionamentoCasa: stringField(
      sources,
      "relacionamento_casa",
      "relacionamentoCasa"
    ),
    ocupacaoMae: stringField(sources, "ocupacao_mae", "ocupacaoMae"),
    rendaMae: numberStringField(sources, "renda_mae", "rendaMae"),
    localTrabalhoMae: stringField(sources, "local_trabalho_mae", "localTrabalhoMae"),
    ocupacaoPai: stringField(sources, "ocupacao_pai", "ocupacaoPai"),
    rendaPai: numberStringField(sources, "renda_pai", "rendaPai"),
    localTrabalhoPai: stringField(sources, "local_trabalho_pai", "localTrabalhoPai"),
    ocupacaoResponsavel: stringField(
      sources,
      "ocupacao_responsavel",
      "ocupacaoResponsavel"
    ),
    rendaResponsavel: numberStringField(
      sources,
      "renda_responsavel",
      "rendaResponsavel"
    ),
    localTrabalhoResponsavel: stringField(
      sources,
      "local_trabalho_responsavel",
      "localTrabalhoResponsavel"
    ),
    crasReferencia: stringField(sources, "cras_referencia", "crasReferencia"),
    bolsaFamilia: booleanField(sources, "bolsa_familia", "bolsaFamilia"),
    valorBolsaFamilia: numberStringField(
      sources,
      "valor_bolsa_familia",
      "valorBolsaFamilia"
    ),
    bpc: booleanField(sources, "bpc"),
    valorBpc: numberStringField(sources, "valor_bpc", "valorBpc"),
    quemCuida: stringField(sources, "quem_cuida", "quemCuida"),
    terapiaOutraInstituicao: booleanField(
      sources,
      "terapia_outra_instituicao",
      "terapiaOutraInstituicao"
    ),
    qualTerapiaOutra: stringField(sources, "qual_terapia_outra", "qualTerapiaOutra"),
    tipoMoradia: stringField(sources, "tipo_moradia", "tipoMoradia"),
    observacoesMoradia: stringField(
      sources,
      "observacoes_moradia",
      "observacoesMoradia"
    ),
    valorMoradia: numberStringField(sources, "valor_moradia", "valorMoradia"),
    numeroComodos: numberStringField(sources, "numero_comodos", "numeroComodos"),
    tratamentoAgua: stringField(sources, "tratamento_agua", "tratamentoAgua"),
    tipoIluminacao: stringField(sources, "tipo_iluminacao", "tipoIluminacao"),
    escoamentoSanitario: stringField(
      sources,
      "escoamento_sanitario",
      "escoamentoSanitario"
    ),
    destinoLixo: stringField(sources, "destino_lixo", "destinoLixo"),
    observacoesGerais: stringField(
      sources,
      "observacoes_gerais",
      "observacoesGerais"
    ),
    parecerSocial,
    resultadoTerapeutas: stringField(
      sources,
      "resultado_terapeutas",
      "resultadoTerapeutas"
    ),
    dataResultadoTerapeutas: stringField(
      sources,
      "data_resultado_terapeutas",
      "dataResultadoTerapeutas"
    ),
  };
};

const mapToApi = (draft: SocialInterviewDraft, patientId?: string) => {
  const isDraft = draft.parecerSocial.trim().length === 0;

  return {
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
    is_draft: isDraft,
    status_entrevista: isDraft ? "rascunho" : "concluida",
  };
};

export default function Entrevistas() {
  const { toast } = useToast();
  const entrevistasPermissions = useModulePermissions("entrevistas");
  const [viewMode, setViewMode] = useState<"list" | "create" | "view">("list");
  const [patients, setPatients] = useState<Paciente[]>([]);
  const [selectedPacienteId, setSelectedPacienteId] = useState("");
  const [draft, setDraft] = useState<SocialInterviewDraft>(createEmptyDraft());
  const [entrevistas, setEntrevistas] = useState<SocialInterviewRecord[]>([]);
  const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(null);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [interviewsLoading, setInterviewsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [interviewsError, setInterviewsError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);

  const selectedInterview = useMemo(
    () => entrevistas.find((ent) => ent.id === selectedInterviewId),
    [entrevistas, selectedInterviewId]
  );
  const patientOptions = patients;
  const selectedPaciente = useMemo(
    () => patientOptions.find((paciente) => paciente.id === selectedPacienteId) ?? null,
    [patientOptions, selectedPacienteId]
  );
  const selectedJourneyStatusLabel = formatJourneyStatus(selectedPaciente?.statusJornada);
  const isEditingInterview = viewMode === "create" && Boolean(selectedInterviewId);
  const canCreateInterview = entrevistasPermissions.canCreate;
  const canEditInterview = entrevistasPermissions.canEdit;
  const canStartInterview = Boolean(selectedPacienteId);
  const canPersistInterview =
    Boolean(selectedPacienteId) &&
    !usingMockData &&
    (selectedInterviewId ? canEditInterview : canCreateInterview);

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true);
    setPatientsError(null);
    setUsingMockData(false);
    try {
      const data = await apiService.getPatients();
      const normalized = (Array.isArray(data) ? data : [])
        .map((dto) => (isRecord(dto) ? normalizePatientFromApi(dto) : null))
        .filter((patient): patient is Paciente => patient !== null);

      if (normalized.length === 0) {
        setPatients([]);
        setSelectedPacienteId("");
        setDraft(createEmptyDraft());
        setEntrevistas([]);
        setSelectedInterviewId(null);
        setViewMode("list");
        return;
      }

      const first = normalized[0];
      setPatients(normalized);
      setSelectedPacienteId(first.id);
      setDraft(createEmptyDraft(first));
      setEntrevistas([]);
      setSelectedInterviewId(null);
      setViewMode("list");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel carregar atendidos.";

      if (ENABLE_MOCK_FALLBACK) {
        const firstMock = pacientesMock[0];
        setUsingMockData(true);
        setPatients(pacientesMock);
        setSelectedPacienteId(firstMock?.id ?? "");
        setDraft(createEmptyDraft(firstMock));
        setEntrevistas([]);
        setSelectedInterviewId(null);
        setViewMode("list");
        setPatientsError(
          "Falha ao carregar atendidos reais. Modo mock ativo para desenvolvimento local."
        );
      } else {
        setPatients([]);
        setSelectedPacienteId("");
        setDraft(createEmptyDraft());
        setEntrevistas([]);
        setSelectedInterviewId(null);
        setViewMode("list");
        setPatientsError(
          "Nao foi possivel carregar os atendidos. Verifique permissao de acesso e tente novamente."
        );
      }

      toast({
        title: "Falha ao carregar atendidos",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPatientsLoading(false);
    }
  }, [toast]);

  const loadInterviews = useCallback(async (
    patientId: string,
    options: {
      preferredInterviewId?: string | null;
      preserveCreateMode?: boolean;
      fallbackPaciente?: Paciente | null;
    } = {}
  ): Promise<boolean> => {
    const preferredInterviewId = options.preferredInterviewId ?? null;
    const preserveCreateMode = options.preserveCreateMode === true;
    const fallbackPaciente = options.fallbackPaciente ?? null;

    if (!patientId) {
      setEntrevistas([]);
      setSelectedInterviewId(null);
      setInterviewsError(null);
      if (!preserveCreateMode) setViewMode("list");
      return false;
    }

    setInterviewsLoading(true);
    setInterviewsError(null);
    try {
      const data = await apiService.getSocialInterviews(patientId);
      const pacienteAtual = fallbackPaciente;
      const mapped = extractInterviewList(data).map((dto) => {
        const mappedInterview = mapFromApi(dto);
        return {
          ...mappedInterview,
          atendidoId: mappedInterview.atendidoId || patientId,
          atendidoNome:
            mappedInterview.atendidoNome || pacienteAtual?.nome || pacienteAtual?.name || "",
          dataNascimento:
            mappedInterview.dataNascimento || pacienteAtual?.dataNascimento || "",
        };
      });
      setEntrevistas(mapped);

      if (mapped.length === 0) {
        setSelectedInterviewId(null);
        if (!preserveCreateMode) {
          setDraft(createEmptyDraft(pacienteAtual ?? undefined));
          setViewMode("list");
        }
        return false;
      }

      const candidateId =
        preferredInterviewId && mapped.some((ent) => ent.id === preferredInterviewId)
          ? preferredInterviewId
          : mapped[0].id;
      const interviewToShow = mapped.find((ent) => ent.id === candidateId) ?? mapped[0];
      setSelectedInterviewId(interviewToShow.id);

      if (!preserveCreateMode) {
        const { id: _id, ...rest } = interviewToShow;
        setDraft(rest);
        setViewMode("view");
      }
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar entrevistas sociais.";
      setEntrevistas([]);
      setSelectedInterviewId(null);
      setInterviewsError(
        "Nao foi possivel carregar as entrevistas deste atendido. Tente novamente."
      );
      if (!preserveCreateMode) {
        setViewMode("list");
      }
      toast({
        title: "Falha ao carregar entrevistas",
        description: message,
        variant: "destructive",
      });
      return false;
    } finally {
      setInterviewsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (!selectedPacienteId) {
      setEntrevistas([]);
      setSelectedInterviewId(null);
      setInterviewsError(null);
      setViewMode("list");
      return;
    }
    void loadInterviews(selectedPacienteId, { fallbackPaciente: selectedPaciente });
  }, [selectedPaciente, selectedPacienteId, loadInterviews]);

  useEffect(() => {
    if (viewMode !== "view" || !selectedInterview) return;
    const { id: _id, ...rest } = selectedInterview;
    setDraft(rest);
  }, [selectedInterview, viewMode]);

  const handleSelectPaciente = (id: string) => {
    setSelectedPacienteId(id);
    const paciente = patientOptions.find((p) => p.id === id);
    setDraft(createEmptyDraft(paciente));
    setSelectedInterviewId(null);
    setEntrevistas([]);
    setInterviewsError(null);
    setSaveSuccessMessage(null);
    setViewMode("list");
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
    if (!canCreateInterview) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil possui apenas visualizacao de entrevistas sociais.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedPacienteId) {
      toast({
        title: "Selecione um atendido",
        description: "Escolha um atendido antes de iniciar uma nova entrevista social.",
        variant: "destructive",
      });
      return;
    }
    const paciente = patientOptions.find((p) => p.id === selectedPacienteId);
    setDraft(createEmptyDraft(paciente));
    setViewMode("create");
    setSelectedInterviewId(null);
    setSaveSuccessMessage(null);
  };

  const handleSave = async () => {
    const isUpdate = Boolean(selectedInterviewId);
    if (isUpdate && !canEditInterview) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil nao pode editar entrevistas sociais.",
        variant: "destructive",
      });
      return;
    }

    if (!isUpdate && !canCreateInterview) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil nao pode criar entrevistas sociais.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedPacienteId) {
      toast({
        title: "Selecione um atendido",
        description: "A entrevista precisa estar vinculada ao cadastro canonico do atendido.",
        variant: "destructive",
      });
      return;
    }

    if (usingMockData) {
      toast({
        title: "Persistencia bloqueada no modo mock",
        description:
          "Desative o fallback mock e recarregue os dados reais antes de salvar entrevistas.",
        variant: "destructive",
      });
      return;
    }

    if (!draft.dataEntrevista) {
      toast({
        title: "Data obrigatoria",
        description: "Informe a data da entrevista social.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    setSaveSuccessMessage(null);
    try {
      const payload = mapToApi(draft, selectedPacienteId);
      let mutationResult: SocialInterviewMutationResponse | null = null;
      if (isUpdate && selectedInterviewId) {
        mutationResult = await apiService.updateSocialInterview(selectedInterviewId, payload);
      } else {
        mutationResult = await apiService.createSocialInterview(payload);
      }
      const reloaded = await loadInterviews(selectedPacienteId, {
        preferredInterviewId: selectedInterviewId,
        preserveCreateMode: true,
        fallbackPaciente: selectedPaciente,
      });
      setViewMode(reloaded ? "view" : "list");
      const savedAsDraft = mutationResult?.interview?.is_draft === true;
      const transitionChanged = mutationResult?.status_transition?.changed === true;
      const regressionPrevented =
        mutationResult?.status_transition?.regression_prevented === true;
      const successMessage =
        mutationResult?.message ||
        (savedAsDraft
          ? "Entrevista social salva como rascunho."
          : isUpdate
            ? "Entrevista social atualizada com sucesso."
            : "Entrevista social registrada com sucesso.");

      setSaveSuccessMessage(successMessage);
      toast({
        title: savedAsDraft
          ? "Rascunho salvo"
          : isUpdate
            ? "Entrevista atualizada"
            : "Entrevista registrada",
        description: savedAsDraft
          ? "Status da jornada nao foi alterado porque a entrevista ainda esta em rascunho."
          : regressionPrevented
            ? "Entrevista concluida sem regressao de jornada; status mais avancado foi preservado."
            : transitionChanged
              ? "Entrevista concluida e status da jornada atualizado para entrevista_realizada."
              : "Entrevista concluida sem necessidade de nova transicao de status.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel salvar a entrevista social.";
      toast({
        title: "Erro ao salvar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleVisualizar = (id: string) => {
    const interview = entrevistas.find((ent) => ent.id === id);
    if (!interview) return;
    const { id: _id, ...rest } = interview;
    setDraft(rest);
    setSelectedInterviewId(id);
    setViewMode("view");
    setSaveSuccessMessage(null);
  };

  const handleEditar = () => {
    if (!canEditInterview) {
      toast({
        title: "Permissao insuficiente",
        description: "Seu perfil nao pode editar entrevistas sociais.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedInterview) return;
    const { id: _id, ...rest } = selectedInterview;
    setDraft(rest);
    setViewMode("create");
    setSaveSuccessMessage(null);
  };

  const handleExportar = () => {
    window.print();
  };

  const estatisticas = {
    total: entrevistas.length,
    pendentesResultado: entrevistas.filter((e) => !e.resultadoTerapeutas).length,
    comParecer: entrevistas.filter((e) => !!e.parecerSocial).length,
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entrevistas Sociais</h1>
          <p className="text-sm text-muted-foreground">
            Etapa formal do Servico Social na jornada institucional do assistido.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleNovaEntrevista}
            disabled={!canStartInterview || patientsLoading || !canCreateInterview}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova Entrevista Social
          </Button>
          {selectedInterview ? (
            <Button variant="outline" onClick={handleExportar}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir / Exportar PDF
            </Button>
          ) : null}
        </div>
      </div>

      {patientsError ? (
        <Alert variant={usingMockData ? "default" : "destructive"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {usingMockData ? "Modo de desenvolvimento com mock" : "Falha ao carregar atendidos"}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{patientsError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void loadPatients();
              }}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {saveSuccessMessage ? (
        <Alert>
          <AlertTitle>Entrevista social salva</AlertTitle>
          <AlertDescription>{saveSuccessMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Total de entrevistas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{estatisticas.total}</div>
            <p className="text-xs text-muted-foreground">Dossies sociais cadastrados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Com parecer social</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{estatisticas.comParecer}</div>
            <p className="text-xs text-muted-foreground">Registros com parecer preenchido</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Pendentes de resultado clinico</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{estatisticas.pendentesResultado}</div>
            <p className="text-xs text-muted-foreground">Aguardando resultado dos terapeutas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selecao do atendido</CardTitle>
              <CardDescription>Use o cadastro canonico para iniciar ou consultar dossies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {patientsLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando atendidos...
                </p>
              ) : null}
              <div>
                <label className="text-sm font-medium">Selecionar atendido</label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={selectedPacienteId}
                  onChange={(e) => handleSelectPaciente(e.target.value)}
                  disabled={patientsLoading || patientOptions.length === 0}
                >
                  {patientOptions.length === 0 ? (
                    <option value="">Nenhum atendido disponivel</option>
                  ) : (
                    patientOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome || p.name || "Paciente"} - {p.cpfResponsavel || p.cpf || "sem CPF"}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {selectedPaciente ? (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <InfoLine label="Atendido" value={selectedPaciente.nome || selectedPaciente.name || "-"} />
                  <InfoLine label="Data de nascimento" value={formatDate(selectedPaciente.dataNascimento)} />
                  <InfoLine label="Responsavel" value={selectedPaciente.responsavel || "-"} />
                  <InfoLine label="Contato" value={selectedPaciente.telefones || "-"} />

                  <div className="space-y-2 rounded-md border bg-background p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Status da jornada</span>
                      <Badge variant="secondary">{selectedJourneyStatusLabel}</Badge>
                    </div>
                    <InfoLine label="Etapa atual" value="Entrevista Social" />
                    <InfoLine label="Proxima etapa prevista" value="Avaliacao Multidisciplinar" />
                  </div>
                </div>
              ) : !patientsLoading ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum atendido selecionado. Carregue os dados para iniciar a etapa social.
                </p>
              ) : null}

              <Button
                className="w-full"
                onClick={handleNovaEntrevista}
                disabled={!canStartInterview || patientsLoading || !canCreateInterview}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova Entrevista Social
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Dossies cadastrados
              </CardTitle>
              <CardDescription>Entrevistas registradas para o atendido selecionado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!selectedPacienteId ? (
                <p className="text-sm text-muted-foreground">
                  Selecione um atendido para listar os dossies sociais registrados.
                </p>
              ) : null}

              {selectedPacienteId && interviewsLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando entrevistas...
                </p>
              ) : null}

              {selectedPacienteId && interviewsError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Erro na lista de entrevistas</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{interviewsError}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void loadInterviews(selectedPacienteId, {
                          preferredInterviewId: selectedInterviewId,
                          fallbackPaciente: selectedPaciente,
                        });
                      }}
                    >
                      Recarregar entrevistas
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {selectedPacienteId &&
              !interviewsLoading &&
              !interviewsError &&
              entrevistas.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  <p>Nenhuma entrevista registrada para este atendido.</p>
                  <p className="mt-1">Inicie uma nova entrevista social para continuar o fluxo institucional.</p>
                  <Button
                    className="mt-3"
                    size="sm"
                    onClick={handleNovaEntrevista}
                    disabled={!canStartInterview || !canCreateInterview}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Entrevista Social
                  </Button>
                </div>
              ) : null}

              {selectedPacienteId && !interviewsLoading && !interviewsError
                ? entrevistas.map((ent) => (
                    <div
                      key={ent.id}
                      className={`rounded-md border p-3 ${
                        selectedInterviewId === ent.id ? "border-primary bg-primary/5" : "bg-background"
                      }`}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{ent.atendidoNome || "Atendido sem nome"}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(ent.dataEntrevista)} - {ent.assistenteSocial || "Assistente social nao informado"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {ent.isDraft ? (
                            <Badge variant="secondary">Rascunho</Badge>
                          ) : (
                            <Badge variant="outline">Concluida</Badge>
                          )}
                          {ent.resultadoTerapeutas ? (
                            <Badge variant="outline">Integrado ao modulo clinico</Badge>
                          ) : (
                            <Badge variant="secondary">Aguardando</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-3">
                        <Button size="sm" variant="outline" onClick={() => handleVisualizar(ent.id)}>
                          Visualizar
                        </Button>
                      </div>
                    </div>
                  ))
                : null}
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-4">
          {viewMode === "create" ? (
          <Card id="form-entrevista">
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>{isEditingInterview ? "Editar Entrevista Social" : "Nova Entrevista Social"}</CardTitle>
                <CardDescription>
                  {isEditingInterview
                    ? "Ajuste o dossie social sem perder o historico da etapa."
                    : "Formulario baseado no modelo oficial do IDSLM."}
                </CardDescription>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">Etapa atual: Entrevista Social</Badge>
                  <Badge variant="outline">Proxima etapa: Avaliacao Multidisciplinar</Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setViewMode(selectedInterviewId ? "view" : "list")}
                >
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={!canPersistInterview || saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {isEditingInterview ? "Salvar alteracoes" : "Salvar dossie"}
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-8">
              {usingMockData ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Salvamento desabilitado</AlertTitle>
                  <AlertDescription>
                    A tela esta em modo mock para desenvolvimento. Recarregue os atendidos reais
                    antes de persistir o dossie social.
                  </AlertDescription>
                </Alert>
              ) : null}

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
                    disabled={patientOptions.length === 0}
                  >
                    {patientOptions.length === 0 ? (
                      <option value="">Nenhum atendido disponivel</option>
                    ) : (
                      patientOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome || p.name}
                        </option>
                      ))
                    )}
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
                    <option value="">Selecione</option>
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

              <div className="space-y-3 rounded-md border border-dashed bg-muted/20 p-4">
                <SectionTitle
                  title="Integracao com avaliacao tecnica"
                  description="Bloco de transicao para a etapa seguinte (nao substitui o parecer social)"
                />
                <p className="text-xs text-muted-foreground">
                  Use este campo somente para registrar devolutivas tecnicas que alimentam a
                  continuidade do fluxo apos a entrevista social.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Data da avaliacao tecnica</label>
                    <Input
                      type="date"
                      value={draft.dataResultadoTerapeutas}
                      onChange={(e) => handleDraftChange("dataResultadoTerapeutas", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Resultado terapeutico / encaminhamento</label>
                    <Textarea
                      value={draft.resultadoTerapeutas}
                      onChange={(e) => handleDraftChange("resultadoTerapeutas", e.target.value)}
                      placeholder="Registro complementar para a proxima etapa."
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {viewMode === "view" && selectedInterview ? (
          <Card id="visualizacao-entrevista">
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>
                  Entrevista Social -{" "}
                  {selectedInterview.atendidoNome || selectedPaciente?.nome || "Atendido"}
                </CardTitle>
                <CardDescription>
                  {formatDate(selectedInterview.dataEntrevista)} | {selectedInterview.assistenteSocial}
                </CardDescription>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">Status da jornada: {selectedJourneyStatusLabel}</Badge>
                  <Badge variant="outline">Etapa atual: Entrevista Social</Badge>
                  <Badge variant="outline">Proxima etapa: Avaliacao Multidisciplinar</Badge>
                  {selectedInterview.isDraft ? (
                    <Badge variant="secondary">Registro em rascunho</Badge>
                  ) : (
                    <Badge variant="outline">Entrevista concluida</Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleEditar} disabled={!canEditInterview}>
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

              <div className="space-y-3 rounded-md border border-dashed bg-muted/20 p-4">
                <SectionTitle
                  title="Integracao com avaliacao tecnica"
                  description="Informacao complementar para transicao de etapa"
                />
                <p className="text-xs text-muted-foreground">
                  Este trecho apoia a passagem para avaliacao multidisciplinar e nao representa o
                  nucleo do parecer social.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <InfoLine
                    label="Data da avaliacao tecnica"
                    value={
                      selectedInterview.dataResultadoTerapeutas
                        ? formatDate(selectedInterview.dataResultadoTerapeutas)
                        : "-"
                    }
                  />
                  <InfoLine
                    label="Resultado terapeutico"
                    value={
                      selectedInterview.resultadoTerapeutas ||
                      "Aguardando atualizacao pela avaliacao tecnica"
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {viewMode === "list" ? (
          <Card>
            <CardHeader>
              <CardTitle>Detalhe da entrevista</CardTitle>
              <CardDescription>
                {selectedPacienteId
                  ? "Selecione um dossie na coluna esquerda ou inicie uma nova entrevista social."
                  : "Carregue e selecione um atendido para operar a etapa de entrevista social."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedPacienteId ? (
                <p className="text-sm text-muted-foreground">
                  Sem atendido selecionado. A entrevista social depende do cadastro canonico da crianca.
                </p>
              ) : null}

              {selectedPacienteId && interviewsLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando dossies sociais...
                </p>
              ) : null}

              {selectedPacienteId && interviewsError ? (
                <p className="text-sm text-destructive">{interviewsError}</p>
              ) : null}

              {selectedPacienteId &&
              !interviewsLoading &&
              !interviewsError &&
              entrevistas.length === 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Ainda nao existe entrevista para este atendido. Inicie um novo dossie social.
                  </p>
                  <Button onClick={handleNovaEntrevista} disabled={!canStartInterview || !canCreateInterview}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Entrevista Social
                  </Button>
                </>
              ) : null}

              {selectedPacienteId &&
              !interviewsLoading &&
              !interviewsError &&
              entrevistas.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Selecione um dossie na coluna esquerda para visualizar ou editar.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        </div>
      </div>
    </div>
  );
}
