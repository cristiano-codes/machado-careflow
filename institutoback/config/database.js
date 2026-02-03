const { Sequelize } = require('sequelize');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

// Se você tiver DATABASE_URL (ex.: postgres://user:pass@host:5432/dbname),
// use ela. Senão, cai no modo "variáveis separadas" (local).
const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },

      // Muitos providers exigem SSL no Postgres.
      // Render/Railway/Neon normalmente OK com require.
      // Se seu provider usa certificado válido, preferir rejectUnauthorized: true.
      dialectOptions: isProd
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        dialect: 'postgres',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
      }
    );

// NÃO testa conexão automaticamente aqui.
// Em vez disso, exporta e testa no bootstrap do app (ex.: server.js).
module.exports = sequelize;
