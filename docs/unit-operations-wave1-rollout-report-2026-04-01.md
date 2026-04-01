# Onda 1 - Rollout Supervisionado (Operacao da Unidade)

Data da execucao: 2026-04-01  
Escopo: Admin/Gestao + Coordenacao (simulada por permissoes), com validacao adicional de perfil negado.

## 1. Preparacao da Onda 1

### Rotas validadas
- `/operacao-unidade`
- `/operacao-unidade/agenda`
- `/operacao-unidade/salas`
- `/operacao-unidade/atividades`
- `/operacao-unidade/turmas`
- `/operacao-unidade/grade`
- `/operacao-unidade/matriculas`
- Regressao: `/agenda`

### Perfis utilizados
- Admin/Gestao: `homol_ops_admin`
- Coordenacao (simulada para teste): `homol_ops_legacy` com matriz temporaria de escopos da Onda 1
- Negado: `homol_ops_denied`

### Criterios aplicados
- CRUD essencial funcional
- Conflitos (sala/profissional) funcionando
- Regras de matricula (duplicidade/superlotacao) funcionando
- Bloqueio de permissao no frontend e backend
- Convivencia sem regressao na agenda oficial

## 2. Evidencias geradas
- `smoke-evidence/homolog-unit-ops-wave1-admin-1775086551212.json`
- `smoke-evidence/homolog-unit-ops-wave1-coordination-1775086317863.json`
- `smoke-evidence/homolog-unit-ops-wave1-ui-1775086419160.json`
- `smoke-evidence/homolog-unit-ops-ui-hardening-1775086439668.json`
- (registro de nao conformidade do script legado) `smoke-evidence/homolog-unit-ops-api-1775086139563.json`

## 3. Checklist operacional executado

### Admin/Gestao
- [x] Acesso ao modulo
- [x] Abertura de todas as rotas
- [x] Leitura das paginas
- [x] Criacao/edicao de salas
- [x] Criacao/edicao de atividades
- [x] Criacao/edicao de turmas
- [x] Criacao de alocacao valida
- [x] Bloqueio de conflito de sala
- [x] Bloqueio de conflito de profissional
- [x] Criacao de matricula valida
- [x] Bloqueio de matricula duplicada
- [x] Bloqueio de superlotacao
- [x] Refresh sem perda de rota
- [x] Regressao da agenda oficial por API e UI

### Coordenacao (simulada por permissao)
- [x] Acesso ao modulo
- [x] Abertura de rotas permitidas
- [x] Leitura das paginas (salas, atividades, turmas, grade, matriculas)
- [x] Operacoes liberadas: criar/editar turma, alocar, matricular
- [x] Regras de conflito e lotacao funcionando
- [x] Bloqueio de operacoes nao liberadas (sala/atividade)
- [x] Consistencia de dados nas listagens

### Perfil negado
- [x] Menu de operacao nao aparece indevidamente
- [x] Bloqueio de rota no frontend
- [x] Bloqueio no backend (403)
- [x] Sem fallback/acesso indevido

### Erros e sincronizacao
- [x] API 503: banner de erro exibido, sem fallback silencioso
- [x] API 401: sessao expirada e redirecionamento

## 4. Incidentes registrados

## INC-001 - Script legado de homologacao API nao idempotente
- Severidade: **medio**
- Tipo: bug de ferramenta de homologacao
- Perfil afetado: equipe tecnica/homologacao
- Evidencia: `smoke-evidence/homolog-unit-ops-api-1775086139563.json`
- Passo: execucao de `scripts/homolog-unit-ops-api.cjs`
- Esperado: "criar alocacao base" = 200 e "conflito sala" = 409
- Encontrado: base = 409 e conflito = 200 por choque de dados preexistentes no mesmo horario fixo
- Causa provavel: script usa janela temporal fixa, sem isolamento suficiente entre execucoes
- Bloqueia Onda 1: **nao**
- Bloqueia Onda 2: **nao**, mas recomenda ajuste definitivo do script legado

## INC-002 - Nao existe conta dedicada de coordenacao no ambiente de homologacao
- Severidade: **medio**
- Tipo: governanca operacional / RBAC
- Perfil afetado: coordenacao (homologacao)
- Passo: preparo da Onda 1
- Esperado: usuario de coordenacao dedicado e permanente para testes
- Encontrado: necessidade de usar `homol_ops_legacy` com matriz temporaria de permissoes da Onda 1
- Causa provavel: massa de homologacao sem perfil dedicado para coordenacao
- Bloqueia Onda 1: **nao**
- Bloqueia Onda 2: **nao**, mas recomendacao forte criar conta dedicada antes da Onda 2

## 5. Correcoes aplicadas nesta fase
- Criado script de checklist admin robusto e idempotente:
  - `scripts/homolog-unit-ops-wave1-admin.cjs`
- Criado script de checklist coordenacao com matriz de escopo controlada e restauracao:
  - `scripts/homolog-unit-ops-wave1-coordination.cjs`
- Criado script de validacao UI/navegacao por perfil + regressao de `/agenda`:
  - `scripts/homolog-unit-ops-wave1-ui.cjs`

Observacao: nao houve alteracao funcional do produto (frontend/backend de negocio) nesta fase.

## 6. Re-testes apos ajustes
- [x] `node scripts/homolog-unit-ops-wave1-admin.cjs`
- [x] `node scripts/homolog-unit-ops-wave1-coordination.cjs`
- [x] `node scripts/homolog-unit-ops-wave1-ui.cjs`
- [x] `node scripts/homolog-unit-ops-ui-hardening.cjs`
- [x] `npx tsc --noEmit`
- [x] `npm run build`

## 7. Convivencia com agenda oficial
- `/agenda` permaneceu acessivel e sem regressao observada nos testes executados.
- Endpoints legados da agenda oficial utilizados no smoke (`/profissionais?for_agenda=1` e `/profissionais/agenda/range`) responderam com sucesso.
- O dominio novo segue em paralelo, sem swap de rota oficial.

## 8. Parecer da Onda 1
Decisao: **AVANCAR PARA ONDA 2 COM RESSALVAS**

Racional:
- Nenhum incidente critico aberto.
- Nenhuma quebra de permissao/seguranca no dominio novo.
- Nenhum falso sucesso detectado.
- CRUD essencial e regras criticas (conflitos/lotacao/duplicidade) estaveis nos testes da Onda 1.
- Agenda oficial preservada.

Ressalvas para levar na transicao:
- Ajustar/aposentar script legado nao idempotente para evitar falso negativo de homologacao.
- Provisionar conta dedicada de coordenacao para Onda 2 (evitar uso de perfil legado em simulacao).
