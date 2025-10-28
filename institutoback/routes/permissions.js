const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'instituto_lauir',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
});

router.use(authMiddleware);

const adminMiddleware = (req, res, next) => {
  const role = (req.user?.role || '').toString().trim().toLowerCase();
  const allowedRoles = ['coordenador geral', 'administrador', 'admin'];

  const hasPermissionFromRole = allowedRoles.includes(role);

  const hasPermissionFromScope = Array.isArray(req.user?.permissions)
    ? req.user.permissions
        .map((permission) =>
          typeof permission === 'string' ? permission.trim().toLowerCase() : ''
        )
        .some((permission) =>
          [
            'admin:all',
            'admin',
            'manage:permissions',
            'permissions:manage',
            'manage:users',
            'users:manage',
          ].includes(permission)
        )
    : false;

  if (!hasPermissionFromRole && !hasPermissionFromScope) {
    return res
      .status(403)
      .json({ message: 'Acesso negado. Apenas administradores.' });
  }

  next();
};

const formatModule = (row) => ({
  id: row.id,
  name: row.name,
  display_name: row.display_name,
  description: row.description,
});

const formatPermission = (row) => ({
  id: row.id,
  name: row.name,
  display_name: row.display_name,
  description: row.description,
});

router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, status
         FROM users
        WHERE status IN ('ativo', 'pendente', 'bloqueado', 'rejeitado')
        ORDER BY name`
    );

    res.json({ users: rows });
  } catch (error) {
    console.error('Erro ao buscar usuários para permissões:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.get('/modules', adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, display_name, description
         FROM modules
        ORDER BY display_name`
    );

    res.json({ modules: rows.map(formatModule) });
  } catch (error) {
    console.error('Erro ao buscar módulos:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.get('/permissions', adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, display_name, description
         FROM permissions
        ORDER BY display_name`
    );

    res.json({ permissions: rows.map(formatPermission) });
  } catch (error) {
    console.error('Erro ao buscar permissões:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.get('/users/:id/permissions', adminMiddleware, async (req, res) => {
  const { id: userId } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT up.id,
              up.user_id,
              up.module_id,
              up.permission_id,
              m.name              AS module_name,
              m.display_name      AS module_display_name,
              m.description       AS module_description,
              p.name              AS permission_name,
              p.display_name      AS permission_display_name,
              p.description       AS permission_description
         FROM user_permissions up
         JOIN modules m      ON m.id = up.module_id
         JOIN permissions p  ON p.id = up.permission_id
        WHERE up.user_id = $1
        ORDER BY m.display_name, p.display_name`,
      [userId]
    );

    const permissions = rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      module_id: row.module_id,
      permission_id: row.permission_id,
      module: {
        id: row.module_id,
        name: row.module_name,
        display_name: row.module_display_name,
        description: row.module_description,
      },
      permission: {
        id: row.permission_id,
        name: row.permission_name,
        display_name: row.permission_display_name,
        description: row.permission_description,
      },
    }));

    res.json({ permissions });
  } catch (error) {
    console.error('Erro ao buscar permissões do usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.get('/overview', adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT up.user_id,
              u.name             AS user_name,
              u.email            AS user_email,
              u.role             AS user_role,
              m.id               AS module_id,
              m.name             AS module_name,
              m.display_name     AS module_display_name,
              m.description      AS module_description,
              p.id               AS permission_id,
              p.name             AS permission_name,
              p.display_name     AS permission_display_name,
              p.description      AS permission_description
         FROM user_permissions up
         JOIN users u        ON u.id = up.user_id
         JOIN modules m      ON m.id = up.module_id
         JOIN permissions p  ON p.id = up.permission_id
        ORDER BY u.name, m.display_name, p.display_name`
    );

    const permissions = rows.map((row) => ({
      user_id: row.user_id,
      user: {
        name: row.user_name,
        email: row.user_email,
        role: row.user_role,
      },
      module: {
        id: row.module_id,
        name: row.module_name,
        display_name: row.module_display_name,
        description: row.module_description,
      },
      permission: {
        id: row.permission_id,
        name: row.permission_name,
        display_name: row.permission_display_name,
        description: row.permission_description,
      },
    }));

    res.json({ permissions });
  } catch (error) {
    console.error('Erro ao buscar visão geral de permissões:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.post('/users/:id/grant', adminMiddleware, async (req, res) => {
  const { id: userId } = req.params;
  const { moduleId, permissionId } = req.body || {};

  if (!moduleId || !permissionId) {
    return res
      .status(400)
      .json({ message: 'moduleId e permissionId são obrigatórios' });
  }

  try {
    const existing = await pool.query(
      `SELECT id
         FROM user_permissions
        WHERE user_id = $1
          AND module_id = $2
          AND permission_id = $3`,
      [userId, moduleId, permissionId]
    );

    if (existing.rows.length > 0) {
      return res.json({ message: 'Permissão já concedida' });
    }

    await pool.query(
      `INSERT INTO user_permissions (user_id, module_id, permission_id, granted_by)
       VALUES ($1, $2, $3, $4)`,
      [userId, moduleId, permissionId, req.user?.id || null]
    );

    res.json({ message: 'Permissão concedida com sucesso' });
  } catch (error) {
    console.error('Erro ao conceder permissão:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.post('/users/:id/revoke', adminMiddleware, async (req, res) => {
  const { id: userId } = req.params;
  const { moduleId, permissionId } = req.body || {};

  if (!moduleId || !permissionId) {
    return res
      .status(400)
      .json({ message: 'moduleId e permissionId são obrigatórios' });
  }

  try {
    await pool.query(
      `DELETE FROM user_permissions
        WHERE user_id = $1
          AND module_id = $2
          AND permission_id = $3`,
      [userId, moduleId, permissionId]
    );

    res.json({ message: 'Permissão revogada com sucesso' });
  } catch (error) {
    console.error('Erro ao revogar permissão:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.post('/users/:id/grant-basic', adminMiddleware, async (req, res) => {
  const { id: userId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const permRes = await client.query(
      `SELECT id
         FROM permissions
        WHERE LOWER(name) = 'view'
           OR LOWER(display_name) = 'visualizar'
        LIMIT 1`
    );

    if (permRes.rows.length === 0) {
      throw new Error('Permissão "view" não encontrada');
    }

    const viewPermissionId = permRes.rows[0].id;
    const modulesRes = await client.query(
      `SELECT id FROM modules`
    );

    for (const module of modulesRes.rows) {
      const exists = await client.query(
        `SELECT 1 FROM user_permissions WHERE user_id = $1 AND module_id = $2 AND permission_id = $3`,
        [userId, module.id, viewPermissionId]
      );

      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO user_permissions (user_id, module_id, permission_id, granted_by)
           VALUES ($1, $2, $3, $4)`,
          [userId, module.id, viewPermissionId, req.user?.id || null]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ message: 'Permissões básicas concedidas com sucesso' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao conceder permissões básicas:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

router.post('/users/:id/grant-all', adminMiddleware, async (req, res) => {
  const { id: userId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const modulesRes = await client.query(`SELECT id FROM modules`);
    const permissionsRes = await client.query(`SELECT id FROM permissions`);

    for (const module of modulesRes.rows) {
      for (const permission of permissionsRes.rows) {
        const exists = await client.query(
          `SELECT 1 FROM user_permissions WHERE user_id = $1 AND module_id = $2 AND permission_id = $3`,
          [userId, module.id, permission.id]
        );

        if (exists.rows.length === 0) {
          await client.query(
            `INSERT INTO user_permissions (user_id, module_id, permission_id, granted_by)
             VALUES ($1, $2, $3, $4)`,
            [userId, module.id, permission.id, req.user?.id || null]
          );
        }
      }
    }

    await client.query('COMMIT');

    res.json({ message: 'Todas as permissões foram concedidas com sucesso' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao conceder todas as permissões:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

router.post('/users/:id/revoke-module', adminMiddleware, async (req, res) => {
  const { id: userId } = req.params;
  const { moduleId } = req.body || {};

  if (!moduleId) {
    return res.status(400).json({ message: 'moduleId é obrigatório' });
  }

  try {
    await pool.query(
      `DELETE FROM user_permissions WHERE user_id = $1 AND module_id = $2`,
      [userId, moduleId]
    );

    res.json({ message: 'Todas as permissões do módulo foram revogadas' });
  } catch (error) {
    console.error('Erro ao revogar permissões do módulo:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

module.exports = router;