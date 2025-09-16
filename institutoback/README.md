# Instituto Lauir - Backend API

Backend API para o Sistema de Gestão do Instituto Lauir.

## 🚀 Como executar

1. **Instalar dependências:**
```bash
npm install
```

2. **Configurar variáveis de ambiente:**
```bash
cp .env.example .env
# Editar o arquivo .env com suas configurações
```

3. **Executar seeds iniciais (desenvolvimento):**
```bash
npm run seed
```

4. **Executar em desenvolvimento:**
```bash
npm run dev
# ou com seeds
npm run dev:seed
```

## 🔗 Novos Endpoints

### Profissionais (/api/professionals)
- `GET /` - Listar profissionais (query: q, status, limit, offset)
- `POST /` - Criar profissional
- `PUT /:id` - Atualizar profissional  
- `DELETE /:id` - Inativar profissional

### Serviços (/api/services)
- `GET /` - Listar serviços (query: q, active, limit, offset)
- `POST /` - Criar serviço
- `PUT /:id` - Atualizar serviço
- `DELETE /:id` - Arquivar serviço

## 🎯 Páginas Frontend

- `/gestao/profissionais` - Gestão de Profissionais
- `/gestao/servicos` - Gestão de Serviços

## 📁 Estrutura do Projeto

```
institutoback/
├── db/              # Pool PostgreSQL
├── routes/          # APIs (professionals, services)
├── seeds/           # Dados iniciais
├── scripts/         # Scripts utilitários
└── server.js        # Servidor principal
```

## 🔗 Endpoints Disponíveis

### Autenticação
- `POST /api/auth/login` - Login do usuário
- `GET /api/auth/verify` - Verificar token

### Usuários
- `GET /api/users` - Listar usuários
- `GET /api/users/:id` - Buscar usuário por ID

### Pacientes
- `GET /api/pacientes` - Listar pacientes
- `GET /api/pacientes/:id` - Buscar paciente por ID
- `POST /api/pacientes` - Criar novo paciente

## 🔧 Configuração

Edite o arquivo `.env` com suas configurações:

```env
PORT=3000
DB_HOST=localhost
DB_NAME=instituto_lauir
DB_USER=postgres
DB_PASS=sua_senha
JWT_SECRET=seu_jwt_secret
```

## 🧪 Teste da API

Acesse: `http://localhost:3000/api/health`