/**
 * Type-safe utilities for extracting insert IDs from Drizzle ORM results
 * 
 * Drizzle ORM with MySQL2 driver returns: [ResultSetHeader, null]
 * - ResultSetHeader.insertId is a number
 * - Second element is always null
 */

/**
 * MySQL2 ResultSetHeader structure
 */
interface MySQL2ResultSetHeader {
  fieldCount: number;
  affectedRows: number;
  insertId: number;
  info: string;
  serverStatus: number;
  warningStatus: number;
  changedRows: number;
}

/**
 * Drizzle insert result type for MySQL2 driver
 */
type DrizzleInsertResult = [MySQL2ResultSetHeader, null];

/**
 * Safely extract the inserted ID from a Drizzle ORM insert operation
 * 
 * @param result - The result from db.insert().values()
 * @returns The inserted ID as a number
 * @throws Error if the result structure is invalid or insertId is missing
 * 
 * @example
 * const result = await db.insert(comments).values({ content: "Hello" });
 * const commentId = extractInsertId(result); // number
 */
export function extractInsertId(result: DrizzleInsertResult): number {
  // Validate result structure
  if (!Array.isArray(result)) {
    throw new Error("Invalid Drizzle insert result: expected array");
  }

  const [resultSet] = result;

  if (!resultSet || typeof resultSet !== 'object') {
    throw new Error("Invalid Drizzle insert result: missing result set");
  }

  const { insertId } = resultSet;

  if (typeof insertId !== 'number') {
    throw new Error(`Invalid insertId type: expected number, got ${typeof insertId}`);
  }

  if (insertId === 0 || insertId < 0) {
    throw new Error(`Invalid insertId value: ${insertId}`);
  }

  return insertId;
}

/**
 * Safely extract BigInt insert ID (for databases that use BigInt)
 * 
 * @param result - The result from db.insert().values()
 * @returns The inserted ID as a BigInt
 * @throws Error if the result structure is invalid or insertId is missing
 */
export function extractInsertIdBigInt(result: DrizzleInsertResult): bigint {
  const id = extractInsertId(result);
  return BigInt(id);
}

/**
 * Extract multiple insert IDs from batch insert operations
 * 
 * Note: MySQL2 only returns the FIRST insertId in batch inserts.
 * Subsequent IDs are calculated as firstId + index.
 * 
 * @param result - The result from db.insert().values([...])
 * @param count - Number of rows inserted
 * @returns Array of inserted IDs
 */
export function extractBatchInsertIds(result: DrizzleInsertResult, count: number): number[] {
  const firstId = extractInsertId(result);
  return Array.from({ length: count }, (_, i) => firstId + i);
}
