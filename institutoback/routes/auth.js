const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/pg');
const authMiddleware = require('../middleware/auth');
const {
  DEFAULT_ACCESS_SETTINGS,
  readAccessSettings,
} = require('../lib/accessSettings');
const router = express.Router();

// Chave JWT padrão em desenvolvimento
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET obrigat\u00F3rio em produ\u00E7\u00E3o');
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ALLOW_DEMO_LOGIN = String(process.env.ALLOW_DEMO_LOGIN || '').toLowerCase() === 'true';

// Mapeamento simples para remover acentuação de nomes de usuário
const ACCENT_FROM = [
  0x00c1, 0x00c0, 0x00c3, 0x00c2, 0x00c4, 0x00e1, 0x00e0, 0x00e3, 0x00e2, 0x00e4,
  0x00c9, 0x00c8, 0x00ca, 0x00cb, 0x00e9, 0x00e8, 0x00ea, 0x00eb,
  0x00cd, 0x00cc, 0x00ce, 0x00cf, 0x00ed, 0x00ec, 0x00ee, 0x00ef,
  0x00d3, 0x00d2, 0x00d5, 0x00d4, 0x00d6, 0x00f3, 0x00f2, 0x00f5, 0x00f4, 0x00f6,
  0x00da, 0x00d9, 0x00db, 0x00dc, 0x00fa, 0x00f9, 0x00fb, 0x00fc,
  0x00c7, 0x00e7, 0x00d1, 0x00f1,
]
  .map((code) => String.fromCharCode(code))
  .join('');
const ACCENT_TO = 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn';

const removeDiacritics = (value = '') =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// Função para criar tabelas se não existirem (mantido do seu código)
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        password VARCHAR(255),
        role VARCHAR(50) DEFAULT 'Usuário',
        status VARCHAR(20) DEFAULT 'pendente',
        first_access BOOLEAN DEFAULT true,
        must_change_password BOOLEAN DEFAULT false,
        deleted_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Garantir colunas obrigatórias em instalações antigas
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'Usuário'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pendente'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_access BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at)`);

    // Verificar se existe admin e corrigir registros antigos sem senha
    const adminCheck = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL',
      ['admin']
    );
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin', 10);
      await pool.query(`
        INSERT INTO users (username, email, name, role, status, first_access, password)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, ['admin', 'admin@institutolauir.com.br', 'Administrador', 'Coordenador Geral', 'ativo', false, hashedPassword]);
    } else {
      const admin = adminCheck.rows[0];
      if (!admin.password) {
        await pool.query(
          'UPDATE users SET first_access = true, status = $1, role = $2 WHERE id = $3',
          ['ativo', 'Coordenador Geral', admin.id]
        );
      }
    }

    // Conta demo opcional apenas quando explicitamente habilitada via ENV
    if (ALLOW_DEMO_LOGIN) {
      const demoCheck = await pool.query(
        'SELECT * FROM users WHERE (LOWER(username) = $1 OR LOWER(email) = $2) AND deleted_at IS NULL',
        ['demo', 'demo@demo.com']
      );
      if (demoCheck.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('demo123', 10);
        await pool.query(`
          INSERT INTO users (username, email, name, role, status, first_access, password)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, ['demo', 'demo@demo.com', 'Conta Demo', 'Usu\u00E1rio', 'ativo', false, hashedPassword]);
        console.log('Conta demo criada para ambiente com ALLOW_DEMO_LOGIN=true');
      }
    }

    console.log('Banco de dados inicializado com sucesso');
  } catch (error) {
    console.error('Erro ao inicializar banco:', error);
  }
}

initDatabase();

async function readAccessSettingsSafe(contextLabel = 'auth') {
  try {
    return await readAccessSettings(pool);
  } catch (error) {
    if (error?.code !== '42703' && error?.code !== '42P01') {
      console.warn(`[${contextLabel}] Falha ao carregar configuracoes de acesso:`, error?.message || error);
    }
    return { ...DEFAULT_ACCESS_SETTINGS };
  }
}

async function getProfessionalLinkColumn(client) {
  const db = client || pool;
  const { rows } = await db.query(
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

async function autoLinkProfessionalByEmail(user, contextLabel = 'auth') {
  const userId = (user?.id || '').toString().trim();
  const email = (user?.email || '').toString().trim().toLowerCase();
  if (!userId || !email) return null;

  const accessSettings = await readAccessSettingsSafe(`${contextLabel}:settings`);
  if (accessSettings.link_policy !== 'AUTO_LINK_BY_EMAIL') {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const linkColumn = await getProfessionalLinkColumn(client);
    if (!linkColumn) {
      await client.query('ROLLBACK');
      return null;
    }

    const alreadyLinked = await client.query(
      `
        SELECT p.id
        FROM public.professionals p
        WHERE COALESCE(
          to_jsonb(p)->>'user_id_int',
          to_jsonb(p)->>'user_id'
        ) = $1
        LIMIT 1
        FOR UPDATE
      `,
      [userId]
    );
    if (alreadyLinked.rows.length > 0) {
      await client.query('COMMIT');
      return alreadyLinked.rows[0].id;
    }

    const candidateResult = await client.query(
      `
        SELECT p.id
        FROM public.professionals p
        WHERE LOWER(TRIM(COALESCE(p.email, ''))) = $1
          AND COALESCE(
            to_jsonb(p)->>'user_id_int',
            to_jsonb(p)->>'user_id'
          ) IS NULL
        ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
        FOR UPDATE
      `,
      [email]
    );

    if (candidateResult.rows.length !== 1) {
      await client.query('COMMIT');
      if (candidateResult.rows.length > 1) {
        console.warn(
          `[${contextLabel}] Auto-link ignorado por ambiguidade de e-mail (${email}). Matches=${candidateResult.rows.length}`
        );
      }
      return null;
    }

    const professionalId = candidateResult.rows[0].id;
    const updateResult = await client.query(
      `
        UPDATE public.professionals
        SET ${linkColumn} = $1,
            updated_at = NOW()
        WHERE id = $2
          AND COALESCE(
            to_jsonb(professionals)->>'user_id_int',
            to_jsonb(professionals)->>'user_id'
          ) IS NULL
      `,
      [userId, professionalId]
    );

    await client.query('COMMIT');
    if (updateResult.rowCount === 1) {
      return professionalId;
    }

    return null;
  } catch (error) {
    await client.query('ROLLBACK');
    console.warn(`[${contextLabel}] Falha no auto-link por e-mail:`, error?.message || error);
    return null;
  } finally {
    client.release();
  }
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  return scopes
    .map((scope) => (typeof scope === 'string' ? scope.trim().toLowerCase() : ''))
    .filter(Boolean);
}

function hasScope(scopes, target) {
  const normalizedTarget = (target || '').toString().trim().toLowerCase();
  if (!normalizedTarget) return false;

  const normalized = normalizeScopes(scopes);
  return (
    normalized.includes(normalizedTarget) ||
    normalized.includes('*:*') ||
    normalized.includes('*') ||
    normalized.includes('agenda:*')
  );
}

async function resolveProfessionalAuthContext(userId, scopes) {
  const userIdText = (userId || '').toString().trim();
  if (!userIdText) {
    return {
      professional_id: null,
      can_view_all_professionals: false,
      allow_professional_view_others: false,
    };
  }

  let professionalId = null;
  try {
    const professionalResult = await pool.query(
      `
        SELECT p.id
        FROM public.professionals p
        WHERE COALESCE(
          to_jsonb(p)->>'user_id_int',
          to_jsonb(p)->>'user_id'
        ) = $1
        ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
        LIMIT 1
      `,
      [userIdText]
    );
    professionalId = professionalResult.rows[0]?.id || null;
  } catch (error) {
    console.error('[auth] Falha ao resolver professional_id do usuario:', error?.message || error);
  }

  let allowProfessionalViewOthers = false;
  try {
    const settingsResult = await pool.query(
      'SELECT allow_professional_view_others FROM public.system_settings LIMIT 1'
    );
    allowProfessionalViewOthers = settingsResult.rows[0]?.allow_professional_view_others === true;
  } catch (error) {
    if (!['42703', '42P01'].includes(error?.code)) {
      console.error('[auth] Falha ao ler allow_professional_view_others:', error?.message || error);
    }
  }

  const canViewAllByPermission = hasScope(scopes, 'agenda:view_all_professionals');
  const canViewAllProfessionals =
    Boolean(professionalId) && allowProfessionalViewOthers && canViewAllByPermission;

  return {
    professional_id: professionalId,
    can_view_all_professionals: canViewAllProfessionals,
    allow_professional_view_others: allowProfessionalViewOthers,
  };
}

// Rota de login
router.post('/login', [
  body('username').notEmpty().withMessage('Username é obrigatório'),
  body('password').isLength({ min: 3 }).withMessage('Senha deve ter pelo menos 3 caracteres')
], async (req, res) => {
  try {
    // Verificar erros de validação
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const identifier = (req.body?.username || '').trim();
    const password = (req.body?.password || '').toString();

    if (!identifier) {
      return res.status(400).json({ message: 'Credenciais inválidas' });
    }

    const loweredIdentifier = identifier.toLowerCase();
    const normalizedIdentifier = removeDiacritics(identifier);
    const isDemoIdentifier = loweredIdentifier === 'demo' || loweredIdentifier === 'demo@demo.com';

    if (!ALLOW_DEMO_LOGIN && isDemoIdentifier) {
      return res.status(403).json({ message: 'Credenciais inv\u00E1lidas.' });
    }

    // Encontrar usuário no banco (case-insensitive para username/email)
    let userResult = await pool.query(
      'SELECT * FROM users WHERE (LOWER(username) = $1 OR LOWER(email) = $1) AND deleted_at IS NULL',
      [loweredIdentifier]
    );

    // Fallback para permitir login com nomes sem acentuação (ex.: Gestao → Gestão)
    const shouldTryAccentInsensitiveLookup =
      userResult.rows.length === 0 &&
      identifier &&
      !identifier.includes('@') &&
      normalizedIdentifier &&
      normalizedIdentifier !== loweredIdentifier;

    if (shouldTryAccentInsensitiveLookup) {
      try {
        userResult = await pool.query(
          'SELECT * FROM users WHERE LOWER(TRANSLATE(username, $2, $3)) = $1 AND deleted_at IS NULL',
          [normalizedIdentifier, ACCENT_FROM, ACCENT_TO]
        );
      } catch (fallbackError) {
        console.warn(
          '[auth][login] Falha no fallback sem acento; seguindo com resultado principal:',
          fallbackError?.message || fallbackError
        );
      }
    }

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const user = userResult.rows[0];
    const userEmail = (user.email || '').toString().trim().toLowerCase();
    const userUsername = (user.username || '').toString().trim().toLowerCase();
    const isDemoAccount = userUsername === 'demo' || userEmail === 'demo@demo.com';

    if (!ALLOW_DEMO_LOGIN && isDemoAccount) {
      return res.status(403).json({ message: 'Credenciais inv\u00E1lidas.' });
    }

    // Verificar se usuário está ativo
    const userStatus = (user.status || '').toString().trim().toLowerCase();
    if (userStatus !== 'ativo') {
      return res.status(403).json({
        message: 'Seu acesso ainda não foi liberado pelo administrador. Aguarde aprovação.',
        status: user.status
      });
    }

    // Verificar se é primeiro acesso ou se falta senha
    if (user.first_access || !user.password) {
      return res.status(403).json({
        message: 'Primeiro acesso necessário. Defina sua senha primeiro.',
        firstAccess: true
      });
    }

    // Verificar senha (compatível com hash e texto puro legado)
    let isValidPassword = false;
    if (user.password && user.password.startsWith('$2')) {
      isValidPassword = await bcrypt.compare(password, user.password);
    } else if (typeof user.password === 'string') {
      isValidPassword = password === user.password;
    }
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }
    await autoLinkProfessionalByEmail(user, 'auth:login');

    // >>> NOVO: buscar permissões do usuário
    const permsRes = await pool.query(
      `SELECT m.name AS module_name, p.name AS permission_name
         FROM user_permissions up
         JOIN modules m ON m.id = up.module_id
         JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = $1`,
      [user.id]
    );
    const permissions = permsRes.rows
      .map((row) => {
        const moduleName = (row.module_name || '').toString().trim().toLowerCase();
        const permissionName = (row.permission_name || '').toString().trim().toLowerCase();
        if (!moduleName || !permissionName) return '';
        return `${moduleName}:${permissionName}`;
      })
      .filter(Boolean);

    const professionalAuthContext = await resolveProfessionalAuthContext(user.id, permissions);

    // Gerar token JWT (mantido 24h neste passo)
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        must_change_password: user.must_change_password === true,
        professional_id: professionalAuthContext.professional_id,
        can_view_all_professionals: professionalAuthContext.can_view_all_professionals,
        permissions // <<< inclui no payload
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Retornar dados do usuário sem a senha
    const { password: _pw, ...userWithoutPassword } = user;

    res.json({
      message: 'Login realizado com sucesso',
      success: true,
      token,
      user: {
        ...userWithoutPassword,
        must_change_password: user.must_change_password === true,
        professional_id: professionalAuthContext.professional_id,
        can_view_all_professionals: professionalAuthContext.can_view_all_professionals,
        allow_professional_view_others:
          professionalAuthContext.allow_professional_view_others,
        permissions
      } // <<< inclui no JSON
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Rota de verificação de token
router.get('/verify', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    await autoLinkProfessionalByEmail(user, 'auth:verify');

    // >>> NOVO: buscar permissões também no verify
    const permsRes = await pool.query(
      `SELECT m.name AS module_name, p.name AS permission_name
         FROM user_permissions up
         JOIN modules m ON m.id = up.module_id
         JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = $1`,
      [user.id]
    );
    const permissions = permsRes.rows
      .map((row) => {
        const moduleName = (row.module_name || '').toString().trim().toLowerCase();
        const permissionName = (row.permission_name || '').toString().trim().toLowerCase();
        if (!moduleName || !permissionName) return '';
        return `${moduleName}:${permissionName}`;
      })
      .filter(Boolean);

    const professionalAuthContext = await resolveProfessionalAuthContext(user.id, permissions);

    const { password: _, ...userWithoutPassword } = user;
    res.json({
      success: true,
      user: {
        ...userWithoutPassword,
        must_change_password: user.must_change_password === true,
        professional_id: professionalAuthContext.professional_id,
        can_view_all_professionals: professionalAuthContext.can_view_all_professionals,
        allow_professional_view_others:
          professionalAuthContext.allow_professional_view_others,
        permissions
      }
    });

  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
});

// Rota para verificar se é primeiro acesso
// Rota para alteracao de senha do usuario autenticado
router.put('/change-password', authMiddleware, [
  body('currentPassword')
    .isString()
    .notEmpty()
    .withMessage('Senha atual e obrigatoria'),
  body('newPassword')
    .isString()
    .isLength({ min: 8 })
    .withMessage('A nova senha deve ter no minimo 8 caracteres'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados invalidos',
        errors: errors.array(),
      });
    }

    const userId = req.user?.id;
    const currentPassword = (req.body?.currentPassword || '').toString();
    const newPassword = (req.body?.newPassword || '').toString();

    const userResult = await pool.query(
      'SELECT id, password FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario nao encontrado',
      });
    }

    const user = userResult.rows[0];

    let currentPasswordMatches = false;
    if (user.password && user.password.startsWith('$2')) {
      currentPasswordMatches = await bcrypt.compare(currentPassword, user.password);
    } else if (typeof user.password === 'string') {
      currentPasswordMatches = currentPassword === user.password;
    }

    if (!currentPasswordMatches) {
      return res.status(400).json({
        success: false,
        message: 'Senha atual invalida',
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'A nova senha deve ser diferente da senha atual',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users
          SET password = $1,
              first_access = false,
              must_change_password = false
        WHERE id = $2`,
      [hashedPassword, userId]
    );

    return res.json({
      success: true,
      message: 'Senha alterada com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

router.get('/first-access', async (req, res) => {
  try {
    const adminResult = await pool.query(
      'SELECT username, first_access FROM users WHERE username = $1 AND deleted_at IS NULL',
      ['admin']
    );
    const firstAccess = adminResult.rows.length > 0 ? adminResult.rows[0].first_access : false;
    const username = adminResult.rows.length > 0 ? adminResult.rows[0].username : undefined;
    res.json({ firstAccess, username });
  } catch (error) {
    console.error('Erro ao verificar first-access:', error);
    res.json({ firstAccess: false });
  }
});

// Rota para verificar se um usuário existe (por username ou email)
router.get('/check-user', async (req, res) => {
  const identifier = (req.query?.identifier || '').trim();

  if (!identifier) {
    return res.status(400).json({
      message: 'Parâmetro "identifier" é obrigatório'
    });
  }

  try {
    const loweredIdentifier = identifier.toLowerCase();
    const normalizedIdentifier = removeDiacritics(identifier);

    let result = await pool.query(
      `SELECT id, username, email, status, first_access
         FROM users
        WHERE (LOWER(username) = $1
           OR LOWER(email) = $1)
          AND deleted_at IS NULL
        LIMIT 1`,
      [loweredIdentifier]
    );

    if (result.rows.length === 0 && identifier && !identifier.includes('@') && normalizedIdentifier) {
      result = await pool.query(
        `SELECT id, username, email, status, first_access
           FROM users
          WHERE LOWER(TRANSLATE(username, $2, $3)) = $1
            AND deleted_at IS NULL
          LIMIT 1`,
        [normalizedIdentifier, ACCENT_FROM, ACCENT_TO]
      );
    }

    if (result.rows.length === 0) {
      return res.json({ exists: false });
    }

    const user = result.rows[0];
    res.json({
      exists: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        firstAccess: user.first_access
      }
    });
  } catch (error) {
    console.error('Erro ao verificar usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Rota para listar usuários sem executar SQL manualmente
router.get('/users', async (req, res) => {
  const search = (req.query?.search || '').trim();

  try {
    const params = [];
    const whereClauses = [];

    if (search) {
      const loweredSearch = `%${search.toLowerCase()}%`;
      params.push(loweredSearch);
      const usernameIndex = params.length;
      whereClauses.push(`LOWER(username) LIKE $${usernameIndex}`);

      params.push(loweredSearch);
      const emailIndex = params.length;
      whereClauses.push(`LOWER(email) LIKE $${emailIndex}`);

      params.push(loweredSearch);
      const nameIndex = params.length;
      whereClauses.push(`LOWER(name) LIKE $${nameIndex}`);

      const normalizedSearch = `%${removeDiacritics(search)}%`;
      params.push(ACCENT_FROM);
      const accentFromIndex = params.length;
      params.push(ACCENT_TO);
      const accentToIndex = params.length;
      params.push(normalizedSearch);
      const normalizedIndex = params.length;

      whereClauses.push(
        `LOWER(TRANSLATE(username, $${accentFromIndex}, $${accentToIndex})) LIKE $${normalizedIndex}`
      );
      whereClauses.push(
        `LOWER(TRANSLATE(name, $${accentFromIndex}, $${accentToIndex})) LIKE $${normalizedIndex}`
      );
    }

    const baseQuery = `SELECT id, username, email, name, phone, role, status, first_access, must_change_password, created_at
                         FROM users
                        WHERE deleted_at IS NULL`;
    const whereQuery = whereClauses.length ? ` AND (${whereClauses.join(' OR ')})` : '';
    const orderQuery = ' ORDER BY created_at DESC';

    const result = await pool.query(`${baseQuery}${whereQuery}${orderQuery}`, params);

    const users = result.rows.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      firstAccess: user.first_access,
      must_change_password: user.must_change_password === true,
      createdAt: user.created_at
    }));

    res.json({
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Rota para definir senha no primeiro acesso
router.post('/setup-password', [
  body('username').notEmpty().withMessage('Username é obrigatório'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Confirmação de senha não confere');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const username = (req.body?.username || '').trim();
    const password = (req.body?.password || '').toString();

    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL',
      [username]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];
    if (!user.first_access) {
      return res.status(400).json({ message: 'Primeiro acesso já foi realizado' });
    }

    // Criptografar nova senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Atualizar usuário
    await pool.query(
      'UPDATE users SET password = $1, first_access = false, must_change_password = false WHERE id = $2',
      [hashedPassword, user.id]
    );

    res.json({
      message: 'Senha definida com sucesso! Agora você pode fazer login.'
    });

  } catch (error) {
    console.error('Erro no setup da senha:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Rota para registro de novos usuários
router.post('/register', async (req, res, next) => {
  const accessSettings = await readAccessSettingsSafe('auth:register');
  if (accessSettings.registration_mode !== 'PUBLIC_SIGNUP') {
    return res.status(403).json({
      message: 'Cadastro publico desativado pelo administrador.',
    });
  }

  req.accessSettings = accessSettings;
  return next();
}, [
  body('username').notEmpty().withMessage('Username e obrigatorio'),
  body('email').isEmail().withMessage('Email deve ser valido'),
  body('name').notEmpty().withMessage('Nome e obrigatorio'),
  body('phone').notEmpty().withMessage('Telefone e obrigatorio'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Confirmacao de senha nao confere');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Dados invalidos',
        errors: errors.array()
      });
    }

    const username = (req.body?.username || '').trim();
    const email = (req.body?.email || '').trim().toLowerCase();
    const name = (req.body?.name || '').trim();
    const phone = (req.body?.phone || '').trim();
    const password = (req.body?.password || '').toString();
    const accessSettings = req.accessSettings || (await readAccessSettingsSafe('auth:register:handler'));

    if (!username || !email || !name || !phone) {
      return res.status(400).json({ message: 'Dados obrigatorios ausentes' });
    }

    const existingUsername = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
      [username]
    );
    if (existingUsername.rows.length > 0) {
      return res.status(409).json({ message: 'Username ja cadastrado.' });
    }

    if (accessSettings.block_duplicate_email) {
      const existingEmail = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
      );
      if (existingEmail.rows.length > 0) {
        return res.status(409).json({ message: 'E-mail ja cadastrado.' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const defaultStatus =
      accessSettings.public_signup_default_status === 'ativo' ? 'ativo' : 'pendente';

    await pool.query(
      'INSERT INTO users (username, email, name, phone, password, role, status, first_access, must_change_password) ' +
        'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        username,
        email,
        name,
        phone,
        hashedPassword,
        'Usuario',
        defaultStatus,
        false,
        false,
      ]
    );

    return res.status(201).json({
      success: true,
      status: defaultStatus,
      message:
        defaultStatus === 'ativo'
          ? 'Usuario cadastrado com sucesso! Seu acesso ja esta liberado.'
          : 'Usuario cadastrado com sucesso! Aguarde a aprovacao do administrador para acessar o sistema.',
    });
  } catch (error) {
    if (error?.code === '23505') {
      const constraint = (error?.constraint || '').toString().toLowerCase();
      if (constraint.includes('users_email')) {
        return res.status(409).json({ message: 'E-mail ja cadastrado.' });
      }
      if (constraint.includes('users_username')) {
        return res.status(409).json({ message: 'Username ja cadastrado.' });
      }
      return res.status(409).json({ message: 'Conflito ao cadastrar usuario.' });
    }

    console.error('Erro no registro:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

module.exports = router;


