const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const router = express.Router();

// Configuração do banco
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'instituto_lauir',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS
});

// Função para criar tabelas se não existirem
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

    // Verificar se existe admin
    const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO users (username, email, name, role, status, first_access, password)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, ['admin', 'admin@institutolauir.com.br', 'Administrador', 'Coordenador Geral', 'ativo', true, null]);
    }

    console.log('Banco de dados inicializado com sucesso');
  } catch (error) {
    console.error('Erro ao inicializar banco:', error);
  }
}

initDatabase();

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

    const { username, password } = req.body;

    // Encontrar usuário no banco
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1', 
      [username]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const user = userResult.rows[0];

    // Verificar se usuário está ativo
    if (user.status !== 'ativo') {
      return res.status(403).json({ 
        message: 'Seu acesso ainda não foi liberado pelo administrador. Aguarde aprovação.',
        status: user.status
      });
    }

    // Verificar se é primeiro acesso
    if (user.first_access) {
      return res.status(403).json({ 
        message: 'Primeiro acesso necessário. Defina sua senha primeiro.',
        firstAccess: true
      });
    }

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Retornar dados do usuário sem a senha
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login realizado com sucesso',
      success: true,
      token,
      user: userWithoutPassword
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });

  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
});

// Rota para verificar se é primeiro acesso
router.get('/first-access', async (req, res) => {
  try {
    const adminResult = await pool.query('SELECT first_access FROM users WHERE username = $1', ['admin']);
    const firstAccess = adminResult.rows.length > 0 ? adminResult.rows[0].first_access : false;
    res.json({ firstAccess });
  } catch (error) {
    res.status(500).json({ firstAccess: false });
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

    const { username, password } = req.body;
    
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
router.post('/register', [
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

    const { username, email, name, phone, password } = req.body;
    
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
    `, [username, email, name, phone, hashedPassword, 'Usuário', 'pendente', false]);

    res.json({ 
      message: 'Usuário cadastrado com sucesso! Aguarde a aprovação do administrador para acessar o sistema.' 
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

module.exports = router;