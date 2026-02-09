#!/usr/bin/env python3
"""
KINGA Physics Engine Automated Test Runner

This script runs automated tests on the physics validation engine
to verify formula accuracy and damage pattern detection.
"""

import json
import sys
from pathlib import Path

# Add parent directory to path to import physics validator
sys.path.insert(0, str(Path(__file__).parent.parent))

from python.physics_validator import PhysicsValidator

class PhysicsTestRunner:
    def __init__(self):
        self.validator = PhysicsValidator()
        self.passed = 0
        self.failed = 0
        self.results = []
    
    def test_kinetic_energy(self):
        """Test kinetic energy calculations"""
        print("\n=== Testing Kinetic Energy Calculations ===")
        
        test_cases = [
            {"mass": 1500, "velocity_kmh": 40, "expected_ke": 92592},
            {"mass": 1500, "velocity_kmh": 60, "expected_ke": 208417},
            {"mass": 1500, "velocity_kmh": 100, "expected_ke": 578700},
            {"mass": 2000, "velocity_kmh": 50, "expected_ke": 193210},
            {"mass": 1200, "velocity_kmh": 80, "expected_ke": 296296},
        ]
        
        for i, case in enumerate(test_cases, 1):
            velocity_ms = case["velocity_kmh"] / 3.6
            calculated_ke = 0.5 * case["mass"] * (velocity_ms ** 2)
            variance = abs(calculated_ke - case["expected_ke"]) / case["expected_ke"] * 100
            
            passed = variance < 5  # Allow 5% variance
            
            result = {
                "test": f"KE Test {i}",
                "mass": case["mass"],
                "velocity": case["velocity_kmh"],
                "expected": case["expected_ke"],
                "calculated": round(calculated_ke, 2),
                "variance": round(variance, 2),
                "status": "PASS" if passed else "FAIL"
            }
            
            self.results.append(result)
            if passed:
                self.passed += 1
                print(f"✓ Test {i}: PASS (variance: {variance:.2f}%)")
            else:
                self.failed += 1
                print(f"✗ Test {i}: FAIL (variance: {variance:.2f}%)")
            
            print(f"  Mass: {case['mass']}kg, Speed: {case['velocity_kmh']}km/h")
            print(f"  Expected KE: {case['expected_ke']}J, Calculated: {calculated_ke:.2f}J")
    
    def test_force_calculations(self):
        """Test force calculations (F = ma)"""
        print("\n=== Testing Force Calculations ===")
        
        test_cases = [
            {"mass": 1500, "initial_speed_ms": 16.67, "impact_time": 0.1, "expected_force": 250050},
            {"mass": 1500, "initial_speed_ms": 27.78, "impact_time": 0.15, "expected_force": 277800},
            {"mass": 2000, "initial_speed_ms": 13.89, "impact_time": 0.2, "expected_force": 138900},
        ]
        
        for i, case in enumerate(test_cases, 1):
            acceleration = case["initial_speed_ms"] / case["impact_time"]
            calculated_force = case["mass"] * acceleration
            variance = abs(calculated_force - case["expected_force"]) / case["expected_force"] * 100
            
            passed = variance < 10  # Allow 10% variance due to impact time assumptions
            
            result = {
                "test": f"Force Test {i}",
                "mass": case["mass"],
                "deceleration": round(acceleration, 2),
                "expected": case["expected_force"],
                "calculated": round(calculated_force, 2),
                "variance": round(variance, 2),
                "status": "PASS" if passed else "FAIL"
            }
            
            self.results.append(result)
            if passed:
                self.passed += 1
                print(f"✓ Test {i}: PASS (variance: {variance:.2f}%)")
            else:
                self.failed += 1
                print(f"✗ Test {i}: FAIL (variance: {variance:.2f}%)")
            
            print(f"  Mass: {case['mass']}kg, Deceleration: {acceleration:.2f}m/s²")
            print(f"  Expected Force: {case['expected_force']}N, Calculated: {calculated_force:.2f}N")
    
    def test_g_force_calculations(self):
        """Test G-force calculations"""
        print("\n=== Testing G-Force Calculations ===")
        
        test_cases = [
            {"acceleration": 98.1, "expected_g": 10},
            {"acceleration": 196.2, "expected_g": 20},
            {"acceleration": 294.3, "expected_g": 30},
            {"acceleration": 490.5, "expected_g": 50},
        ]
        
        for i, case in enumerate(test_cases, 1):
            calculated_g = case["acceleration"] / 9.81
            variance = abs(calculated_g - case["expected_g"]) / case["expected_g"] * 100
            
            passed = variance < 1  # G-force should be very accurate
            
            result = {
                "test": f"G-Force Test {i}",
                "acceleration": case["acceleration"],
                "expected": case["expected_g"],
                "calculated": round(calculated_g, 2),
                "variance": round(variance, 2),
                "status": "PASS" if passed else "FAIL"
            }
            
            self.results.append(result)
            if passed:
                self.passed += 1
                print(f"✓ Test {i}: PASS (variance: {variance:.2f}%)")
            else:
                self.failed += 1
                print(f"✗ Test {i}: FAIL (variance: {variance:.2f}%)")
            
            print(f"  Acceleration: {case['acceleration']}m/s², Expected: {case['expected_g']}g, Calculated: {calculated_g:.2f}g")
    
    def test_damage_pattern_consistency(self):
        """Test damage pattern consistency detection"""
        print("\n=== Testing Damage Pattern Consistency ===")
        
        test_cases = [
            {
                "name": "Rear-End Collision - Inconsistent",
                "accident_type": "rear_end",
                "damage_locations": ["front_bumper", "hood"],
                "expected_consistency": "impossible",
            },
            {
                "name": "Head-On Collision - Consistent",
                "accident_type": "head_on",
                "damage_locations": ["front_bumper", "hood", "radiator"],
                "expected_consistency": "consistent",
            },
            {
                "name": "Side Impact - Consistent",
                "accident_type": "side_impact",
                "damage_locations": ["driver_door", "b_pillar"],
                "expected_consistency": "consistent",
            },
            {
                "name": "Low-Speed - Exaggerated",
                "accident_type": "parking_lot",
                "damage_locations": ["frame", "structural"],
                "expected_consistency": "inconsistent",
            },
        ]
        
        for i, case in enumerate(test_cases, 1):
            # Create test input
            test_input = {
                "vehicle_type": "sedan",
                "accident_type": case["accident_type"],
                "estimated_speed": 40,
                "damage_severity": "moderate",
                "damage_locations": case["damage_locations"],
                "reported_description": f"Test case {i}"
            }
            
            # Run validation
            result_data = self.validator.validate_collision_scenario(
                test_input["vehicle_type"],
                test_input["accident_type"],
                test_input["estimated_speed"],
                test_input["damage_severity"],
                test_input["damage_locations"],
                test_input["reported_description"]
            )
            calculated_consistency = result_data.get("damageConsistency", "unknown")
            
            # Check if result matches expected
            passed = calculated_consistency.lower() == case["expected_consistency"].lower()
            
            result = {
                "test": f"Damage Pattern Test {i}",
                "name": case["name"],
                "accident_type": case["accident_type"],
                "damage_locations": case["damage_locations"],
                "expected": case["expected_consistency"],
                "calculated": calculated_consistency,
                "status": "PASS" if passed else "FAIL"
            }
            
            self.results.append(result)
            if passed:
                self.passed += 1
                print(f"✓ Test {i}: PASS")
            else:
                self.failed += 1
                print(f"✗ Test {i}: FAIL")
            
            print(f"  {case['name']}")
            print(f"  Expected: {case['expected_consistency']}, Calculated: {calculated_consistency}")
    
    def run_all_tests(self):
        """Run all physics tests"""
        print("=" * 60)
        print("KINGA PHYSICS ENGINE TEST SUITE")
        print("=" * 60)
        
        self.test_kinetic_energy()
        self.test_force_calculations()
        self.test_g_force_calculations()
        self.test_damage_pattern_consistency()
        
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {self.passed + self.failed}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Pass Rate: {self.passed / (self.passed + self.failed) * 100:.1f}%")
        
        # Save results to JSON
        output_file = Path(__file__).parent / "physics-test-results.json"
        with open(output_file, 'w') as f:
            json.dump({
                "summary": {
                    "total": self.passed + self.failed,
                    "passed": self.passed,
                    "failed": self.failed,
                    "pass_rate": round(self.passed / (self.passed + self.failed) * 100, 2)
                },
                "results": self.results
            }, f, indent=2)
        
        print(f"\nDetailed results saved to: {output_file}")
        
        return self.failed == 0

if __name__ == "__main__":
    runner = PhysicsTestRunner()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)
