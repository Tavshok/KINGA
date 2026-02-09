#!/usr/bin/env python3
"""
Physics Validation CLI
Validates collision physics for insurance claims
"""

import sys
import json
from physics_validator import PhysicsValidator

def main():
    # Read input from stdin
    input_data = sys.stdin.read()
    
    try:
        claim_data = json.loads(input_data)
        
        validator = PhysicsValidator()
        result = validator.validate_collision_scenario(
            vehicle_type=claim_data.get("vehicle_type", "sedan"),
            accident_type=claim_data.get("accident_type", "other"),
            estimated_speed=claim_data.get("estimated_speed", 50),
            damage_severity=claim_data.get("damage_severity", "moderate"),
            damage_locations=claim_data.get("damage_locations", []),
            reported_description=claim_data.get("reported_description", "")
        )
        
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"error": str(e), "success": False}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
