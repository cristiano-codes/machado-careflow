const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares de segurança e logging
app.use(helmet());
app.use(morgan('combined'));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Em desenvolvimento, libera todas as origens para facilitar testes em rede local
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    const prodOrigins = ['https://seudominio.com'];

    // Permitir chamadas sem origin (ex: curl, Postman) e domínios do Lovable Preview
    const isLovablePreview = origin && /\.lovable\.app$/.test(origin);
    if (!origin || (origin && prodOrigins.includes(origin)) || isLovablePreview) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// Middleware para parsing de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos (uploads)
app.use('/uploads', express.static('uploads'));

// Importar rotas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const permissionRoutes = require('./routes/permissions');
const pacientRoutes = require('./routes/pacientes');
const settingsRoutes = require('./routes/settings');
const statsRoutes = require('./routes/stats');
const activitiesRoutes = require('./routes/activities');
const servicesRoutes = require('./routes/services');
const preAppointmentsRoutes = require('./routes/preAppointments');
const jobVacanciesRoutes = require('./routes/jobVacancies');
const jobCandidatesRoutes = require('./routes/jobCandidates');

// Usar rotas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/pacientes', pacientRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/pre-appointments', preAppointmentsRoutes);
app.use('/api/job-vacancies', jobVacanciesRoutes);
app.use('/api/job-candidates', jobCandidatesRoutes);

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({
    message: 'API Instituto Lauir funcionando!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});
