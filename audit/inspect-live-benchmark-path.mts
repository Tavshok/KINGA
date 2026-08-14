import { eq } from "drizzle-orm";
import { aiAssessments } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  getComponentBenchmarks,
  getComponentBenchmarksFromTrainingData,
} from "../server/db/intelligence-db";

const assessmentId = 20370001;
const db = await getDb();
if (!db) throw new Error("Database is unavailable for the read-only diagnostic.");

const [assessment] = await db
  .select({ damagedComponentsJson: aiAssessments.damagedComponentsJson })
  .from(aiAssessments)
  .where(eq(aiAssessments.id, assessmentId))
  .limit(1);

const damagedComponents = Array.isArray(JSON.parse(assessment?.damagedComponentsJson ?? "[]"))
  ? JSON.parse(assessment?.damagedComponentsJson ?? "[]") as Array<{ name?: unknown }>
  : [];
const names = damagedComponents
  .map((component) => typeof component.name === "string" ? component.name.trim() : "")
  .filter(Boolean);

let historical: Array<{ component: string }> = [];
let training: Array<{ component: string }> = [];
let failure: string | null = null;
try {
  historical = await getComponentBenchmarks(names, null);
  const historicalNames = new Set(historical.map((entry) => entry.component));
  const missingFromHistorical = names.filter((name) => !historicalNames.has(name));
  training = await getComponentBenchmarksFromTrainingData(missingFromHistorical, null);
} catch (error) {
  failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
const historicalNames = new Set(historical.map((entry) => entry.component));

console.log(JSON.stringify({
  assessmentId,
  damagedComponentCount: names.length,
  historicalBenchmarkCount: historical.length,
  trainingBenchmarkCount: training.length,
  failure,
  missingBenchmarkCount: names.length - historical.length - training.length,
  missingBenchmarkNames: names.filter((name) =>
    !historicalNames.has(name) && !training.some((entry) => entry.component === name)
  ),
}, null, 2));

process.exit(0);
