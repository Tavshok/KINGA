#!/usr/bin/env python3
"""
Fraud Detection CLI
Predicts fraud probability using ML model
"""

import sys
import json
from fraud_ml_model import FraudMLModel

def main():
    # Read input from stdin
    input_data = sys.stdin.read()
    
    try:
        claim_data = json.loads(input_data)
        
        model = FraudMLModel()
        result = model.predict_fraud_probability(claim_data)
        
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"error": str(e), "success": False}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
