# Rollout Supervisionado - Operacao da Unidade

## 1) Escopo desta fase
- Entrada em uso real supervisionado do dominio paralelo em `/operacao-unidade/*`.
- Controle de acesso por perfis via permissao.
- Checklist operacional de go-live para uso humano em homologacao/operacao.
- Definicao de criterios de saida para futura troca interna de `/agenda`.

## 2) Limites desta fase
- Nao troca a rota oficial `/agenda`.
- Nao remove agenda antiga.
- Nao muda fluxo institucional de jornada/status.
- Nao reativa fallback local silencioso.

## 3) Estado atual confirmado (codigo)
- Rotas oficiais do dominio:
  `/operacao-unidade/agenda`, `/operacao-unidade/salas`, `/operacao-unidade/atividades`, `/operacao-unidade/turmas`, `/operacao-unidade/grade`, `/operacao-unidade/matriculas`.
- Rota de entrada do modulo: `/operacao-unidade` (landing por permissao).
- Permissoes de leitura por tela:
  - Agenda de Turmas: `grade:view`
  - Salas: `salas:view`
  - Atividades: `atividades_unidade:view`
  - Turmas: `turmas:view`
  - Grade: `grade:view`
  - Matriculas: `matriculas:view`
- Permissoes de escrita (backend):
  `create`, `edit`, `status`, `allocate`, `enroll` por modulo.
- Fonte oficial de dados: API `/api/unit-operations/*`.

## 4) Diagnostico de prontidao para rollout

### 4.1 Diagnostico por area
- Acesso/rotas: **Pronto com ressalvas** (landing por permissao e guardas ativas; ainda requer validacao humana com perfis reais).
- RBAC backend: **Pronto com ressalvas** (autoriza por modulo/acao; monitorar matriz real de perfis).
- UX de convivio com agenda antiga: **Pronto com ressalvas** (rotas coexistem; ainda exige orientacao operacional curta para usuarios).
- Confiabilidade operacional: **Pronto com ressalvas** (hardening concluido; manter monitoracao nas primeiras ondas).

### 4.2 Diagnostico por perfil (entrada sugerida)
- Admin/Gestao: **Pronto** para leitura+escrita supervisionada.
- Coordenacao: **Pronto com ressalvas** para leitura+escrita supervisionada.
- Recepcao: **Pronto com ressalvas** para leitura ampla + escrita limitada (matriculas e ajustes autorizados).
- Equipe tecnica/profissionais: **Pronto com ressalvas** para leitura e, se aprovado, atualizacoes restritas.
- Usuario sem permissao relevante: **Pronto** para bloqueio (sem acesso ao modulo).

## 5) Estrategia de rollout por ondas (supervisionado)

### Onda 1 (semana 1)
- Perfis: admin/gestao + coordenacao.
- Escopo liberado: modulo completo (`salas`, `atividades_unidade`, `turmas`, `grade`, `matriculas`) com escrita.
- Objetivo: validar consistencia operacional ponta a ponta.
- Gate de passagem: nenhum erro critico de permissao, conflito ou dados.

### Onda 2 (semana 2)
- Perfis: recepcao.
- Escopo liberado: leitura de turmas/grade + escrita controlada em matriculas.
- Objetivo: validar fluxo de matricula em rotina real sem interferir na agenda antiga.
- Gate de passagem: duplicidade/superlotacao bloqueadas corretamente e sem falso sucesso.

### Onda 3 (semana 3+)
- Perfis: equipe tecnica/profissionais (conforme politica da unidade).
- Escopo liberado: leitura de agenda de turmas/grade, com escrita apenas se explicitamente concedida.
- Objetivo: consolidar uso diario com baixo risco.
- Gate de passagem: estabilidade de uso e ausencia de regressao institucional.

### Reversibilidade (todas as ondas)
- Reverter liberacao via permissoes sem alterar rotas.
- Manter `/agenda` oficial como fallback operacional institucional.

## 6) Checklist de go-live operacional (execucao humana)
Use este checklist por perfil e por unidade antes de ampliar a onda.

### 6.1 Acesso e navegacao
- [ ] Usuario autenticado acessa menu "Operacao da Unidade".
- [ ] `/operacao-unidade` redireciona para primeira tela permitida do perfil.
- [ ] Rotas sem permissao retornam bloqueio no frontend.
- [ ] API sem permissao retorna `403`.

### 6.2 Salas
- [ ] Criar sala valida.
- [ ] Editar sala existente.
- [ ] Alterar status.
- [ ] Validar erro de payload invalido (400/422 equivalente).

### 6.3 Atividades
- [ ] Criar atividade valida.
- [ ] Editar atividade existente.
- [ ] Alterar status.
- [ ] Validar mensagem de erro coerente.

### 6.4 Turmas
- [ ] Criar turma valida.
- [ ] Editar turma existente.
- [ ] Validar capacidade minima/ideal/maxima.
- [ ] Validar profissional principal/apoio.

### 6.5 Grade/Alocacoes
- [ ] Criar alocacao valida.
- [ ] Bloquear conflito de sala.
- [ ] Bloquear conflito de profissional.
- [ ] Editar horario e vigencia.

### 6.6 Matriculas
- [ ] Matricular assistido valido.
- [ ] Bloquear matricula ativa duplicada.
- [ ] Bloquear superlotacao.
- [ ] Encerrar/suspender matricula conforme regra.

### 6.7 Erros e sincronizacao
- [ ] Backend indisponivel exibe estado de erro (sem fallback silencioso).
- [ ] Sessao expirada (401) redireciona corretamente.
- [ ] Acesso negado (403) nao apresenta falso sucesso.
- [ ] Refresh nao perde coerencia de listagem.

### 6.8 Regressao institucional
- [ ] `/agenda` oficial continua abrindo.
- [ ] Fluxos legados dependentes da agenda continuam funcionais.
- [ ] Nao houve alteracao indevida de `status_jornada`.

## 7) Criterios de saida para futura troca da /agenda

### 7.1 Criterios funcionais
- Cobertura obrigatoria da nova agenda para fluxos operacionais planejados.
- Mapeamento explicito do que ainda depende da agenda institucional antiga.
- Paridade minima acordada entre equipe tecnica e coordenacao.

### 7.2 Criterios operacionais
- Pelo menos 2 ondas concluidas sem bug critico.
- Execucao real dos fluxos de turma/grade/matricula por perfis alvo.
- Zero incidente de perda de dados.
- Zero rollback por falha estrutural de permissao/integridade.

### 7.3 Criterios tecnicos
- Build frontend verde.
- Rotas/API do dominio estaveis.
- Migration sem drift novo.
- Sem fallback local silencioso em producao.
- Sem regressao critica na agenda oficial.

### 7.4 Criterios de UX
- Usuarios distinguem claramente:
  - agenda institucional (`/agenda`)
  - operacao de turmas (`/operacao-unidade/*`)
- Mensagens de erro e estados vazios compreensiveis.
- Navegacao sem ambiguidade relevante.

### 7.5 Criterios de governanca
- Coordenacao aprova resultado das ondas.
- Gestao aprova continuidade.
- Matriz de permissao revisada e assinada.
- Checklist operacional executado e registrado.

### 7.6 Regra de decisao (gate final)
- **Ainda nao pode trocar `/agenda`**: qualquer criterio critico em aberto.
- **Pode iniciar preparacao do swap**: criterios funcionais + operacionais + tecnicos atendidos, com ressalvas controladas.
- **Pode trocar `/agenda` com seguranca**: todos os criterios atendidos e aprovacao formal de coordenacao+gestao.

## 8) Evidencias recomendadas por onda
- Relatorio de testes API/UI.
- Logs de erro 401/403/409.
- Lista de usuarios/perfis liberados.
- Registro de incidentes e resolucoes.
- Resultado do checklist assinado por responsavel operacional.
