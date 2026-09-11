import {
  WAVE_ONE_TABLES,
  WAVE_TWO_TABLES,
  WAVE_THREE_TABLES,
  WAVE_FOUR_TABLES,
  WAVE_FIVE_TABLES,
  createIndexTarget,
  createTableName,
  foreignKeyTables,
  splitStatements,
} from "./gate-c-wave-five-contract.mjs";

export const SUPPLEMENT_TABLES = ["photo_reextraction_jobs"];
export const PRIOR_TABLES = [
  ...WAVE_ONE_TABLES,
  ...WAVE_TWO_TABLES,
  ...WAVE_THREE_TABLES,
  ...WAVE_FOUR_TABLES,
  ...WAVE_FIVE_TABLES,
].sort();

export function validatePhotoReextractionSupplementSql(sql) {
  const statements = splitStatements(sql);
  if (statements.length === 0) throw new Error("Gate C photo-reextraction supplemental SQL contains no statements.");

  const createdTables = [];
  const indexStatements = [];
  const foreignKeys = [];
  for (const statement of statements) {
    const table = createTableName(statement);
    if (table) {
      if (!SUPPLEMENT_TABLES.includes(table)) throw new Error(`Gate C supplemental SQL creates unreviewed table ${table}.`);
      if (!/PRIMARY\s+KEY\s*\(\s*`id`\s*\)/i.test(statement)) throw new Error(`Gate C supplemental table ${table} lacks explicit id primary key.`);
      createdTables.push(table);
      continue;
    }
    const indexTarget = createIndexTarget(statement);
    if (indexTarget) {
      if (!SUPPLEMENT_TABLES.includes(indexTarget)) throw new Error(`Gate C supplemental index targets unreviewed table ${indexTarget}.`);
      indexStatements.push(statement);
      continue;
    }
    const foreignKey = foreignKeyTables(statement);
    if (!foreignKey) throw new Error(`Gate C supplemental SQL permits only CREATE TABLE, CREATE INDEX, and source-declared foreign-key additions: ${statement.slice(0, 120)}`);
    if (!SUPPLEMENT_TABLES.includes(foreignKey.source)) throw new Error(`Gate C supplemental foreign-key source is unreviewed: ${foreignKey.source}.`);
    if (!PRIOR_TABLES.includes(foreignKey.target)) throw new Error(`Gate C supplemental foreign-key target is outside Waves 1–5: ${foreignKey.source} -> ${foreignKey.target}.`);
    foreignKeys.push({ ...foreignKey, statement });
  }

  const sortedTables = [...createdTables].sort();
  if (JSON.stringify(sortedTables) !== JSON.stringify(SUPPLEMENT_TABLES)) throw new Error(`Gate C supplemental SQL table set differs from the approved disposition: ${sortedTables.join(", ")}.`);
  if (new Set(createdTables).size !== createdTables.length) throw new Error("Gate C supplemental SQL creates a table more than once.");
  return { statements, createdTables: sortedTables, indexStatements, foreignKeys };
}
