const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const pool = require('../config/pg');

// Middleware de autenticação para todas as rotas de usuários
router.use(authMiddleware);

// Middleware para verificar se é admin
const adminMiddleware = (req, res, next) => {
  const role = (req.user?.role || '').toString().trim().toLowerCase();
  const allowedRoles = ['coordenador geral', 'administrador', 'admin', 'gestao', 'gestão', 'gestor'];

  const hasPermissionFromRole = allowedRoles.includes(role);

  const hasPermissionFromScope = Array.isArray(req.user?.permissions)
    ? req.user.permissions
        .map((permission) =>
          typeof permission === 'string' ? permission.trim().toLowerCase() : ''
        )
        .some((permission) =>
          ['admin:all', 'admin', 'manage:users', 'users:manage'].includes(permission)
        )
    : false;

  if (!hasPermissionFromRole && !hasPermissionFromScope) {
    return res
      .status(403)
      .json({ message: 'Acesso negado. Apenas administradores.' });
  }

  next();
};

async function getProfessionalLinkColumn(client) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'professionals'
        AND column_name IN ('user_id_int', 'user_id')
      ORDER BY CASE column_name WHEN 'user_id_int' THEN 0 ELSE 1 END
      LIMIT 1
    `
  );

  return rows[0]?.column_name || null;
}

// Listar todos os usuários (apenas admin)
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.name,
        u.phone,
        u.role,
        u.status,
        u.must_change_password,
        u.created_at,
        p.id AS professional_id,
        COALESCE(p.funcao, p.specialty) AS professional_label
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          pr.id,
          pr.funcao,
          pr.specialty
        FROM public.professionals pr
        WHERE COALESCE(
          to_jsonb(pr)->>'user_id_int',
          to_jsonb(pr)->>'user_id'
        ) = u.id::text
        ORDER BY pr.updated_at DESC NULLS LAST, pr.created_at DESC NULLS LAST
        LIMIT 1
      ) p ON true
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `);

    res.json({
      message: 'Lista de usuários',
      users: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Listar usuários pendentes de aprovação (apenas admin)
router.get('/pending', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, name, phone, created_at
      FROM users
      WHERE status = 'pendente'
        AND deleted_at IS NULL
      ORDER BY created_at DESC
    `);

    res.json({
      message: 'Usuários pendentes de aprovação',
      users: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar usuários pendentes:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Aprovar usuário (apenas admin)
router.patch('/:id/approve', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING username, name',
      ['ativo', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      message: `Usuário ${result.rows[0].name} aprovado com sucesso!`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao aprovar usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Rejeitar usuário (apenas admin)
router.patch('/:id/reject', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING username, name',
      ['rejeitado', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      message: `Usuário ${result.rows[0].name} rejeitado.`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao rejeitar usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Bloquear usuário (apenas admin)
router.patch('/:id/block', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING username, name',
      ['bloqueado', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      message: `Usuário ${result.rows[0].name} bloqueado.`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao bloquear usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Buscar usuário por ID
// Forcar redefinicao de senha no proximo login (apenas admin)
router.patch('/:id/force-password-change', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const targetUser = await pool.query(
      'SELECT id, role, username, name FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario nao encontrado' });
    }

    const requesterRole = (req.user?.role || '').toString().trim().toLowerCase();
    const targetRole = (targetUser.rows[0].role || '').toString().trim().toLowerCase();

    if (targetRole === 'admin' && requesterRole !== 'admin') {
      return res.status(403).json({ message: 'Apenas administrador pode alterar senha de outro administrador' });
    }

    await pool.query(
      `UPDATE users
          SET must_change_password = true,
              first_access = false
        WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    return res.json({
      message: `Usuario ${targetUser.rows[0].name} precisara redefinir a senha no proximo login.`,
    });
  } catch (error) {
    console.error('Erro ao forcar redefinicao de senha:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Excluir usuario (soft delete) - apenas admin
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = (req.user?.id || '').toString();

    if (requesterId && requesterId === id.toString()) {
      return res.status(400).json({ message: 'Voce nao pode excluir o proprio usuario.' });
    }

    const targetUserResult = await pool.query(
      `SELECT id, name, email, username, role
         FROM users
        WHERE id = $1
          AND deleted_at IS NULL`,
      [id]
    );

    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario nao encontrado' });
    }

    const targetUser = targetUserResult.rows[0];
    const requesterRole = (req.user?.role || '').toString().trim().toLowerCase();
    const targetRole = (targetUser.role || '').toString().trim().toLowerCase();
    const targetUsername = (targetUser.username || '').toString().trim().toLowerCase();

    if (targetUsername === 'admin') {
      return res.status(403).json({ message: 'Nao e permitido excluir o administrador principal.' });
    }

    if (targetRole === 'admin' && requesterRole !== 'admin') {
      return res.status(403).json({ message: 'Apenas administrador pode excluir outro administrador.' });
    }

    await pool.query(
      `UPDATE users
          SET deleted_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL`,
      [id]
    );

    return res.json({
      message: `Usuario ${targetUser.name} excluido com sucesso.`,
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
      },
    });
  } catch (error) {
    console.error('Erro ao excluir usuario:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

router.post('/:id/link-professional', adminMiddleware, async (req, res) => {
  const { id: userId } = req.params;
  const professionalId = (req.body?.professional_id || req.body?.professionalId || '')
    .toString()
    .trim();

  if (!professionalId) {
    return res.status(400).json({ message: 'professional_id e obrigatorio' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const linkColumn = await getProfessionalLinkColumn(client);
    if (!linkColumn) {
      await client.query('ROLLBACK');
      return res.status(500).json({ message: 'Nao foi possivel identificar coluna de vinculo em professionals' });
    }

    const userResult = await client.query(
      `SELECT id, name
         FROM public.users
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE`,
      [userId]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Usuario nao encontrado' });
    }

    const professionalResult = await client.query(
      `
        SELECT
          p.id,
          COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) AS linked_user_id
        FROM public.professionals p
        WHERE p.id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [professionalId]
    );
    if (professionalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Profissional nao encontrado' });
    }

    const currentProfessional = professionalResult.rows[0];
    if (
      currentProfessional.linked_user_id &&
      String(currentProfessional.linked_user_id) !== String(userId)
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Profissional ja vinculado a outro usuario' });
    }

    const alreadyLinkedElsewhere = await client.query(
      `
        SELECT p.id
        FROM public.professionals p
        WHERE p.id <> $2
          AND COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) = $1
        LIMIT 1
      `,
      [String(userId), professionalId]
    );
    if (alreadyLinkedElsewhere.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Usuario ja vinculado a outro profissional' });
    }

    await client.query(
      `
        UPDATE public.professionals
        SET ${linkColumn} = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [userId, professionalId]
    );

    await client.query('COMMIT');
    return res.json({
      message: 'Vinculo atualizado com sucesso',
      link: {
        user_id: userId,
        professional_id: professionalId,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao vincular usuario ao profissional:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

router.post('/:id/unlink-professional', adminMiddleware, async (req, res) => {
  const { id: userId } = req.params;
  const requestedProfessionalId = (
    req.body?.professional_id || req.body?.professionalId || ''
  )
    .toString()
    .trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const linkColumn = await getProfessionalLinkColumn(client);
    if (!linkColumn) {
      await client.query('ROLLBACK');
      return res.status(500).json({ message: 'Nao foi possivel identificar coluna de vinculo em professionals' });
    }

    const targetResult = await client.query(
      `
        SELECT p.id
        FROM public.professionals p
        WHERE COALESCE(
          to_jsonb(p)->>'user_id_int',
          to_jsonb(p)->>'user_id'
        ) = $1
        ${requestedProfessionalId ? 'AND p.id = $2' : ''}
        ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
        LIMIT 1
        FOR UPDATE
      `,
      requestedProfessionalId ? [String(userId), requestedProfessionalId] : [String(userId)]
    );

    if (targetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Nenhum vinculo profissional encontrado para este usuario' });
    }

    const targetProfessionalId = targetResult.rows[0].id;
    await client.query(
      `
        UPDATE public.professionals
        SET ${linkColumn} = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      [targetProfessionalId]
    );

    await client.query('COMMIT');
    return res.json({
      message: 'Vinculo removido com sucesso',
      professional_id: targetProfessionalId,
      user_id: userId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao desvincular usuario do profissional:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.email,
        u.name,
        u.phone,
        u.role,
        u.status,
        u.must_change_password,
        u.created_at,
        p.id AS professional_id,
        COALESCE(p.funcao, p.specialty) AS professional_label
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          pr.id,
          pr.funcao,
          pr.specialty
        FROM public.professionals pr
        WHERE COALESCE(
          to_jsonb(pr)->>'user_id_int',
          to_jsonb(pr)->>'user_id'
        ) = u.id::text
        ORDER BY pr.updated_at DESC NULLS LAST, pr.created_at DESC NULLS LAST
        LIMIT 1
      ) p ON true
      WHERE u.id = $1
        AND u.deleted_at IS NULL
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      message: `Dados do usuário ${id}`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Redefinir senha de um usuário (apenas admin/gestão; admin só por admin)
router.post('/:id/reset-password', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'Senha inválida. Mínimo 6 caracteres.' });
    }

    const targetUser = await pool.query(
      'SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const requesterRole = (req.user?.role || '').toString().trim().toLowerCase();
    const targetRole = (targetUser.rows[0].role || '').toString().trim().toLowerCase();

    // Apenas outro admin pode resetar senha de admin
    if (targetRole === 'admin' && requesterRole !== 'admin') {
      return res.status(403).json({ message: 'Apenas administrador pode redefinir senha de outro administrador' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'UPDATE users SET password = $1, first_access = true, must_change_password = false WHERE id = $2 AND deleted_at IS NULL',
      [hashedPassword, id]
    );

    return res.json({ message: 'Senha redefinida com sucesso' });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

module.exports = router;
