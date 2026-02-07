const SERVICE_LABELS: Record<string, string> = {
  Sessao: "Sessão",
  Avaliacao: "Avaliação",
  "Avaliacao Psicologica": "Avaliação Psicológica",
  "Orientacao Profissional": "Orientação Profissional",
  "Avaliacao Neuropsicologica": "Avaliação Neuropsicológica",
  "Avaliacao Vocacional": "Avaliação Vocacional",
  "Terapia Individual": "Terapia Individual",
  "Terapia em Grupo": "Terapia em Grupo",
};

export function getServiceLabel(name: string): string {
  return SERVICE_LABELS[name] || name;
}
