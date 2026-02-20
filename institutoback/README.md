# AcolherFlow — Sistema de Gestão do Atendimento Social - Backend (`institutoback`)

API REST do sistema AcolherFlow — Sistema de Gestão do Atendimento Social.

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
- `PUT /api/auth/change-password`
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
- `PATCH /api/users/:id/force-password-change`
- `DELETE /api/users/:id`
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

## Especificacao da API - Governanca de Usuarios

Base path: `/api`

Premissas:

- Todas as rotas de `users` usam JWT (`Authorization: Bearer <token>`).
- Rotas administrativas de `users` exigem `adminMiddleware`.
- `adminMiddleware` aceita papeis de governanca e/ou escopos administrativos.

### `PATCH /users/:id/approve`

Objetivo: definir usuario como ativo (acao usada para "Aprovar" e "Ativar").

Request:

- Params: `id` (obrigatorio)
- Body: nao obrigatorio (eventual body e ignorado)

Query:

```sql
UPDATE users
SET status = 'ativo'
WHERE id = $2
  AND deleted_at IS NULL
RETURNING username, name;
```

Response `200`:

```json
{
  "message": "Usuario <nome> aprovado com sucesso!",
  "user": { "username": "u", "name": "Nome" }
}
```

Status codes:

- `200` sucesso
- `401` token ausente/invalido
- `403` sem permissao administrativa
- `404` usuario nao encontrado (ou excluido logicamente)
- `500` erro interno

### `PATCH /users/:id/reject`

Objetivo: definir usuario como rejeitado.

Request:

- Params: `id` (obrigatorio)
- Body: nao obrigatorio

Query:

```sql
UPDATE users
SET status = 'rejeitado'
WHERE id = $2
  AND deleted_at IS NULL
RETURNING username, name;
```

Response `200`:

```json
{
  "message": "Usuario <nome> rejeitado.",
  "user": { "username": "u", "name": "Nome" }
}
```

Status codes:

- `200`, `401`, `403`, `404`, `500`

### `PATCH /users/:id/block`

Objetivo: bloquear usuario ativo.

Request:

- Params: `id` (obrigatorio)
- Body: nao obrigatorio

Query:

```sql
UPDATE users
SET status = 'bloqueado'
WHERE id = $2
  AND deleted_at IS NULL
RETURNING username, name;
```

Response `200`:

```json
{
  "message": "Usuario <nome> bloqueado.",
  "user": { "username": "u", "name": "Nome" }
}
```

Status codes:

- `200`, `401`, `403`, `404`, `500`

### `PATCH /users/:id/force-password-change`

Objetivo: exigir troca obrigatoria de senha no proximo login.

Request:

- Params: `id` (obrigatorio)
- Body: nao obrigatorio

Queries:

```sql
SELECT id, role, username, name
FROM users
WHERE id = $1
  AND deleted_at IS NULL;
```

```sql
UPDATE users
SET must_change_password = true,
    first_access = false
WHERE id = $1
  AND deleted_at IS NULL;
```

Response `200`:

```json
{
  "message": "Usuario <nome> precisara redefinir a senha no proximo login."
}
```

Status codes:

- `200` sucesso
- `401` token ausente/invalido
- `403` sem permissao administrativa ou tentativa de nao-admin operar conta `admin`
- `404` usuario nao encontrado
- `500` erro interno

### `DELETE /users/:id`

Objetivo: exclusao logica de usuario (soft delete).

Request:

- Params: `id` (obrigatorio)
- Body: nao utilizado

Queries:

```sql
SELECT id, name, email, username, role
FROM users
WHERE id = $1
  AND deleted_at IS NULL;
```

```sql
UPDATE users
SET deleted_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL;
```

Response `200`:

```json
{
  "message": "Usuario <nome> excluido com sucesso.",
  "user": { "id": 1, "name": "Nome", "email": "mail@dominio" }
}
```

Status codes:

- `200` sucesso
- `400` tentativa de autoexclusao
- `401` token ausente/invalido
- `403` tentativa de excluir `admin` principal ou conta `admin` sem perfil `admin`
- `404` usuario nao encontrado
- `500` erro interno

### `PUT /auth/change-password`

Objetivo: alterar senha do usuario autenticado e remover obrigatoriedade de troca.

Request:

- Headers: `Authorization: Bearer <token>`
- Body:

```json
{
  "currentPassword": "senhaAtual",
  "newPassword": "novaSenhaComMinimo8"
}
```

Queries:

```sql
SELECT id, password
FROM users
WHERE id = $1
  AND deleted_at IS NULL;
```

```sql
UPDATE users
SET password = $1,
    first_access = false,
    must_change_password = false
WHERE id = $2;
```

Response `200`:

```json
{
  "success": true,
  "message": "Senha alterada com sucesso."
}
```

Status codes:

- `200` sucesso
- `400` payload invalido, senha atual incorreta ou nova senha igual a atual
- `401` token ausente/invalido
- `404` usuario nao encontrado
- `500` erro interno

Erros comuns:

- `message: "Dados invalidos"`
- `message: "Senha atual invalida"`
- `message: "A nova senha deve ser diferente da senha atual"`
- `message: "Usuario nao encontrado"`

## Comportamento importante

- O backend testa conexao com banco no bootstrap (`sequelize.authenticate()`) antes de subir o servidor.
- O CORS atual usa `origin: true` e `credentials: true`, com resposta global para preflight `OPTIONS`.

## Deploy

O deploy do projeto e acionado na raiz via:

```powershell
cd C:\projeto\machado-careflow
.\deploy.ps1
```

Esse script faz commit/push para `main`, e o Railway executa build/run.
