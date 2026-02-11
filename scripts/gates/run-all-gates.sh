#!/bin/bash
# scripts/gates/run-all-gates.sh
# Master script to run all 7 stability gates sequentially

set -e

echo "========================================="
echo "Running All Stability Gates (G1-G7)"
echo "========================================="
echo "Timestamp: $(date -Iseconds)"
echo ""

# Create logs directory if it doesn't exist
mkdir -p logs

# Run G1: Regression Testing Gate
echo "[1/7] Running G1: Regression Testing Gate..."
./scripts/gates/g1-regression.sh
G1_EXIT=$?
if [ $G1_EXIT -ne 0 ]; then
  echo "FAIL: G1 Regression Testing Gate failed"
  exit 1
fi
echo "PASS: G1 Regression Testing Gate"
echo ""

# Run G2: Performance Baseline Gate
echo "[2/7] Running G2: Performance Baseline Gate..."
./scripts/gates/g2-performance.sh
G2_EXIT=$?
if [ $G2_EXIT -ne 0 ]; then
  echo "FAIL: G2 Performance Baseline Gate failed"
  exit 1
fi
echo "PASS: G2 Performance Baseline Gate"
echo ""

# Run G3: AI Model Validation Gate
echo "[3/7] Running G3: AI Model Validation Gate..."
./scripts/gates/g3-ai-model.sh
G3_EXIT=$?
if [ $G3_EXIT -ne 0 ]; then
  echo "FAIL: G3 AI Model Validation Gate failed"
  exit 1
fi
echo "PASS: G3 AI Model Validation Gate"
echo ""

# Run G4: Database Integrity Gate
echo "[4/7] Running G4: Database Integrity Gate..."
./scripts/gates/g4-database.sh
G4_EXIT=$?
if [ $G4_EXIT -ne 0 ]; then
  echo "FAIL: G4 Database Integrity Gate failed"
  exit 1
fi
echo "PASS: G4 Database Integrity Gate"
echo ""

# Run G5: Rollback Preparation Gate
echo "[5/7] Running G5: Rollback Preparation Gate..."
./scripts/gates/g5-rollback.sh
G5_EXIT=$?
if [ $G5_EXIT -ne 0 ]; then
  echo "FAIL: G5 Rollback Preparation Gate failed"
  exit 1
fi
echo "PASS: G5 Rollback Preparation Gate"
echo ""

# Run G6: Deployment Safety Gate
echo "[6/7] Running G6: Deployment Safety Gate..."
./scripts/gates/g6-deployment.sh
G6_EXIT=$?
if [ $G6_EXIT -ne 0 ]; then
  echo "FAIL: G6 Deployment Safety Gate failed"
  exit 1
fi
echo "PASS: G6 Deployment Safety Gate"
echo ""

# Run G7: Monitoring Activation Gate
echo "[7/7] Running G7: Monitoring Activation Gate..."
./scripts/gates/g7-monitoring.sh
G7_EXIT=$?
if [ $G7_EXIT -ne 0 ]; then
  echo "FAIL: G7 Monitoring Activation Gate failed"
  exit 1
fi
echo "PASS: G7 Monitoring Activation Gate"
echo ""

echo "========================================="
echo "ALL STABILITY GATES PASSED"
echo "========================================="
echo "Timestamp: $(date -Iseconds)"

exit 0
