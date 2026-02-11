const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const sequelize = require('./config/database');

const frontendDistPath = path.resolve(__dirname, '../dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');
const frontendBuildAvailable = fs.existsSync(frontendIndexPath);

const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const prodOrigins = new Set([
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://friendly-insight-production.up.railway.app',
  'https://home-production-7dda.up.railway.app',
  ...configuredOrigins,
]);

const corsOptions = {
  origin: (origin, callback) => {
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    const isLovablePreview = Boolean(origin && /\.lovable\.app$/.test(origin));
    if (!origin || prodOrigins.has(origin) || isLovablePreview) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(helmet());
app.use(morgan('combined'));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

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

app.get('/api/health', (req, res) => {
  res.json({
    message: 'API Instituto Lauir funcionando!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    frontendBuildAvailable,
  });
});

if (frontendBuildAvailable) {
  app.use(express.static(frontendDistPath));
}

app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Rota nao encontrada' });
});

if (frontendBuildAvailable) {
  app.get('*', (req, res) => {
    res.sendFile(frontendIndexPath);
  });
} else {
  app.use('*', (req, res) => {
    res.status(404).json({ message: 'Rota nao encontrada' });
  });
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : {},
  });
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL conectado com sucesso.');

    app.listen(PORT, HOST, () => {
      console.log(`Servidor rodando em ${HOST}:${PORT}`);
      console.log(`Ambiente: ${process.env.NODE_ENV}`);
      console.log(`Health check: http://${HOST}:${PORT}/api/health`);

      if (frontendBuildAvailable) {
        console.log(`Frontend estatico: ${frontendDistPath}`);
      } else {
        console.log('Frontend estatico nao encontrado (dist/index.html).');
      }
    });
  } catch (err) {
    console.error('Falha ao conectar no PostgreSQL:', err.message);
    process.exit(1);
  }
})();
