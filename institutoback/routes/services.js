const express = require('express');
const router = express.Router();
const { query } = require('../db');
const authMiddleware = require('../middleware/auth');

// Middleware de autenticação para todas as rotas
router.use(authMiddleware);

// GET - Listar serviços
router.get('/', async (req, res) => {
  try {
    const { q, active, limit = 50, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM services WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (q) {
      paramCount++;
      sql += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${q}%`);
    }

    if (active !== undefined) {
      paramCount++;
      sql += ` AND active = $${paramCount}`;
      params.push(active === 'true');
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(Math.min(parseInt(limit), 100), parseInt(offset));

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar serviços:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST - Criar serviço
router.post('/', async (req, res) => {
  try {
    const { name, description, price, duration, active = true } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const validPrice = price ? parseFloat(price) : null;
    const validDuration = duration ? parseInt(duration) : null;

    if (validPrice !== null && (isNaN(validPrice) || validPrice < 0)) {
      return res.status(400).json({ error: 'Preço deve ser um número válido' });
    }

    if (validDuration !== null && (isNaN(validDuration) || validDuration <= 0)) {
      return res.status(400).json({ error: 'Duração deve ser um número inteiro positivo' });
    }

    const result = await query(
      `INSERT INTO services (name, description, price, duration, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id`,
      [name.trim(), description?.trim() || null, validPrice, validDuration, active]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error('Erro ao criar serviço:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PUT - Atualizar serviço
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, duration, active } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 0;

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
      }
      paramCount++;
      updates.push(`name = $${paramCount}`);
      params.push(name.trim());
    }

    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description?.trim() || null);
    }

    if (price !== undefined) {
      const validPrice = price ? parseFloat(price) : null;
      if (validPrice !== null && (isNaN(validPrice) || validPrice < 0)) {
        return res.status(400).json({ error: 'Preço deve ser um número válido' });
      }
      paramCount++;
      updates.push(`price = $${paramCount}`);
      params.push(validPrice);
    }

    if (duration !== undefined) {
      const validDuration = duration ? parseInt(duration) : null;
      if (validDuration !== null && (isNaN(validDuration) || validDuration <= 0)) {
        return res.status(400).json({ error: 'Duração deve ser um número inteiro positivo' });
      }
      paramCount++;
      updates.push(`duration = $${paramCount}`);
      params.push(validDuration);
    }

    if (active !== undefined) {
      paramCount++;
      updates.push(`active = $${paramCount}`);
      params.push(active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `UPDATE services SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    const result = await query(sql, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao atualizar serviço:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE - Arquivar serviço
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE services SET active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao arquivar serviço:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;