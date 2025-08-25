const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sistema',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '110336'
});

// GET - Buscar configurações
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings LIMIT 1');
    
    if (result.rows.length > 0) {
      res.json({
        success: true,
        settings: result.rows[0]
      });
    } else {
      // Retornar configurações padrão se não existir
      res.json({
        success: true,
        settings: {
          instituicao_nome: "Instituto Lauir Machado",
          instituicao_email: "contato@institutolauir.com.br",
          instituicao_telefone: "(11) 3456-7890",
          instituicao_endereco: "Rua das Flores, 123 - São Paulo, SP",
          email_notifications: true,
          sms_notifications: false,
          push_notifications: true,
          weekly_reports: true,
          two_factor_auth: false,
          password_expiry_days: 90,
          max_login_attempts: 3,
          session_timeout: 60,
          backup_frequency: "daily",
          data_retention_days: 365,
          auto_updates: true,
          debug_mode: false
        }
      });
    }
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// POST - Salvar configurações
router.post('/', async (req, res) => {
  try {
    const settings = req.body;
    
    // Verificar se já existe configuração
    const existing = await pool.query('SELECT id FROM system_settings LIMIT 1');
    
    if (existing.rows.length > 0) {
      // Atualizar existente
      await pool.query(`
        UPDATE system_settings SET
          instituicao_nome = $1,
          instituicao_email = $2,
          instituicao_telefone = $3,
          instituicao_endereco = $4,
          email_notifications = $5,
          sms_notifications = $6,
          push_notifications = $7,
          weekly_reports = $8,
          two_factor_auth = $9,
          password_expiry_days = $10,
          max_login_attempts = $11,
          session_timeout = $12,
          backup_frequency = $13,
          data_retention_days = $14,
          auto_updates = $15,
          debug_mode = $16,
          updated_at = NOW()
        WHERE id = $17
      `, [
        settings.instituicao_nome,
        settings.instituicao_email,
        settings.instituicao_telefone,
        settings.instituicao_endereco,
        settings.email_notifications,
        settings.sms_notifications,
        settings.push_notifications,
        settings.weekly_reports,
        settings.two_factor_auth,
        settings.password_expiry_days,
        settings.max_login_attempts,
        settings.session_timeout,
        settings.backup_frequency,
        settings.data_retention_days,
        settings.auto_updates,
        settings.debug_mode,
        existing.rows[0].id
      ]);
    } else {
      // Inserir novo
      await pool.query(`
        INSERT INTO system_settings (
          instituicao_nome, instituicao_email, instituicao_telefone, instituicao_endereco,
          email_notifications, sms_notifications, push_notifications, weekly_reports,
          two_factor_auth, password_expiry_days, max_login_attempts, session_timeout,
          backup_frequency, data_retention_days, auto_updates, debug_mode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        settings.instituicao_nome,
        settings.instituicao_email,
        settings.instituicao_telefone,
        settings.instituicao_endereco,
        settings.email_notifications,
        settings.sms_notifications,
        settings.push_notifications,
        settings.weekly_reports,
        settings.two_factor_auth,
        settings.password_expiry_days,
        settings.max_login_attempts,
        settings.session_timeout,
        settings.backup_frequency,
        settings.data_retention_days,
        settings.auto_updates,
        settings.debug_mode
      ]);
    }

    res.json({
      success: true,
      message: 'Configurações salvas com sucesso'
    });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;