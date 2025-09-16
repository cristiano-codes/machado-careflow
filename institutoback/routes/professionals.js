const express = require('express');
const router = express.Router();
const { query } = require('../db');
const authMiddleware = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
router.use(authMiddleware);

// GET - Listar profissionais
router.get('/', async (req, res) => {
  try {
    const { q, status, limit = 50, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM professionals WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (q) {
      paramCount++;
      sql += ` AND (email ILIKE $${paramCount} OR specialty ILIKE $${paramCount})`;
      params.push(`%${q}%`);
    }

    if (status) {
      paramCount++;
      sql += ` AND status = $${paramCount}`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(Math.min(parseInt(limit), 100), parseInt(offset));

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar profissionais:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST - Criar profissional
router.post('/', async (req, res) => {
  try {
    const { user_id, crp, specialty, email, phone, bio, status = 'active' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    const normalizedStatus = ['active', 'inactive'].includes(status) ? status : 'active';

    const result = await query(
      `INSERT INTO professionals (user_id, crp, specialty, email, phone, bio, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id`,
      [user_id || null, crp?.trim() || null, specialty?.trim() || null, email.trim(), phone?.trim() || null, bio?.trim() || null, normalizedStatus]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error('Erro ao criar profissional:', error);
    if (error.code === '23505') { // Unique violation
      res.status(409).json({ error: 'Email já cadastrado' });
    } else {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
});

// PUT - Atualizar profissional
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { crp, specialty, email, phone, bio, status } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 0;

    if (crp !== undefined) {
      paramCount++;
      updates.push(`crp = $${paramCount}`);
      params.push(crp?.trim() || null);
    }

    if (specialty !== undefined) {
      paramCount++;
      updates.push(`specialty = $${paramCount}`);
      params.push(specialty?.trim() || null);
    }

    if (email !== undefined) {
      if (!email.trim()) {
        return res.status(400).json({ error: 'Email é obrigatório' });
      }
      paramCount++;
      updates.push(`email = $${paramCount}`);
      params.push(email.trim());
    }

    if (phone !== undefined) {
      paramCount++;
      updates.push(`phone = $${paramCount}`);
      params.push(phone?.trim() || null);
    }

    if (bio !== undefined) {
      paramCount++;
      updates.push(`bio = $${paramCount}`);
      params.push(bio?.trim() || null);
    }

    if (status !== undefined) {
      const normalizedStatus = ['active', 'inactive'].includes(status) ? status : 'active';
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(normalizedStatus);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `UPDATE professionals SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    const result = await query(sql, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Profissional não encontrado' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao atualizar profissional:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Email já cadastrado' });
    } else {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
});

// DELETE - Remover profissional (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE professionals SET status = $1, updated_at = NOW() WHERE id = $2',
      ['inactive', id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Profissional não encontrado' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover profissional:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;