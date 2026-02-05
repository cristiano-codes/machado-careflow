const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// === APP ===
const app = express();
const PORT = process.env.PORT || 3000;

// === BANCO (Sequelize) ===
const sequelize = require('./config/database'); // ajuste se o caminho for diferente

// === MIDDLEWARES ===
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: (origin, callback) => {
    // Em dev, libera tudo
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    const prodOrigins = [
      'http://localhost:4173',
      'http://127.0.0.1:4173',
      'https://friendly-insight-production.up.railway.app',
      'https://home-production-7dda.up.railway.app'
    ];

    const isLovablePreview = origin && /\.lovable\.app$/.test(origin);

    // Libera chamadas sem Origin (curl/healthcheck) + whitelisted + previews
    if (!origin || prodOrigins.includes(origin) || isLovablePreview) {
      return callback(null, true);
    }

    // Nega CORS sem explodir (evita 500)
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// ✅ ESSA LINHA RESOLVE O PRE-FLIGHT
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// === ARQUIVOS ESTÁTICOS ===
app.use('/uploads', express.static('uploads'));

// === ROTAS ===
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
const profissionaisRoutes = require('./routes/profissionais');

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
app.use('/api/profissionais', profissionaisRoutes);

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
  res.json({
    message: 'API Instituto Lauir funcionando!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// === ERROS ===
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// === BOOTSTRAP (BANCO → SERVIDOR) ===
(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL conectado com sucesso.');

    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📊 Ambiente: ${process.env.NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    });

  } catch (err) {
    console.error('❌ Falha ao conectar no PostgreSQL:', err.message);
    process.exit(1);
  }
})();
