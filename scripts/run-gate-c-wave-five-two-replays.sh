#!/usr/bin/env bash
# Gate C Wave 5: loopback-only disposable composed replay orchestrator.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
host="127.0.0.1"
port="3317"
evidence_root="$repo_root/audit/gate-c-scratch-baseline/wave-05-evidence"
wave_one="$repo_root/audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql"
wave_two="$repo_root/audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql"
wave_three="$repo_root/audit/gate-c-scratch-baseline/wave-03-generated/wave-03-assessment-evidence-reporting.sql"
wave_four="$repo_root/audit/gate-c-scratch-baseline/wave-04-generated/wave-04-operational-portals-channels.sql"
wave_five="$repo_root/audit/gate-c-scratch-baseline/wave-05-generated/wave-05-intelligence-learning-analytics.sql"
run_token=$(date -u +%Y%m%d%H%M%S)_$$
active_database=""
active_evidence_dir=""

for prerequisite in "$wave_one" "$wave_two" "$wave_three" "$wave_four" "$wave_five"; do [[ -f "$prerequisite" ]] || { echo "Missing reviewed SQL prerequisite: $prerequisite" >&2; exit 1; }; done
mysql_admin=(mysql --protocol=TCP -h"$host" -P"$port" -uroot)
dispose_active() {
  local exit_status=$?
  if [[ -z "$active_database" ]]; then return "$exit_status"; fi
  if [[ ! "$active_database" =~ ^kinga_gatec_[a-z0-9_]+$ ]]; then echo "Refusing disposal of non-scratch target: $active_database" >&2; return 1; fi
  "${mysql_admin[@]}" -e "DROP DATABASE IF EXISTS \`$active_database\`;" || true
  local remaining
  remaining=$("${mysql_admin[@]}" -Nse "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '$active_database';" || true)
  mkdir -p "$active_evidence_dir"
  jq -n --arg database "$active_database" --arg host "$host" --arg port "$port" --argjson commandExit "$exit_status" --argjson absent "$( [[ -z "$remaining" ]] && echo true || echo false )" '{scope:"Gate C Wave 5 exact loopback scratch disposal proof",target:{database:$database,host:$host,port:$port},commandExit:$commandExit,absentAfterDrop:$absent}' > "$active_evidence_dir/disposal.json"
  if [[ -n "$remaining" ]]; then echo "Scratch target remained after disposal: $active_database" >&2; return 1; fi
  active_database=""; active_evidence_dir=""; return "$exit_status"
}
trap dispose_active EXIT
run_replay() {
  local label="$1" database
  database="kinga_gatec_wave5_${label}_${run_token}"
  [[ "$database" =~ ^kinga_gatec_[a-z0-9_]+$ ]] || { echo "Generated invalid scratch database name" >&2; exit 1; }
  if "${mysql_admin[@]}" -Nse "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '$database';" | grep -q .; then echo "Refusing to reuse existing scratch target: $database" >&2; exit 1; fi
  active_database="$database"; active_evidence_dir="$evidence_root/$label"
  rm -rf "$active_evidence_dir"; mkdir -p "$active_evidence_dir"
  "${mysql_admin[@]}" -e "CREATE DATABASE \`$database\`;"
  DATABASE_URL='' KINGA_STAGING_DATABASE_URL='' node "$repo_root/scripts/gate-c-wave-five-replay.mjs" --database-url "mysql://root@$host:$port/$database" --wave-one-sql "$wave_one" --wave-two-sql "$wave_two" --wave-three-sql "$wave_three" --wave-four-sql "$wave_four" --wave-five-sql "$wave_five" --evidence-dir "$active_evidence_dir" | tee "$active_evidence_dir/replay-output.log"
  dispose_active
}
run_replay run_a
run_replay run_b
jq -n --slurpfile runA "$evidence_root/run_a/replay.json" --slurpfile runB "$evidence_root/run_b/replay.json" '{scope:"Gate C Wave 5 two-run loopback-only composed replay comparison",runA:$runA[0],runB:$runB[0],matchingWaveOneSql:($runA[0].waveOneSqlSha256 == $runB[0].waveOneSqlSha256),matchingWaveTwoSql:($runA[0].waveTwoSqlSha256 == $runB[0].waveTwoSqlSha256),matchingWaveThreeSql:($runA[0].waveThreeSqlSha256 == $runB[0].waveThreeSqlSha256),matchingWaveFourSql:($runA[0].waveFourSqlSha256 == $runB[0].waveFourSqlSha256),matchingWaveFiveSql:($runA[0].waveFiveSqlSha256 == $runB[0].waveFiveSqlSha256),matchingStructuralMetadata:($runA[0].structuralMetadataSha256 == $runB[0].structuralMetadataSha256),bothPassed:($runA[0].status == "passed" and $runB[0].status == "passed")}' > "$evidence_root/two-run-comparison.json"
jq -e '.bothPassed and .matchingWaveOneSql and .matchingWaveTwoSql and .matchingWaveThreeSql and .matchingWaveFourSql and .matchingWaveFiveSql and .matchingStructuralMetadata' "$evidence_root/two-run-comparison.json" > /dev/null
cat "$evidence_root/two-run-comparison.json"
