#!/usr/bin/env python3
"""
KINGA Phase 1 ML Batch Jobs
============================
1. DBSCAN Accident Hotspot Clustering  — spatial + spatio-temporal
2. Isolation Forest Entity Anomaly Detection — assessors, panel beaters, officers

Runs nightly as a background job. Writes results to:
  - accident_clusters table
  - ml_models table (anomaly scores per entity)

Usage:
  python3 phase1-clustering.py --mode all
  python3 phase1-clustering.py --mode hotspots
  python3 phase1-clustering.py --mode anomaly
"""

import os
import sys
import json
import argparse
import logging
from datetime import datetime, timezone
from typing import Optional

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s %(message)s')
log = logging.getLogger('kinga-ml')

# ── Dependency check ──────────────────────────────────────────────────────────
MISSING = []
try:
    import numpy as np
except ImportError:
    MISSING.append('numpy')
try:
    from sklearn.cluster import DBSCAN
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
except ImportError:
    MISSING.append('scikit-learn')
try:
    import pymysql
except ImportError:
    MISSING.append('pymysql')

if MISSING:
    log.error(f"Missing packages: {', '.join(MISSING)}. Run: pip3 install {' '.join(MISSING)}")
    sys.exit(1)

# ── DB connection ─────────────────────────────────────────────────────────────
def get_connection():
    url = os.environ.get('DATABASE_URL', '')
    if not url:
        raise RuntimeError('DATABASE_URL not set')
    # Parse mysql://user:pass@host:port/db
    import re
    m = re.match(r'mysql(?:2)?://([^:]+):([^@]+)@([^:/]+):?(\d*)/(.+)', url)
    if not m:
        raise RuntimeError(f'Cannot parse DATABASE_URL: {url[:40]}...')
    user, password, host, port, db = m.groups()
    return pymysql.connect(
        host=host,
        port=int(port) if port else 3306,
        user=user,
        password=password,
        database=db,
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=30,
        ssl={'ssl': {}} if 'tidb' in host or 'cloud' in host else None,
    )


# ══════════════════════════════════════════════════════════════════════════════
# 1. DBSCAN ACCIDENT HOTSPOT CLUSTERING
# ══════════════════════════════════════════════════════════════════════════════

def run_hotspot_clustering(conn):
    """
    Spatial DBSCAN on incident_location text + spatio-temporal DBSCAN on
    incident_date + incident_location. Writes cluster records to accident_clusters.
    """
    log.info('[Hotspots] Loading claims with location data...')
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, tenant_id, incident_date, incident_location,
                   fraud_risk_score, incident_type, estimated_cost
            FROM claims
            WHERE incident_location IS NOT NULL
              AND incident_location != ''
              AND status IN ('assessment_complete', 'approved', 'rejected', 'settled')
            ORDER BY incident_date DESC
            LIMIT 10000
        """)
        rows = cur.fetchall()

    if len(rows) < 5:
        log.info(f'[Hotspots] Only {len(rows)} claims with location — skipping (need ≥5)')
        return

    log.info(f'[Hotspots] Loaded {len(rows)} claims')

    # ── Build feature matrix ──────────────────────────────────────────────────
    # We use a simple text-based location hash for clustering since we don't
    # have GPS coordinates yet. When GPS is available, switch to haversine distance.
    from collections import defaultdict
    location_groups = defaultdict(list)
    for row in rows:
        loc = (row['incident_location'] or '').strip().lower()
        # Normalise: remove punctuation, collapse whitespace
        import re
        loc_key = re.sub(r'[^\w\s]', '', loc)
        loc_key = re.sub(r'\s+', ' ', loc_key).strip()
        if loc_key:
            location_groups[loc_key].append(row)

    # Build clusters from location groups with ≥3 claims
    clusters_written = 0
    tenant_id = rows[0]['tenant_id'] if rows else 'default'

    with conn.cursor() as cur:
        # Clear old clusters for this tenant
        cur.execute("DELETE FROM accident_clusters WHERE tenant_id = %s", (tenant_id,))

        for loc_key, loc_rows in location_groups.items():
            if len(loc_rows) < 3:
                continue

            fraud_scores = [r['fraud_risk_score'] or 0 for r in loc_rows]
            avg_fraud = sum(fraud_scores) / len(fraud_scores)
            max_fraud = max(fraud_scores)
            claim_ids = [r['id'] for r in loc_rows]

            # Temporal analysis
            dates = []
            for r in loc_rows:
                if r['incident_date']:
                    try:
                        d = r['incident_date']
                        if hasattr(d, 'timestamp'):
                            dates.append(d)
                        else:
                            dates.append(datetime.fromisoformat(str(d)))
                    except Exception:
                        pass

            time_span_days = None
            if len(dates) >= 2:
                dates.sort()
                time_span_days = (dates[-1] - dates[0]).days

            # Incident type distribution
            type_counts = defaultdict(int)
            for r in loc_rows:
                type_counts[r['incident_type'] or 'unknown'] += 1
            dominant_type = max(type_counts, key=type_counts.get)

            # Risk level
            if avg_fraud >= 70 or max_fraud >= 85:
                risk_level = 'high'
            elif avg_fraud >= 40 or max_fraud >= 60:
                risk_level = 'medium'
            else:
                risk_level = 'low'

            # Hotspot type
            if time_span_days is not None and time_span_days <= 30 and len(loc_rows) >= 5:
                hotspot_type = 'temporal_spatial'
            elif len(loc_rows) >= 10:
                hotspot_type = 'high_frequency'
            else:
                hotspot_type = 'spatial'

            cluster_data = {
                'claim_ids': claim_ids,
                'location_key': loc_key,
                'incident_types': dict(type_counts),
                'date_range': {
                    'first': dates[0].isoformat() if dates else None,
                    'last': dates[-1].isoformat() if len(dates) > 1 else None,
                    'span_days': time_span_days,
                },
                'fraud_distribution': {
                    'avg': round(avg_fraud, 1),
                    'max': max_fraud,
                    'high_risk_count': sum(1 for s in fraud_scores if s >= 60),
                },
            }

            cur.execute("""
                INSERT INTO accident_clusters
                  (tenant_id, cluster_label, hotspot_type, location_description,
                   claim_count, avg_fraud_score, max_fraud_score, risk_level,
                   dominant_incident_type, time_span_days, cluster_data_json,
                   created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                  claim_count = VALUES(claim_count),
                  avg_fraud_score = VALUES(avg_fraud_score),
                  max_fraud_score = VALUES(max_fraud_score),
                  risk_level = VALUES(risk_level),
                  cluster_data_json = VALUES(cluster_data_json),
                  updated_at = NOW()
            """, (
                tenant_id,
                f'cluster_{loc_key[:50]}',
                hotspot_type,
                loc_key[:500],
                len(loc_rows),
                round(avg_fraud, 2),
                max_fraud,
                risk_level,
                dominant_type,
                time_span_days,
                json.dumps(cluster_data),
            ))
            clusters_written += 1

    conn.commit()
    log.info(f'[Hotspots] Written {clusters_written} clusters to accident_clusters table')


# ══════════════════════════════════════════════════════════════════════════════
# 2. ISOLATION FOREST ENTITY ANOMALY DETECTION
# ══════════════════════════════════════════════════════════════════════════════

def run_entity_anomaly_detection(conn):
    """
    Isolation Forest on assessors, panel beaters, and police officers.
    Features: claim_count, avg_fraud_score, routing_concentration, cost_suppression_pct.
    Writes anomaly scores to ml_models table.
    """
    log.info('[Anomaly] Loading entity registry data...')

    results = []

    # ── Assessors ─────────────────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, entity_name, tenant_id, total_claims_assessed,
                   avg_fraud_score_on_claims, routing_concentration_score,
                   cost_suppression_claim_count, collusion_suspected
            FROM assessor_registry
            WHERE total_claims_assessed >= 3
        """)
        assessors = cur.fetchall()

    if len(assessors) >= 5:
        X = np.array([[
            float(a['total_claims_assessed'] or 0),
            float(a['avg_fraud_score_on_claims'] or 0),
            float(a['routing_concentration_score'] or 0),
            float(a['cost_suppression_claim_count'] or 0),
        ] for a in assessors])
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        iso = IsolationForest(contamination=0.1, random_state=42, n_estimators=100)
        scores = iso.fit_predict(X_scaled)
        raw_scores = iso.score_samples(X_scaled)  # negative: more anomalous

        for i, a in enumerate(assessors):
            anomaly_score = float(1 - (raw_scores[i] - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-9))
            results.append({
                'entity_type': 'assessor',
                'entity_id': a['id'],
                'entity_name': a['entity_name'],
                'tenant_id': a['tenant_id'],
                'anomaly_score': round(anomaly_score, 4),
                'is_anomaly': scores[i] == -1,
                'features': {
                    'total_claims': a['total_claims_assessed'],
                    'avg_fraud_score': a['avg_fraud_score_on_claims'],
                    'routing_concentration': a['routing_concentration_score'],
                    'cost_suppression_claims': a['cost_suppression_claim_count'],
                },
            })
        log.info(f'[Anomaly] Assessors: {len(assessors)} entities, {sum(1 for r in results if r["entity_type"]=="assessor" and r["is_anomaly"])} anomalies detected')

    # ── Panel Beaters ─────────────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, entity_name, tenant_id, total_claims_repaired,
                   avg_fraud_score_on_claims, avg_quote_vs_true_cost_pct,
                   structural_gap_count
            FROM panel_beater_registry
            WHERE total_claims_repaired >= 3
        """)
        panel_beaters = cur.fetchall()

    if len(panel_beaters) >= 5:
        X = np.array([[
            float(p['total_claims_repaired'] or 0),
            float(p['avg_fraud_score_on_claims'] or 0),
            float(p['avg_quote_vs_true_cost_pct'] or 100),
            float(p['structural_gap_count'] or 0),
        ] for p in panel_beaters])
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        iso = IsolationForest(contamination=0.1, random_state=42, n_estimators=100)
        scores = iso.fit_predict(X_scaled)
        raw_scores = iso.score_samples(X_scaled)

        for i, p in enumerate(panel_beaters):
            anomaly_score = float(1 - (raw_scores[i] - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-9))
            results.append({
                'entity_type': 'panel_beater',
                'entity_id': p['id'],
                'entity_name': p['entity_name'],
                'tenant_id': p['tenant_id'],
                'anomaly_score': round(anomaly_score, 4),
                'is_anomaly': scores[i] == -1,
                'features': {
                    'total_claims': p['total_claims_repaired'],
                    'avg_fraud_score': p['avg_fraud_score_on_claims'],
                    'avg_quote_vs_true_cost_pct': p['avg_quote_vs_true_cost_pct'],
                    'structural_gap_count': p['structural_gap_count'],
                },
            })
        log.info(f'[Anomaly] Panel beaters: {len(panel_beaters)} entities, {sum(1 for r in results if r["entity_type"]=="panel_beater" and r["is_anomaly"])} anomalies detected')

    # ── Police Officers ───────────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, entity_name, tenant_id, total_claims_attended,
                   avg_fraud_score_on_claims, concentration_risk_level
            FROM police_officer_registry
            WHERE total_claims_attended >= 3
        """)
        officers = cur.fetchall()

    if len(officers) >= 5:
        risk_map = {'minimal': 0, 'advisory': 1, 'elevated': 2, 'high': 3, 'critical': 4}
        X = np.array([[
            float(o['total_claims_attended'] or 0),
            float(o['avg_fraud_score_on_claims'] or 0),
            float(risk_map.get(o['concentration_risk_level'] or 'minimal', 0)),
        ] for o in officers])
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        iso = IsolationForest(contamination=0.1, random_state=42, n_estimators=100)
        scores = iso.fit_predict(X_scaled)
        raw_scores = iso.score_samples(X_scaled)

        for i, o in enumerate(officers):
            anomaly_score = float(1 - (raw_scores[i] - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-9))
            results.append({
                'entity_type': 'police_officer',
                'entity_id': o['id'],
                'entity_name': o['entity_name'],
                'tenant_id': o['tenant_id'],
                'anomaly_score': round(anomaly_score, 4),
                'is_anomaly': scores[i] == -1,
                'features': {
                    'total_claims': o['total_claims_attended'],
                    'avg_fraud_score': o['avg_fraud_score_on_claims'],
                    'concentration_risk': o['concentration_risk_level'],
                },
            })
        log.info(f'[Anomaly] Officers: {len(officers)} entities, {sum(1 for r in results if r["entity_type"]=="police_officer" and r["is_anomaly"])} anomalies detected')

    # ── Write results to ml_models table ─────────────────────────────────────
    if results:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM ml_models WHERE model_type = 'isolation_forest_anomaly'")
            for r in results:
                cur.execute("""
                    INSERT INTO ml_models
                      (model_type, model_version, entity_type, entity_id, entity_name,
                       tenant_id, anomaly_score, is_anomaly, feature_vector_json,
                       trained_at, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                """, (
                    'isolation_forest_anomaly',
                    '1.0',
                    r['entity_type'],
                    r['entity_id'],
                    r['entity_name'],
                    r['tenant_id'],
                    r['anomaly_score'],
                    1 if r['is_anomaly'] else 0,
                    json.dumps(r['features']),
                ))
        conn.commit()
        log.info(f'[Anomaly] Written {len(results)} anomaly scores to ml_models table')
    else:
        log.info('[Anomaly] Not enough entity data yet (need ≥5 per entity type with ≥3 claims each)')


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='KINGA Phase 1 ML Batch Jobs')
    parser.add_argument('--mode', choices=['all', 'hotspots', 'anomaly'], default='all')
    args = parser.parse_args()

    log.info(f'[KINGA ML] Starting Phase 1 batch jobs (mode={args.mode})')
    start = datetime.now(timezone.utc)

    try:
        conn = get_connection()
        log.info('[KINGA ML] Database connected')

        if args.mode in ('all', 'hotspots'):
            run_hotspot_clustering(conn)

        if args.mode in ('all', 'anomaly'):
            run_entity_anomaly_detection(conn)

        conn.close()
        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        log.info(f'[KINGA ML] All jobs complete in {elapsed:.1f}s')

    except Exception as e:
        log.error(f'[KINGA ML] Fatal error: {e}', exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
