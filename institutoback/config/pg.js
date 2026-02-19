const { Pool } = require('pg');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL?.trim();

if (isProd && !databaseUrl && !process.env.DB_HOST) {
  throw new Error('DATABASE_URL ou DB_HOST obrigatorio em producao');
}

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl: isProd ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'instituto_lauir',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS,
      ssl: isProd ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(poolConfig);

module.exports = pool;
