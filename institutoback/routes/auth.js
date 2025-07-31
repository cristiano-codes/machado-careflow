const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Mock de usuários (substitua pela consulta do banco)
const users = [
  {
    id: 1,
    username: 'admin',
    email: 'joao.silva@institutolauir.com.br',
    password: null, // Senha será definida no primeiro acesso
    name: 'Dr. João Silva',
    role: 'Coordenador Geral',
    firstAccess: true
  }
];

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

    // Encontrar usuário
    const user = users.find(u => u.username === username || u.email === username);
    if (!user) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    // Verificar se é primeiro acesso
    if (user.firstAccess) {
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
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Rota de verificação de token
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = users.find(u => u.id === decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'Usuário não encontrado' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });

  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
});

// Rota para verificar se é primeiro acesso
router.get('/first-access', (req, res) => {
  const adminUser = users.find(u => u.username === 'admin');
  res.json({ firstAccess: adminUser.firstAccess || false });
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
    
    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex === -1) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const user = users[userIndex];
    if (!user.firstAccess) {
      return res.status(400).json({ message: 'Primeiro acesso já foi realizado' });
    }

    // Criptografar nova senha
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Atualizar usuário
    users[userIndex] = {
      ...user,
      password: hashedPassword,
      firstAccess: false
    };

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
    const existingUser = users.find(u => u.username === username || u.email === email);
    if (existingUser) {
      return res.status(400).json({ 
        message: 'Usuário ou email já existe' 
      });
    }

    // Criptografar senha
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Criar novo usuário
    const newUser = {
      id: users.length + 1,
      username,
      email,
      name,
      phone,
      password: hashedPassword,
      role: 'Usuário',
      firstAccess: false
    };

    users.push(newUser);

    res.json({ 
      message: 'Usuário criado com sucesso! Agora você pode fazer login.' 
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

module.exports = router;