🧾 README.md — versão revisada e atualizada
# 🧠 Machado CareFlow

Sistema de gestão clínica desenvolvido para o **Instituto Lauir Machado**, com foco em **atendimento psicológico, agendamento e gestão de pacientes**.  
O projeto integra módulos administrativos, clínicos e financeiros em uma plataforma única.

---

## 🚀 Visão Geral

O **Machado CareFlow** tem como objetivo centralizar as operações de uma clínica em um só sistema, permitindo:

- 📅 **Agendamentos e Pré-Atendimentos**  
  Controle de consultas, entrevistas iniciais e fila de espera.

- 👩‍⚕️ **Gestão de Profissionais**  
  Cadastro de psicólogos, agendas individuais e controle de atendimentos.

- 👨‍💻 **Área Administrativa**  
  Controle de usuários, permissões e gestão financeira.

- 💾 **Banco de Dados Local (PostgreSQL)**  
  Todos os dados são armazenados localmente, garantindo performance e segurança sem dependência de serviços externos.

---

## 🧩 Estrutura do Projeto



machado-careflow/
│
├── institutoback/ # Backend (API Node.js + PostgreSQL)
│ ├── src/
│ │ ├── routes/ # Rotas da API
│ │ ├── controllers/ # Regras de negócio
│ │ ├── services/ # Serviços e integrações
│ │ └── db.ts # Conexão com PostgreSQL
│ └── package.json
│
├── src/ # Frontend (React + Vite + TypeScript)
│ ├── pages/ # Páginas e componentes principais
│ ├── components/ # Componentes reutilizáveis
│ ├── hooks/ # Hooks personalizados
│ └── main.tsx
│
├── public/ # Assets estáticos
├── .env.example # Variáveis de ambiente (exemplo)
├── package.json # Dependências do frontend
├── vite.config.ts # Configuração Vite
└── README.md


---

## ⚙️ Tecnologias Utilizadas

| Camada | Tecnologias |
|:-------|:-------------|
| **Frontend** | React, TypeScript, Vite, TailwindCSS, ShadCN/UI |
| **Backend** | Node.js, Express, TypeScript |
| **Banco de Dados** | PostgreSQL local |
| **Autenticação** | JWT + bcrypt |
| **Outros** | ESLint, Prettier, Git, GitHub |

---

## 💻 Instalação e Configuração

### 1️⃣ Clonar o Repositório
```bash
git clone https://github.com/cristiano-codes/machado-careflow.git
cd machado-careflow

2️⃣ Configurar o Backend
cd institutoback
npm install
cp .env.example .env
# edite o arquivo .env com as suas credenciais locais do PostgreSQL
npm run dev

3️⃣ Configurar o Frontend
cd ../
npm install
npm run dev

🧱 Estrutura do Banco de Dados

Principais tabelas:

patients — cadastro de pacientes

professionals — psicólogos e colaboradores

appointments — agendamentos e atendimentos

users — autenticação e permissões

transactions — controle financeiro

🔐 Variáveis de Ambiente (.env.example)
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=sua_senha
PGDATABASE=machado_careflow
JWT_SECRET=chave_super_secreta
NODE_ENV=development

🧠 Roadmap

 Configuração do ambiente React + Vite

 API Node.js com Express

 Conexão com PostgreSQL local

 Autenticação com JWT

 Painel Administrativo completo

 Dashboard de relatórios em Power BI

 Integração com módulo financeiro

🧑‍💻 Autor

Cristiano Oliveira (Chat Salvador)
📊 Analista de Dados & Desenvolvedor Full Stack
📍 Rio de Janeiro, Brasil
🔗 linkedin.com/in/cristiano-oliveira

📄 Licença

Este projeto é de uso educacional e institucional.
© 2025 - Instituto Lauir Machado.