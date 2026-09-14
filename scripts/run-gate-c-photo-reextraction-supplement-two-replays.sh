#!/usr/bin/env bash
# Create and dispose exactly two unique local Gate C scratch targets. Never accepts an external target.
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
stamp=$(date -u +%Y%m%d%H%M%S)
suffix=$RANDOM$RANDOM
evidence_root="$root_dir/audit/gate-c-scratch-baseline/photo-reextraction-supplement-evidence"
wave_one="$root_dir/audit/gate-c-scratch-baseline/wave-01-generated/wave-01-identity-tenant-roots.sql"
wave_two="$root_dir/audit/gate-c-scratch-baseline/wave-02-generated/wave-02-vehicle-claim-core.sql"
wave_three="$root_dir/audit/gate-c-scratch-baseline/wave-03-generated/wave-03-assessment-evidence-reporting.sql"
wave_four="$root_dir/audit/gate-c-scratch-baseline/wave-04-generated/wave-04-operational-portals-channels.sql"
wave_five="$root_dir/audit/gate-c-scratch-baseline/wave-05-generated/wave-05-intelligence-learning-analytics.sql"
supplement="$root_dir/audit/gate-c-scratch-baseline/photo-reextraction-supplement-generated/photo-reextraction-jobs.sql"
admin=(mysql --protocol=TCP -h127.0.0.1 -P3317 -uroot)

run_one() {
  local label=$1
  local database="kinga_gatec_photo_reextract_${label}_${stamp}_${suffix}"
  local evidence_dir="$evidence_root/run_${label}"
  local created=0
  if "${admin[@]}" -Nse "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '${database}'" | grep -q .; then
    echo "Refusing to reuse existing scratch target ${database}" >&2
    return 1
  fi
  cleanup() {
    if [[ "$created" = 1 ]]; then
      "${admin[@]}" -e "DROP DATABASE IF EXISTS \`${database}\`"
      if "${admin[@]}" -Nse "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '${database}'" | grep -q .; then
        echo "Scratch target disposal failed for ${database}" >&2
        return 1
      fi
      mkdir -p "$evidence_dir"
      printf '{\n  "target": "%s",\n  "status": "disposed"\n}\n' "$database" > "$evidence_dir/disposal.json"
      created=0
    fi
  }
  trap cleanup RETURN
  "${admin[@]}" -e "CREATE DATABASE \`${database}\`"
  created=1
  node "$root_dir/scripts/gate-c-photo-reextraction-supplement-replay.mjs" \
    --database-url "mysql://root@127.0.0.1:3317/${database}" \
    --wave-one-sql "$wave_one" --wave-two-sql "$wave_two" --wave-three-sql "$wave_three" \
    --wave-four-sql "$wave_four" --wave-five-sql "$wave_five" --supplement-sql "$supplement" \
    --evidence-dir "$evidence_dir"
  cleanup
  trap - RETURN
}

run_one a
run_one b
echo "Completed and disposed two Gate C photo-reextraction supplemental loopback replays."
