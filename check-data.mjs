import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await createConnection(process.env.DATABASE_URL);

const [quotes] = await conn.execute('SELECT * FROM panel_beater_quotes WHERE claim_id = 1740456');
console.log('Panel beater quotes:', JSON.stringify(quotes, null, 2));

const [docs] = await conn.execute('SELECT id, original_filename, s3_url FROM ingestion_documents WHERE id = (SELECT source_document_id FROM claims WHERE id = 1740456)');
console.log('Source doc:', JSON.stringify(docs, null, 2));

const [claimRow] = await conn.execute('SELECT id, claim_number, vehicle_make, vehicle_model, vehicle_year, vehicle_registration, incident_date, incident_description, incident_location, damage_photos, source_document_id FROM claims WHERE id = 1740456');
console.log('Claim:', JSON.stringify(claimRow, null, 2));

await conn.end();
