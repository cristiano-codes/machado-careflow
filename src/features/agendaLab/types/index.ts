export type LabStatus = "ativo" | "inativo";

export type Unit = {
  id: string;
  nome: string;
};

export type Professional = {
  id: string;
  nome: string;
  funcao: string;
  status: LabStatus;
};

export type Student = {
  id: string;
  nome: string;
  idade: number;
  status: LabStatus;
};

export type RoomType =
  | "terapia"
  | "multifuncional"
  | "pedagogica"
  | "sensorial"
  | "movimento"
  | "apoio";

export type RoomStatus = "ativa" | "manutencao" | "inativa";

export type Room = {
  id: string;
  unitId: string;
  codigo: string;
  nome: string;
  nomeConhecido: string;
  descricao: string;
  tipo: RoomType;
  capacidadeTotal: number;
  capacidadeRecomendada: number;
  localizacaoInterna: string;
  especialidadePrincipal: string;
  usoPreferencial: string;
  permiteUsoCompartilhado: boolean;
  status: RoomStatus;
  acessibilidade: string;
  equipamentos: string[];
  observacoes: string;
};

export type ActivityCategory =
  | "terapeutica"
  | "pedagogica"
  | "assistencial"
  | "expressiva"
  | "autonomia";

export type ActivityMode = "presencial" | "hibrido" | "externo";

export type ActivityAttendanceType = "individual" | "grupo";

export type ActivityStatus = "ativa" | "inativa" | "em_revisao";

export type Activity = {
  id: string;
  nome: string;
  categoria: ActivityCategory;
  descricao: string;
  duracaoPadraoMinutos: number;
  modalidade: ActivityMode;
  faixaEtariaSugerida: string;
  atendimentoTipo: ActivityAttendanceType;
  exigeSalaEspecifica: boolean;
  exigeEquipamento: boolean;
  corIdentificacao: string;
  status: ActivityStatus;
  observacoes: string;
};

export type ClassStatus = "ativa" | "planejada" | "pausada" | "encerrada";

export type GroupClass = {
  id: string;
  unitId: string;
  nome: string;
  activityId: string;
  descricao: string;
  objetivo: string;
  publicoAlvo: string;
  faixaEtaria: string;
  capacidadeMinima: number;
  capacidadeIdeal: number;
  capacidadeMaxima: number;
  status: ClassStatus;
  dataInicio: string;
  dataTermino: string | null;
  profissionalPrincipalId: string;
  profissionalApoioId: string | null;
  exigeSalaEspecifica: boolean;
  projetoConvenio: string;
  observacoes: string;
};

export type AllocationStatus = "ativa" | "planejada" | "suspensa";

export type AllocationRecurrence = "semanal" | "quinzenal" | "mensal";

export type Weekday = "seg" | "ter" | "qua" | "qui" | "sex" | "sab";

export type Allocation = {
  id: string;
  classId: string;
  weekday: Weekday;
  horaInicial: string;
  horaFinal: string;
  roomId: string;
  professionalId: string;
  recorrencia: AllocationRecurrence;
  status: AllocationStatus;
  observacao: string;
  vigenciaInicio?: string;
  vigenciaFim?: string | null;
};

export type EnrollmentStatus =
  | "ativo"
  | "aguardando_vaga"
  | "suspenso"
  | "desligado"
  | "concluido";

export type EnrollmentPriority = "alta" | "media" | "baixa";

export type StudentEnrollment = {
  id: string;
  classId: string;
  studentId: string;
  status: EnrollmentStatus;
  dataEntrada: string;
  dataSaida: string | null;
  prioridade: EnrollmentPriority;
  origemEncaminhamento: string;
  observacao: string;
};

export type LabDataset = {
  units: Unit[];
  professionals: Professional[];
  students: Student[];
  rooms: Room[];
  activities: Activity[];
  classes: GroupClass[];
  allocations: Allocation[];
  enrollments: StudentEnrollment[];
};
