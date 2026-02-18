/**
 * Type declarations for drizzle-orm MySQL driver
 * 
 * Fixes TypeScript errors where MySqlRawQueryResult doesn't have .rows property
 * but the actual runtime implementation does.
 */

import "drizzle-orm/mysql2";

declare module "drizzle-orm/mysql2" {
  interface MySqlRawQueryResult {
    rows: any[];
    insertId?: string | number;
    affectedRows?: number;
  }
}
