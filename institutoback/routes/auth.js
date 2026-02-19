const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const router = express.Router();

// Chave JWT padrão em desenvolvimento
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET obrigat\u00F3rio em produ\u00E7\u00E3o');
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ALLOW_DEMO_LOGIN = String(process.env.ALLOW_DEMO_LOGIN || '').toLowerCase() === 'true';

// Configuração do banco (Railway usa DATABASE_URL)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // ssl: { rejectUnauthorized: false }, // só habilite se seu Postgres exigir SSL
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'instituto_lauir',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS
    });


// Mapeamento simples para remover acentuação de nomes de usuário
const ACCENT_FROM = 'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇçÑñ';
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Garantir colunas obrigatórias em instalações antigas
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'Usuário'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pendente'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_access BOOLEAN DEFAULT true`);

    // Verificar se existe admin e corrigir registros antigos sem senha
    const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
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
      const demoCheck = await pool.query('SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $2', ['demo', 'demo@demo.com']);
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

async function isPublicRegistrationEnabled() {
  try {
    const result = await pool.query(
      `SELECT allow_public_registration FROM public.system_settings LIMIT 1`
    );

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].allow_public_registration === true;
  } catch (error) {
    if (error?.code === '42703' || error?.code === '42P01') {
      return false;
    }

    console.error('Erro ao verificar cadastro publico:', error);
    return false;
  }
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
      'SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1',
      [loweredIdentifier]
    );

    // Fallback para permitir login com nomes sem acentuação (ex.: Gestao → Gestão)
    if (userResult.rows.length === 0 && identifier && !identifier.includes('@') && normalizedIdentifier) {
      userResult = await pool.query(
        'SELECT * FROM users WHERE LOWER(TRANSLATE(username, $2, $3)) = $1',
        [normalizedIdentifier, ACCENT_FROM, ACCENT_TO]
      );
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

    // Gerar token JWT (mantido 24h neste passo)
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
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
      user: { ...userWithoutPassword, permissions } // <<< inclui no JSON
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
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

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

    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: { ...userWithoutPassword, permissions } });

  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
});

// Rota para verificar se é primeiro acesso
router.get('/first-access', async (req, res) => {
  try {
    const adminResult = await pool.query('SELECT username, first_access FROM users WHERE username = $1', ['admin']);
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
        WHERE LOWER(username) = $1
           OR LOWER(email) = $1
        LIMIT 1`,
      [loweredIdentifier]
    );

    if (result.rows.length === 0 && identifier && !identifier.includes('@') && normalizedIdentifier) {
      result = await pool.query(
        `SELECT id, username, email, status, first_access
           FROM users
          WHERE LOWER(TRANSLATE(username, $2, $3)) = $1
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

    const baseQuery = `SELECT id, username, email, name, phone, role, status, first_access, created_at
                         FROM users`;
    const whereQuery = whereClauses.length ? ` WHERE ${whereClauses.join(' OR ')}` : '';
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

    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
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
      'UPDATE users SET password = $1, first_access = false WHERE id = $2',
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
router.post('/register', async (_req, res, next) => {
  const enabled = await isPublicRegistrationEnabled();
  if (!enabled) {
    return res.status(403).json({ message: 'Cadastro indispon\u00EDvel.' });
  }
  return next();
}, [
  body('username').notEmpty().withMessage('Username é obrigatório'),
  body('email').isEmail().withMessage('Email deve ser válido'),
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('phone').notEmpty().withMessage('Telefone é obrigatório'),
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
    const email = (req.body?.email || '').trim();
    const name = (req.body?.name || '').trim();
    const phone = (req.body?.phone || '').trim();
    const password = (req.body?.password || '').toString();

    if (!username || !email || !name || !phone) {
      return res.status(400).json({ message: 'Dados obrigatórios ausentes' });
    }

    // Verificar se usuário já existe
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        message: 'Usuário ou email já existe'
      });
    }

    // Criptografar senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar novo usuário (status pendente para aprovação do admin)
    await pool.query(`
      INSERT INTO users (username, email, name, phone, password, role, status, first_access)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      username,
      email.toLowerCase(),
      name,
      phone,
      hashedPassword,
      'Usuário',
      'pendente',
      false,
    ]);

    res.json({
      message: 'Usuário cadastrado com sucesso! Aguarde a aprovação do administrador para acessar o sistema.'
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

module.exports = router;
