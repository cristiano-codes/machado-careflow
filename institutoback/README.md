# Machado CareFlow - Backend (`institutoback`)

API REST do sistema Machado CareFlow.

Atualizado em 2026-02-06.

## Stack atual

- Node.js + Express
- Sequelize + `pg` (PostgreSQL)
- JWT (`jsonwebtoken`) + `bcryptjs`
- `helmet`, `cors`, `morgan`, `express-validator`

## Estrutura real

```text
institutoback/
|-- config/
|   `-- database.js
|-- middleware/
|   `-- auth.js
|-- routes/
|   |-- activities.js
|   |-- auth.js
|   |-- jobCandidates.js
|   |-- jobVacancies.js
|   |-- pacientes.js
|   |-- permissions.js
|   |-- preAppointments.js
|   |-- profissionais.js
|   |-- services.js
|   |-- settings.js
|   |-- stats.js
|   `-- users.js
|-- uploads/
|-- .env.example
|-- package.json
`-- server.js
```

## Requisitos

- Node.js 18+
- npm 9+
- PostgreSQL 14+

## Executar localmente

```powershell
cd C:\projeto\machado-careflow\institutoback
npm install
Copy-Item .env.example .env
npm run dev
```

Servidor padrao:

- API: `http://localhost:3000`
- Health check: `http://localhost:3000/api/health`

## Scripts

```powershell
npm run dev    # nodemon server.js
npm start      # node server.js
npm test       # ainda sem testes implementados
```

## Variaveis de ambiente

### Minimo recomendado

```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=instituto_lauir
DB_USER=postgres
DB_PASS=sua_senha_aqui
JWT_SECRET=troque_esta_chave
```

### Opcional para providers cloud

`config/database.js` tambem suporta:

```env
DATABASE_URL=postgres://usuario:senha@host:5432/banco
```

### Outras variaveis usadas

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu_email@gmail.com
EMAIL_PASS=sua_senha_app
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=5242880
```

## Rotas registradas no `server.js`

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

## Endpoints principais por modulo

### Auth

- `POST /api/auth/login`
- `GET /api/auth/verify`
- `GET /api/auth/first-access`
- `GET /api/auth/check-user`
- `POST /api/auth/setup-password`
- `POST /api/auth/register`

### Users

- `GET /api/users`
- `GET /api/users/pending`
- `PATCH /api/users/:id/approve`
- `PATCH /api/users/:id/reject`
- `PATCH /api/users/:id/block`
- `GET /api/users/:id`
- `POST /api/users/:id/reset-password`

### Permissions

- `GET /api/permissions/users`
- `GET /api/permissions/modules`
- `GET /api/permissions/permissions`
- `GET /api/permissions/users/:id/permissions`
- `GET /api/permissions/overview`
- `POST /api/permissions/users/:id/grant`
- `POST /api/permissions/users/:id/revoke`
- `POST /api/permissions/users/:id/grant-basic`
- `POST /api/permissions/users/:id/grant-all`
- `POST /api/permissions/users/:id/revoke-module`

### Outros modulos

- `GET /api/pacientes`
- `GET /api/stats`
- `GET /api/activities`
- `GET /api/services`
- `POST /api/pre-appointments`
- `GET /api/pre-appointments`
- `GET /api/job-vacancies`
- `GET /api/job-candidates`
- `GET /api/settings`
- `POST /api/settings`
- `POST /api/profissionais`
- `GET /api/profissionais`
- `GET /api/profissionais/:id/agenda`
- `GET /api/profissionais/stats/resumo`

## Comportamento importante

- O backend testa conexao com banco no bootstrap (`sequelize.authenticate()`) antes de subir o servidor.
- Em `NODE_ENV != production`, o CORS esta aberto.
- Em `production`, o CORS usa allowlist definida em `server.js`.

## Deploy

O deploy do projeto e acionado na raiz via:

```powershell
cd C:\projeto\machado-careflow
.\deploy.ps1
```

Esse script faz commit/push para `main`, e o Railway executa build/run.
