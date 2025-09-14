const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

// Middleware CORS liberando para qualquer origem
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Rota de teste
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Iniciar o servidor e permitir acesso de outras máquinas na rede
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
