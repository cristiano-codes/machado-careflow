# Hardening Final - Dominio de Operacao da Unidade

## Escopo desta rodada
- Endurecimento API-first do dominio de operacao (`salas`, `atividades`, `turmas`, `grade`, `matriculas`).
- Remocao de fallback local silencioso para producao.
- Ajuste de UX para erro de sincronizacao e modo somente leitura.
- Sem swap da rota oficial `/agenda`.

## Politica de fonte de dados (API-first)
- Fonte oficial: `GET/POST /api/unit-operations/*`.
- O frontend nao persiste mais dataset operacional em `localStorage`.
- Em falha de API, o frontend nao grava localmente e nao simula sucesso.

## Fallback local (somente desenvolvimento)
- Fallback local so existe se **ambiente de desenvolvimento** e flag:
  - `VITE_UNIT_OPS_DEV_LOCAL_FALLBACK=true`
- Mesmo com fallback dev, o dominio fica em **somente leitura** para evitar sucesso falso.
- Banner explicito informa estado de sincronizacao e origem dos dados.

## Comportamento operacional esperado
- API indisponivel (503/network):
  - tela permanece no modulo;
  - banner de erro exibido;
  - sem gravacao local silenciosa.
- API 401:
  - evento de sessao expirada;
  - redirecionamento para login.
- 403 (RBAC):
  - bloqueio de rota no frontend;
  - bloqueio de endpoint no backend.

## RBAC e alinhamento
- Frontend (`UNIT_OPERATIONS_REQUIRED_SCOPES`) exige escopos do novo dominio.
- Backend (`authorizeUnitOpsView`) exige escopos do novo dominio.
- Escopos legados de agenda nao abrem mais o dominio novo de operacao.

## Checklist para go-live controlado
- [ ] Migration aplicada com sucesso no ambiente alvo.
- [ ] Permissoes de `salas/atividades_unidade/turmas/grade/matriculas` concedidas aos perfis corretos.
- [ ] Rotas `/operacao-unidade/*` acessiveis para perfis autorizados.
- [ ] Rotas bloqueadas para perfis sem escopo (frontend + backend).
- [ ] Banner de sincronizacao visivel em erro de API.
- [ ] CRUD operacional validado com conflitos/lotacao/matricula duplicada.
- [ ] `/agenda` oficial preservada e sem regressao.

## O que ainda nao esta nesta fase
- Nao houve troca da tela oficial `/agenda`.
- Nao houve retirada da agenda antiga.
- Nao houve implantacao de frequencia/presenca como modulo oficial.

## Proxima etapa recomendada
- Liberar acesso por perfis em ondas controladas (coordenacao -> recepcao -> equipe tecnica),
  monitorando erros de API/RBAC antes de ampliar o rollout.
