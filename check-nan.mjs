import { aiAssessments } from './drizzle/schema.ts';

// Check all column definitions in aiAssessments
const cols = Object.entries(aiAssessments);
console.log('Total columns:', cols.length);
for (const [key, val] of cols) {
  const colName = val?.name ?? val?.config?.name ?? key;
  if (colName === 'nan' || colName === 'NaN' || String(colName).toLowerCase() === 'nan') {
    console.log('NAN COLUMN FOUND:', key, '->', colName);
  }
}
console.log('Done');
