import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const conn = await mysql.createConnection({
  host: new URL(dbUrl).hostname,
  port: Number(new URL(dbUrl).port) || 3306,
  user: new URL(dbUrl).username,
  password: new URL(dbUrl).password,
  database: new URL(dbUrl).pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

const [cols] = await conn.execute(`SHOW COLUMNS FROM ai_assessments`);
const dbCols = cols.map(c => c.Field);
console.log('DB columns:', dbCols.length);
console.log(dbCols.join('\n'));

await conn.end();
