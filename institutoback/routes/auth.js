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
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Dr. João Silva',
    role: 'Coordenador Geral'
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

module.exports = router;