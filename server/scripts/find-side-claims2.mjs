import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find all tables
const [tables] = await conn.execute('SHOW TABLES');
console.log('\n=== Tables ===');
for (const row of tables) {
  console.log(Object.values(row)[0]);
}

await conn.end();
