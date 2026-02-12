#!/usr/bin/env python3
"""
Enhanced ML-Based Fraud Detection for KINGA
Includes driver demographics, ownership verification, and staged accident detection.
"""

import json
import sys
import math
from datetime import datetime


def calculate_driver_risk(data):
    """Calculate fraud risk based on driver demographics."""
    risk_score = 0.0
    risk_factors = []

    # Age-based risk
    driver_age = data.get("driver_age", 35)
    if driver_age and driver_age < 25:
        risk_score += 0.15
        risk_factors.append("Young driver (under 25)")
    elif driver_age and driver_age > 70:
        risk_score += 0.05
        risk_factors.append("Elderly driver (over 70)")

    # License suspension
    if data.get("driver_license_suspended", False):
        risk_score += 0.25
        risk_factors.append("Driver license previously suspended")

    # Violations count
    violations = data.get("driver_violations_count", 0)
    if violations and violations > 3:
        risk_score += 0.2
        risk_factors.append(f"High violation count ({violations})")
    elif violations and violations > 1:
        risk_score += 0.1
        risk_factors.append(f"Multiple violations ({violations})")

    # Employment status
    employment = data.get("driver_employment_status", "unknown")
    if employment == "unemployed":
        risk_score += 0.1
        risk_factors.append("Driver is unemployed")

    # License verification
    if not data.get("driver_license_verified", True):
        risk_score += 0.15
        risk_factors.append("Driver license not verified")

    return {
        "risk_score": min(risk_score, 1.0),
        "risk_factors": risk_factors,
        "driver_age": driver_age,
        "employment_status": employment,
        "violations_count": violations,
    }


def analyze_ownership(data):
    """Analyze ownership verification and policy holder mismatch."""
    risk_score = 0.0
    risk_factors = []
    flags = []

    driver_name = (data.get("driver_name") or "").strip().lower()
    policy_holder = (data.get("policy_holder_name") or "").strip().lower()

    # Name mismatch check
    name_match = True
    if driver_name and policy_holder and driver_name != policy_holder:
        name_match = False
        relationship = data.get("driver_relationship_to_owner", "unknown")
        if relationship in ("unknown", "other", "friend", "colleague"):
            risk_score += 0.3
            flags.append("driver_not_owner_high_risk")
            risk_factors.append(f"Driver ({driver_name}) is not policy holder ({policy_holder}) - relationship: {relationship}")
        elif relationship in ("hired", "employee"):
            risk_score += 0.15
            flags.append("driver_hired_or_employee")
            risk_factors.append(f"Driver is {relationship} of policy holder")
        else:
            risk_score += 0.05
            risk_factors.append(f"Driver is {relationship} of policy holder")

    # Policy age check
    days_since_start = data.get("days_since_policy_start", 180)
    if days_since_start is not None and days_since_start < 30:
        risk_score += 0.25
        flags.append("new_policy_claim")
        risk_factors.append(f"Very new policy ({days_since_start} days)")
    elif days_since_start is not None and days_since_start < 90:
        risk_score += 0.1
        flags.append("recent_policy_claim")
        risk_factors.append(f"Recent policy ({days_since_start} days)")

    # Policy type check
    policy_type = data.get("policy_type", "individual")
    if policy_type in ("rental", "fleet"):
        risk_score += 0.1
        risk_factors.append(f"Policy type: {policy_type}")

    return {
        "risk_score": min(risk_score, 1.0),
        "name_match": name_match,
        "driver_name": driver_name or "unknown",
        "policy_holder_name": policy_holder or "unknown",
        "relationship": data.get("driver_relationship_to_owner", "unknown"),
        "policy_age_days": days_since_start,
        "flags": flags,
        "risk_factors": risk_factors,
    }


def detect_staged_accident(data):
    """Detect indicators of staged accidents."""
    confidence = 0.0
    indicators = []
    patterns = []

    # Low speed high damage
    speed = data.get("estimated_impact_speed_kmh", 50)
    damage_severity = data.get("damage_severity_score", 0.5)
    if speed and speed < 30 and damage_severity and damage_severity > 0.7:
        confidence += 0.3
        indicators.append("Low speed with high damage severity")
        patterns.append("low_speed_high_damage")

    # Multiple injury claims
    injury_claims = data.get("number_of_injury_claims", 0)
    if injury_claims and injury_claims > 2:
        confidence += 0.25
        indicators.append(f"Multiple injury claims ({injury_claims})")
        patterns.append("multiple_injuries")
    elif injury_claims and injury_claims > 0:
        confidence += 0.1
        indicators.append(f"Injury claim filed ({injury_claims})")

    # No witnesses and no dashcam
    if not data.get("has_witnesses", False) and not data.get("has_dashcam_footage", False):
        confidence += 0.1
        indicators.append("No witnesses and no dashcam footage")
        patterns.append("no_corroboration")

    # No police report
    if not data.get("has_police_report", False):
        confidence += 0.1
        indicators.append("No police report filed")
        patterns.append("no_police_report")

    # Previous claims history
    prev_claims = data.get("previous_claims_count", 0)
    if prev_claims and prev_claims > 3:
        confidence += 0.2
        indicators.append(f"High previous claims count ({prev_claims})")
        patterns.append("frequent_claimant")
    elif prev_claims and prev_claims > 1:
        confidence += 0.1
        indicators.append(f"Multiple previous claims ({prev_claims})")

    # Time-based (late night / early morning)
    claim_time = data.get("claim_time")
    if claim_time:
        try:
            if isinstance(claim_time, str):
                dt = datetime.fromisoformat(claim_time.replace("Z", "+00:00"))
            else:
                dt = claim_time
            hour = dt.hour
            if 0 <= hour <= 5:
                confidence += 0.1
                indicators.append(f"Incident occurred late at night/early morning ({hour}:00)")
                patterns.append("late_night_accident")
        except (ValueError, AttributeError):
            pass

    return {
        "confidence": min(confidence, 1.0),
        "is_likely_staged": confidence > 0.5,
        "indicators": indicators,
        "patterns_detected": patterns,
    }


def predict_enhanced_fraud(data):
    """Full enhanced fraud prediction combining all signals."""
    driver_profile = calculate_driver_risk(data)
    ownership = analyze_ownership(data)
    staged = detect_staged_accident(data)

    # Base fraud probability from technical scores
    physics_score = 1.0 - (data.get("physics_validation_score", 0.8) or 0.8)
    forensics_score = 1.0 - (data.get("image_forensics_score", 0.8) or 0.8)

    # Weighted combination
    ml_fraud_score = (
        driver_profile["risk_score"] * 0.15 +
        ownership["risk_score"] * 0.25 +
        staged["confidence"] * 0.25 +
        physics_score * 0.20 +
        forensics_score * 0.15
    )

    fraud_probability = min(ml_fraud_score, 1.0)

    # Determine risk level
    if fraud_probability > 0.7:
        risk_level = "critical"
    elif fraud_probability > 0.5:
        risk_level = "high"
    elif fraud_probability > 0.3:
        risk_level = "medium"
    else:
        risk_level = "low"

    # Collect all risk factors
    all_risk_factors = (
        driver_profile.get("risk_factors", []) +
        ownership.get("risk_factors", []) +
        staged.get("indicators", [])
    )

    # Recommendations
    recommendations = []
    if fraud_probability > 0.5:
        recommendations.append("Escalate to fraud investigation team")
    if ownership["risk_score"] > 0.3:
        recommendations.append("Verify driver-owner relationship and policy details")
    if staged["confidence"] > 0.3:
        recommendations.append("Review accident circumstances for staging indicators")
    if driver_profile["risk_score"] > 0.3:
        recommendations.append("Conduct thorough driver background check")
    if not recommendations:
        recommendations.append("Standard processing - no elevated risk detected")

    return {
        "fraud_probability": round(fraud_probability, 4),
        "ml_fraud_score": round(ml_fraud_score, 4),
        "risk_level": risk_level,
        "ownership_risk_score": round(ownership["risk_score"], 4),
        "ownership_analysis": ownership,
        "driver_profile": driver_profile,
        "staged_accident_indicators": staged,
        "top_risk_factors": all_risk_factors[:5],
        "recommendations": recommendations,
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: fraud_ml_model_enhanced.py <command> <json_data>"}))
        sys.exit(1)

    command = sys.argv[1]
    try:
        data = json.loads(sys.argv[2])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {str(e)}"}))
        sys.exit(1)

    if command == "predict":
        result = predict_enhanced_fraud(data)
    elif command == "ownership":
        result = analyze_ownership(data)
    elif command == "staged":
        result = detect_staged_accident(data)
    elif command == "driver":
        result = calculate_driver_risk(data)
    else:
        result = {"error": f"Unknown command: {command}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
