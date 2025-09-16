const { query } = require('../db');
const fs = require('fs');
const path = require('path');

async function runSeeds() {
  try {
    console.log('🌱 Executando seeds...');
    
    const seedSQL = fs.readFileSync(path.join(__dirname, '../seeds/init.sql'), 'utf8');
    
    // Dividir por statements SQL individuais (separados por ';')
    const statements = seedSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement) {
        await query(statement);
      }
    }
    
    console.log('✅ Seeds executados com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao executar seeds:', error);
    process.exit(1);
  }
}

runSeeds();