import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [items] = await conn.query(`
  SELECT id, description, category,
         CAST(unit_price AS DECIMAL(10,2)) as up,
         CAST(line_total AS DECIMAL(10,2)) as lt,
         is_repair, is_replacement
  FROM quote_line_items WHERE quote_id = 7470003 ORDER BY id
`);
let partsSum = 0, labourSum = 0;
for (const li of items) {
  const isLab = li.category === 'labor' || li.category === 'paint' || li.category === 'diagnostic'
    || (li.is_repair === 1 && parseFloat(li.up) === 0);
  if (isLab) labourSum += parseFloat(li.lt); else partsSum += parseFloat(li.lt);
  console.log(isLab ? '[LAB]' : '[PRT]', li.id, JSON.stringify(li.description),
    'cat=' + li.category, 'is_repair=' + li.is_repair, 'up=' + li.up, 'lt=' + li.lt);
}
console.log('Parts sum:', partsSum.toFixed(2), '| Labour sum:', labourSum.toFixed(2),
  '| Total:', (partsSum + labourSum).toFixed(2), '| Header: 25553.00');
await conn.end();
