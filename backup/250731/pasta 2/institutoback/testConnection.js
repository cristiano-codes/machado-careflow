const { Sequelize } = require('sequelize');

// Configurações do banco de dados
const DB_HOST = 'localhost';
const DB_PORT = 5432;
const DB_NAME = 'sistema';
const DB_USER = 'postgres';
const DB_PASS = '110336';

// Criação da instância do Sequelize
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
    host: DB_HOST,
    dialect: 'postgres',
    port: DB_PORT,
});

// Teste a conexão
sequelize.authenticate()
    .then(() => {
        console.log('Conexão com o banco de dados estabelecida com sucesso!');
    })
    .catch(err => {
        console.error('Não foi possível conectar ao banco de dados:', err);
    });