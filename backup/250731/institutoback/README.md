# Instituto Lauir - Backend API

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

3. **Criar banco de dados PostgreSQL:**
```sql
CREATE DATABASE instituto_lauir;
```

4. **Executar em desenvolvimento:**
```bash
npm run dev
```

5. **Executar em produção:**
```bash
npm start
```

## 📁 Estrutura do Projeto

```
institutoback/
├── config/           # Configurações (database, etc)
├── controllers/      # Lógica de negócio
├── middleware/       # Middlewares customizados
├── models/          # Modelos do Sequelize
├── routes/          # Definição de rotas
├── services/        # Serviços (email, relatórios, etc)
├── uploads/         # Arquivos enviados
├── utils/           # Utilitários
├── .env.example     # Exemplo de variáveis de ambiente
├── server.js        # Servidor principal
└── package.json     # Dependências
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