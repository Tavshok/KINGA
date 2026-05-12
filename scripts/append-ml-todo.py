#!/usr/bin/env python3
"""Append ML cost prediction training pipeline items to todo.md"""

items = """
## ML Cost Prediction — Training Data Pipeline (Awaiting Data)
- [ ] Confirm CSV column format with user (vehicle_make, vehicle_model, vehicle_year, claim_type, incident_description, incident_location, claimant_type, claimant_department, incident_date, fraud_risk_score, actual_repair_cost)
- [ ] Build CSV bulk importer in admin panel (upload up to 50MB, stream-validate, batch-insert 500 rows, progress bar, downloadable error log)
- [ ] Deduplicate incoming rows against existing claims on import
- [ ] Train XGBoost / LightGBM regression model on 20k claims dataset (target: actual_repair_cost)
- [ ] Train Random Forest baseline model for uncertainty / prediction interval estimation
- [ ] Apply log-transform on target variable to handle right-skewed cost distribution
- [ ] Generate SHAP feature importance report per claim prediction
- [ ] Expose trained model via tRPC procedure: claims.predictCost (input: claim features -> output: predicted cost + confidence range + top 3 SHAP drivers)
- [ ] Wire cost prediction into claim intake flow (auto-populate estimated_repair_cost on new claim submission)
- [ ] Add cost prediction display to assessor and claims manager claim detail views
- [ ] Schedule monthly model retraining job as new claims accumulate in the DB
"""

target = "/home/ubuntu/kinga-replit/todo.md"

with open(target, "r") as f:
    content = f.read()

if "ML Cost Prediction" in content:
    print("ML section already present — skipping")
else:
    with open(target, "a") as f:
        f.write(items)
    print("Appended ML todo items successfully")
