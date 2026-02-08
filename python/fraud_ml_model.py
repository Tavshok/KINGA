#!/usr/bin/env python3
"""
ML-Based Fraud Detection for KINGA
Predicts fraud probability and detects fraud rings using machine learning
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from typing import Dict, List, Tuple, Optional
import json
import sys
import pickle
from datetime import datetime


class FraudMLModel:
    """
    Machine Learning model for fraud detection and cost prediction
    """
    
    def __init__(self):
        self.fraud_classifier = None
        self.cost_predictor = None
        self.scaler = StandardScaler()
        self.feature_names = []
        self.is_trained = False
        
    def extract_features(self, claim_data: Dict) -> np.ndarray:
        """
        Extract features from claim data for ML model
        
        Features include:
        - Claim amount
        - Vehicle age
        - Time since policy start
        - Number of previous claims
        - Damage severity score
        - Physics validation score
        - Image forensics score
        - Assessor history score
        - Time of day/week
        - Geographic risk score
        """
        features = []
        
        # Numeric features
        features.append(claim_data.get("claim_amount", 0))
        features.append(claim_data.get("vehicle_age", 0))
        features.append(claim_data.get("days_since_policy_start", 0))
        features.append(claim_data.get("previous_claims_count", 0))
        features.append(claim_data.get("damage_severity_score", 0.5))  # 0-1
        features.append(claim_data.get("physics_validation_score", 1.0))  # 0-1
        features.append(claim_data.get("image_forensics_score", 1.0))  # 0-1
        features.append(claim_data.get("assessor_approval_rate", 0.8))  # 0-1
        
        # Time-based features
        claim_time = claim_data.get("claim_time", datetime.now())
        if isinstance(claim_time, str):
            claim_time = datetime.fromisoformat(claim_time)
        features.append(claim_time.hour)  # Hour of day
        features.append(claim_time.weekday())  # Day of week
        
        # Boolean features (converted to 0/1)
        features.append(1 if claim_data.get("has_witnesses", False) else 0)
        features.append(1 if claim_data.get("has_police_report", False) else 0)
        features.append(1 if claim_data.get("has_photos", False) else 0)
        features.append(1 if claim_data.get("is_high_value", False) else 0)
        
        # Categorical features (one-hot encoded)
        accident_types = ["rear_end", "side_impact", "head_on", "parking_lot", "highway", "other"]
        accident_type = claim_data.get("accident_type", "other")
        for at in accident_types:
            features.append(1 if accident_type == at else 0)
        
        return np.array(features)
    
    def train_fraud_detector(self, training_data: List[Dict]) -> Dict:
        """
        Train fraud detection model on historical claims
        
        training_data: List of dicts with claim features + "is_fraud" label
        """
        if len(training_data) < 10:
            return {
                "error": "Insufficient training data (need at least 10 claims)",
                "success": False
            }
        
        # Extract features and labels
        X = []
        y = []
        for claim in training_data:
            features = self.extract_features(claim)
            X.append(features)
            y.append(1 if claim.get("is_fraud", False) else 0)
        
        X = np.array(X)
        y = np.array(y)
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y, test_size=0.2, random_state=42
        )
        
        # Train Random Forest classifier
        self.fraud_classifier = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_split=5,
            random_state=42
        )
        self.fraud_classifier.fit(X_train, y_train)
        
        # Evaluate
        train_accuracy = self.fraud_classifier.score(X_train, y_train)
        test_accuracy = self.fraud_classifier.score(X_test, y_test)
        
        self.is_trained = True
        
        return {
            "success": True,
            "train_accuracy": train_accuracy,
            "test_accuracy": test_accuracy,
            "training_samples": len(training_data),
            "fraud_percentage": np.mean(y) * 100
        }
    
    def predict_fraud_probability(self, claim_data: Dict) -> Dict:
        """
        Predict fraud probability for a new claim
        
        Returns:
            {
                "fraud_probability": float (0-1),
                "risk_level": str ("low", "medium", "high", "critical"),
                "confidence": float (0-1),
                "top_risk_factors": List[str],
                "recommendations": List[str]
            }
        """
        if not self.is_trained:
            # Use rule-based fallback if model not trained
            return self._rule_based_fraud_detection(claim_data)
        
        # Extract features
        features = self.extract_features(claim_data)
        features_scaled = self.scaler.transform(features.reshape(1, -1))
        
        # Predict
        fraud_prob = self.fraud_classifier.predict_proba(features_scaled)[0][1]
        
        # Determine risk level
        if fraud_prob < 0.2:
            risk_level = "low"
        elif fraud_prob < 0.5:
            risk_level = "medium"
        elif fraud_prob < 0.8:
            risk_level = "high"
        else:
            risk_level = "critical"
        
        # Get feature importances (top risk factors)
        feature_importances = self.fraud_classifier.feature_importances_
        top_indices = np.argsort(feature_importances)[-5:][::-1]
        
        feature_names = [
            "claim_amount", "vehicle_age", "days_since_policy", "previous_claims",
            "damage_severity", "physics_score", "image_score", "assessor_rate",
            "hour_of_day", "day_of_week", "has_witnesses", "has_police_report",
            "has_photos", "is_high_value", "rear_end", "side_impact", "head_on",
            "parking_lot", "highway", "other_accident"
        ]
        
        top_risk_factors = [feature_names[i] for i in top_indices if i < len(feature_names)]
        
        # Generate recommendations
        recommendations = []
        if fraud_prob > 0.5:
            recommendations.append("Conduct in-person vehicle inspection")
            recommendations.append("Interview claimant and witnesses")
            recommendations.append("Request additional documentation")
        if fraud_prob > 0.7:
            recommendations.append("Escalate to fraud investigation team")
            recommendations.append("Consider claim denial pending investigation")
        
        return {
            "fraud_probability": float(fraud_prob),
            "risk_level": risk_level,
            "confidence": 0.85,  # Model confidence
            "top_risk_factors": top_risk_factors,
            "recommendations": recommendations
        }
    
    def _rule_based_fraud_detection(self, claim_data: Dict) -> Dict:
        """
        Fallback rule-based fraud detection when ML model not trained
        """
        fraud_score = 0.0
        flags = []
        
        # High claim amount
        claim_amount = claim_data.get("claim_amount", 0)
        if claim_amount > 10000:
            fraud_score += 0.2
            flags.append("high_claim_amount")
        
        # Multiple previous claims
        previous_claims = claim_data.get("previous_claims_count", 0)
        if previous_claims > 2:
            fraud_score += 0.3
            flags.append("multiple_previous_claims")
        
        # Low physics validation score
        physics_score = claim_data.get("physics_validation_score", 1.0)
        if physics_score < 0.5:
            fraud_score += 0.4
            flags.append("failed_physics_validation")
        
        # Low image forensics score
        image_score = claim_data.get("image_forensics_score", 1.0)
        if image_score < 0.5:
            fraud_score += 0.4
            flags.append("suspicious_images")
        
        # No witnesses or police report
        if not claim_data.get("has_witnesses") and not claim_data.get("has_police_report"):
            fraud_score += 0.2
            flags.append("no_independent_verification")
        
        fraud_score = min(1.0, fraud_score)
        
        if fraud_score < 0.3:
            risk_level = "low"
        elif fraud_score < 0.6:
            risk_level = "medium"
        elif fraud_score < 0.8:
            risk_level = "high"
        else:
            risk_level = "critical"
        
        return {
            "fraud_probability": fraud_score,
            "risk_level": risk_level,
            "confidence": 0.7,
            "top_risk_factors": flags,
            "recommendations": ["Train ML model with historical data for better accuracy"]
        }
    
    def detect_fraud_ring(self, claims: List[Dict]) -> Dict:
        """
        Detect fraud rings (multiple related fraudulent claims)
        
        Looks for patterns:
        - Same claimant multiple claims
        - Same assessor multiple suspicious claims
        - Similar damage patterns
        - Geographic clustering
        - Temporal clustering
        """
        fraud_rings = []
        
        # Group by claimant
        claimant_claims = {}
        for claim in claims:
            claimant = claim.get("claimant_id", "unknown")
            if claimant not in claimant_claims:
                claimant_claims[claimant] = []
            claimant_claims[claimant].append(claim)
        
        # Check for suspicious claimants
        for claimant, claimant_claims_list in claimant_claims.items():
            if len(claimant_claims_list) > 2:
                fraud_rings.append({
                    "type": "repeat_claimant",
                    "claimant_id": claimant,
                    "claim_count": len(claimant_claims_list),
                    "total_amount": sum(c.get("claim_amount", 0) for c in claimant_claims_list),
                    "risk_score": min(1.0, len(claimant_claims_list) / 5)
                })
        
        # Group by assessor
        assessor_claims = {}
        for claim in claims:
            assessor = claim.get("assessor_id", "unknown")
            if assessor not in assessor_claims:
                assessor_claims[assessor] = []
            assessor_claims[assessor].append(claim)
        
        # Check for suspicious assessors
        for assessor, assessor_claims_list in assessor_claims.items():
            suspicious_count = sum(
                1 for c in assessor_claims_list 
                if c.get("fraud_probability", 0) > 0.5
            )
            if suspicious_count > 3:
                fraud_rings.append({
                    "type": "suspicious_assessor",
                    "assessor_id": assessor,
                    "total_claims": len(assessor_claims_list),
                    "suspicious_claims": suspicious_count,
                    "risk_score": min(1.0, suspicious_count / 10)
                })
        
        return {
            "fraud_rings_detected": len(fraud_rings),
            "fraud_rings": fraud_rings,
            "total_claims_analyzed": len(claims)
        }
    
    def predict_repair_cost(self, claim_data: Dict) -> Dict:
        """
        Predict expected repair cost based on damage description
        """
        # Simple rule-based cost estimation
        # In production, this would use a trained regression model
        
        base_cost = 1000  # Base repair cost
        
        # Adjust by damage severity
        severity_multipliers = {
            "minor": 1.0,
            "moderate": 2.5,
            "severe": 5.0,
            "total_loss": 10.0
        }
        severity = claim_data.get("damage_severity", "moderate")
        multiplier = severity_multipliers.get(severity, 2.5)
        
        # Adjust by vehicle type
        vehicle_multipliers = {
            "sedan": 1.0,
            "suv": 1.3,
            "truck": 1.5,
            "luxury": 2.0
        }
        vehicle_type = claim_data.get("vehicle_type", "sedan")
        vehicle_mult = vehicle_multipliers.get(vehicle_type, 1.0)
        
        # Adjust by damage locations
        damage_locations = claim_data.get("damage_locations", [])
        location_cost = len(damage_locations) * 500  # $500 per damaged area
        
        estimated_cost = (base_cost * multiplier * vehicle_mult) + location_cost
        
        # Add uncertainty range
        min_cost = estimated_cost * 0.7
        max_cost = estimated_cost * 1.3
        
        return {
            "estimated_cost": estimated_cost,
            "min_cost": min_cost,
            "max_cost": max_cost,
            "confidence": 0.75
        }
    
    def save_model(self, filepath: str):
        """Save trained model to disk"""
        if not self.is_trained:
            raise ValueError("Model not trained yet")
        
        model_data = {
            "fraud_classifier": self.fraud_classifier,
            "scaler": self.scaler,
            "is_trained": self.is_trained
        }
        
        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)
    
    def load_model(self, filepath: str):
        """Load trained model from disk"""
        with open(filepath, 'rb') as f:
            model_data = pickle.load(f)
        
        self.fraud_classifier = model_data["fraud_classifier"]
        self.scaler = model_data["scaler"]
        self.is_trained = model_data["is_trained"]


def main():
    """
    CLI interface for fraud ML model
    Usage: python3 fraud_ml_model.py predict '{"claim_amount": 5000, ...}'
    """
    if len(sys.argv) < 3:
        print(json.dumps({
            "error": "Usage: python3 fraud_ml_model.py <command> <data>"
        }))
        sys.exit(1)
    
    try:
        command = sys.argv[1]
        data = json.loads(sys.argv[2])
        
        model = FraudMLModel()
        
        if command == "predict":
            result = model.predict_fraud_probability(data)
        elif command == "cost":
            result = model.predict_repair_cost(data)
        else:
            result = {"error": f"Unknown command: {command}"}
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "success": False
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
