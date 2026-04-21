// Check what column names Drizzle generates for aiAssessments
import { aiAssessments } from './drizzle/schema.ts';

// Access the Drizzle Table Symbol to get column definitions
const Table = Object.getOwnPropertySymbols(aiAssessments).find(s => s.toString().includes('Columns') || s.toString().includes('columns'));
if (!Table) {
  // Try direct property access
  const cols = aiAssessments;
  for (const [key, val] of Object.entries(cols)) {
    if (val && typeof val === 'object' && val.name !== undefined) {
      if (val.name === 'nan' || val.name === 'NaN' || String(val.name).toLowerCase() === 'nan') {
        console.log('NAN COLUMN:', key, '->', val.name);
      }
    }
  }
  console.log('Done checking direct properties');
} else {
  const columns = aiAssessments[Table];
  for (const [key, col] of Object.entries(columns)) {
    if (col.name === 'nan' || col.name === 'NaN') {
      console.log('NAN COLUMN FOUND:', key, '->', col.name);
    }
  }
  console.log('Total columns checked:', Object.keys(columns).length);
}
