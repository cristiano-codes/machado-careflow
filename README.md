# AcolherFlow — Sistema de Gestão do Atendimento Social

Sistema institucional do IDSLM para gestão do atendimento social.

Atualizado em 2026-02-06.

## Estado atual

- Frontend: React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui.
- Backend: Node.js + Express + Sequelize (PostgreSQL).
- Autenticacao: JWT + bcryptjs.
- Deploy atual: `deploy.ps1` -> GitHub (`main`) -> Railway build/run.

## Estrutura real do repositorio

```text
machado-careflow/
|-- src/                     # Frontend React
|   |-- components/
|   |-- contexts/
|   |-- hooks/
|   |-- pages/
|   `-- services/
|-- public/
|-- institutoback/           # Backend Express
|   |-- config/
|   |-- middleware/
|   |-- routes/
|   |-- uploads/
|   |-- .env.example
|   `-- server.js
|-- deploy.ps1               # Commit + push para deploy
|-- package.json             # Scripts do frontend
`-- README.md
```

## Modulos principais no frontend

Paginas em `src/pages`:

- `Index`
- `Dashboard`
- `Profile`
- `PreAgendamento`
- `PreCadastro`
- `Agenda`
- `Entrevistas`
- `Avaliacoes`
- `AnaliseVagas`
- `Profissionais`
- `NovoProfissional`
- `GerenciarUsuarios`
- `PermissionManager`
- `Configuracoes`

## Governanca de Usuarios

### Estados do usuario

O ciclo de vida atual do usuario usa os estados abaixo na coluna `users.status`:

- `pendente`: cadastro criado e aguardando avaliacao administrativa.
- `ativo`: usuario apto a autenticar no sistema.
- `bloqueado`: acesso negado ate reativacao.
- `rejeitado`: acesso negado por decisao administrativa.

Complementos de governanca:

- `users.must_change_password`:
  - `true`: autentica, mas deve trocar senha antes de navegar no sistema.
  - `false`: fluxo normal apos login.
- `users.first_access`:
  - `true`: login bloqueado com orientacao para definir senha no fluxo de primeiro acesso.
  - `false`: login permitido se demais condicoes forem atendidas.
- `users.deleted_at`:
  - `NULL`: registro ativo no dominio.
  - `timestamp`: usuario excluido logicamente (soft delete), removido das listagens e do login.

### Fluxo de aprovacao

1. Usuario e criado em `POST /api/auth/register` com `status='pendente'`.
2. Perfil com privilegio administrativo executa uma acao:
   - Aprovar/Ativar: `PATCH /api/users/:id/approve` -> `status='ativo'`
   - Rejeitar: `PATCH /api/users/:id/reject` -> `status='rejeitado'`
   - Bloquear: `PATCH /api/users/:id/block` -> `status='bloqueado'`
3. Somente `status='ativo'` permite login.

### Politica de senha obrigatoria

- Acao administrativa: `PATCH /api/users/:id/force-password-change`
  - define `must_change_password=true` e `first_access=false`.
- Login retorna a flag `must_change_password`.
- Frontend redireciona para rota de troca obrigatoria.
- Ao concluir `PUT /api/auth/change-password`, backend grava:
  - `first_access=false`
  - `must_change_password=false`

### Soft delete

- Exclusao administrativa: `DELETE /api/users/:id`.
- Implementacao atual: `UPDATE users SET deleted_at = NOW()`.
- Impacto:
  - usuario nao aparece em listagens administrativas;
  - usuario nao autentica (`login` e `verify` filtram `deleted_at IS NULL`);
  - nao existe endpoint publico de restauracao no estado atual.

### Regras de permissao

- As rotas administrativas de usuarios exigem autenticacao JWT e `adminMiddleware`.
- O middleware aceita:
  - papeis de alta governanca (`coordenador geral`, `administrador`, `admin`, `gestao`, `gestor`);
  - ou escopos de permissao (`admin:all`, `admin`, `manage:users`, `users:manage`).
- Regras adicionais de seguranca:
  - apenas `admin` pode operar senha/exclusao de outro `admin`;
  - nao e permitido excluir o proprio usuario;
  - nao e permitido excluir o usuario principal `admin`.

Para detalhes formais do modulo e da API:

- `docs/user-management.md`
- `institutoback/README.md` (secao de especificacao de endpoints de governanca)

## Requisitos

- Node.js 18+
- npm 9+
- PostgreSQL 14+ (ou `DATABASE_URL`)

## Como rodar localmente

### 1) Backend

```powershell
cd C:\projeto\machado-careflow\institutoback
npm install
Copy-Item .env.example .env
npm run dev
```

### 2) Frontend

Em outro terminal:

```powershell
cd C:\projeto\machado-careflow
npm install
npm run dev
```

- Frontend local: `http://localhost:5000`
- API health check: `http://localhost:3000/api/health`

## Variaveis de ambiente

### Backend (`institutoback/.env`)

Minimo recomendado:

```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=instituto_lauir
DB_USER=postgres
DB_PASS=sua_senha
JWT_SECRET=troque_esta_chave
```

Opcional para deploy:

```env
DATABASE_URL=postgres://usuario:senha@host:5432/banco
```

### Frontend

Opcional:

```env
VITE_API_BASE_URL=/api
```

Observacao:

- O Vite ja tem proxy `"/api" -> "http://localhost:3000"` em `vite.config.ts`.
- Sem `VITE_API_BASE_URL`, o `apiService` usa fallback para `http://<host>:3000/api`.

## Scripts

### Frontend (raiz)

```powershell
npm run dev
npm run build
npm run build:dev
npm run lint
npm run preview
```

### Backend (`institutoback`)

```powershell
npm run dev
npm start
```

## Fluxo de deploy atual

Script recomendado:

```powershell
cd C:\projeto\machado-careflow
.\deploy.ps1
```

O script faz:

1. `git add --all`
2. commit com timestamp quando ha mudancas
3. commit vazio `chore: redeploy railway` quando nao ha mudancas
4. `git push origin main`

Depois disso, o Railway executa build e run.

## Endpoints registrados no backend

Prefixo: `/api`

- `/auth`
- `/users`
- `/permissions`
- `/pacientes`
- `/settings`
- `/stats`
- `/activities`
- `/services`
- `/pre-appointments`
- `/job-vacancies`
- `/job-candidates`
- `/profissionais`
- `/health`

## Observacoes tecnicas

- O projeto ainda tem `old/` e arquivos locais auxiliares (`schema.sql`, `sistema.dump`, etc.).
- Se quiser lint focado no codigo ativo, prefira: `npx eslint src tailwind.config.ts`.

## Licenca

Uso educacional e institucional.
