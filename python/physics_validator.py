#!/usr/bin/env python3
"""
Physics-Based Validation Engine for KINGA
Validates accident scenarios using collision dynamics, impact forces, and deformation patterns
"""

import numpy as np
from scipy import optimize
from typing import Dict, List, Tuple, Optional
import json
import sys


class PhysicsValidator:
    """
    Validates vehicle damage claims using physics-based analysis
    """
    
    # Vehicle mass estimates (kg) by category
    VEHICLE_MASSES = {
        "sedan": 1500,
        "suv": 2000,
        "truck": 2500,
        "van": 1800,
        "hatchback": 1200,
        "coupe": 1400,
    }
    
    # Typical collision speeds (km/h) by accident type
    TYPICAL_SPEEDS = {
        "rear_end": (20, 60),
        "side_impact": (30, 80),
        "head_on": (40, 100),
        "parking_lot": (5, 20),
        "highway": (80, 120),
    }
    
    def __init__(self):
        self.g = 9.81  # Gravity (m/s²)
        
    def validate_collision_scenario(
        self,
        vehicle_type: str,
        accident_type: str,
        estimated_speed: float,  # km/h
        damage_severity: str,  # "minor", "moderate", "severe", "total_loss"
        damage_locations: List[str],  # ["front", "rear", "left_side", "right_side", "roof"]
        reported_description: str,
    ) -> Dict:
        """
        Validate if reported damage matches physics of collision
        
        Returns:
            {
                "is_valid": bool,
                "confidence": float (0-1),
                "flags": List[str],
                "physics_analysis": Dict,
                "recommendations": List[str]
            }
        """
        
        flags = []
        physics_analysis = {}
        
        # 1. Calculate expected impact energy
        vehicle_mass = self.VEHICLE_MASSES.get(vehicle_type.lower(), 1500)
        speed_ms = estimated_speed / 3.6  # Convert km/h to m/s
        kinetic_energy = 0.5 * vehicle_mass * (speed_ms ** 2)  # Joules
        
        physics_analysis["kinetic_energy_joules"] = kinetic_energy
        physics_analysis["vehicle_mass_kg"] = vehicle_mass
        physics_analysis["impact_speed_ms"] = speed_ms
        
        # 2. Validate speed vs damage severity
        severity_energy_ranges = {
            "minor": (0, 50000),  # < 50 kJ
            "moderate": (50000, 150000),  # 50-150 kJ
            "severe": (150000, 400000),  # 150-400 kJ
            "total_loss": (400000, float('inf')),  # > 400 kJ
        }
        
        expected_range = severity_energy_ranges.get(damage_severity, (0, float('inf')))
        if not (expected_range[0] <= kinetic_energy <= expected_range[1]):
            flags.append(
                f"MISMATCH: Reported {damage_severity} damage inconsistent with "
                f"impact energy ({kinetic_energy/1000:.1f} kJ). "
                f"Expected range: {expected_range[0]/1000:.1f}-{expected_range[1]/1000:.1f} kJ"
            )
        
        # 3. Validate damage location vs accident type
        # Map specific components to general locations
        def normalize_location(loc):
            loc_lower = loc.lower()
            if any(x in loc_lower for x in ['front', 'bumper', 'hood', 'radiator', 'grille', 'headlight']):
                return 'front'
            elif any(x in loc_lower for x in ['rear', 'trunk', 'taillight', 'back']):
                return 'rear'
            elif any(x in loc_lower for x in ['left', 'driver']):
                return 'left_side'
            elif any(x in loc_lower for x in ['right', 'passenger']):
                return 'right_side'
            elif any(x in loc_lower for x in ['roof', 'top']):
                return 'roof'
            else:
                return loc_lower
        
        normalized_damage_locs = [normalize_location(loc) for loc in damage_locations]
        
        expected_damage_locations = {
            "rear_end": ["rear"],
            "side_impact": ["left_side", "right_side"],
            "head_on": ["front"],
            "parking_lot": ["rear", "front", "left_side", "right_side"],  # Any
            "highway": ["front", "rear"],
        }
        
        expected_locs = expected_damage_locations.get(accident_type, [])
        if expected_locs and not any(loc in normalized_damage_locs for loc in expected_locs):
            flags.append(
                f"IMPOSSIBLE DAMAGE PATTERN: {accident_type} accident reported, "
                f"but damage at {damage_locations}. Expected damage at {expected_locs}"
            )
        
        # 4. Calculate deceleration and validate injury potential
        # Assuming 0.5m crumple zone
        crumple_distance = 0.5  # meters
        deceleration = (speed_ms ** 2) / (2 * crumple_distance)  # m/s²
        g_force = deceleration / self.g
        
        physics_analysis["deceleration_ms2"] = deceleration
        physics_analysis["g_force"] = g_force
        
        if g_force > 50:
            flags.append(
                f"FATAL COLLISION: Calculated g-force ({g_force:.1f}g) suggests "
                f"fatal or near-fatal impact. Verify occupant injuries reported."
            )
        elif g_force > 20:
            flags.append(
                f"SEVERE IMPACT: Calculated g-force ({g_force:.1f}g) suggests "
                f"serious injuries likely. Verify injury claims."
            )
        
        # 5. Validate speed vs accident type
        typical_speed_range = self.TYPICAL_SPEEDS.get(accident_type, (0, 200))
        if not (typical_speed_range[0] <= estimated_speed <= typical_speed_range[1]):
            flags.append(
                f"UNUSUAL SPEED: Reported speed ({estimated_speed} km/h) is "
                f"atypical for {accident_type} accidents. "
                f"Typical range: {typical_speed_range[0]}-{typical_speed_range[1]} km/h"
            )
        
        # 6. Check for impossible damage combinations
        if "roof" in damage_locations and accident_type not in ["rollover", "falling_object"]:
            flags.append(
                f"IMPOSSIBLE: Roof damage reported in {accident_type} accident. "
                f"Roof damage typically only occurs in rollovers or falling objects."
            )
        
        # 7. Calculate confidence score
        confidence = 1.0 - (len(flags) * 0.2)  # Reduce 20% per flag
        confidence = max(0.0, min(1.0, confidence))
        
        is_valid = len(flags) == 0
        
        # 8. Generate recommendations
        recommendations = []
        if not is_valid:
            recommendations.append("Request additional photos of damage")
            recommendations.append("Interview driver for detailed accident description")
            recommendations.append("Request police report for independent verification")
            if g_force > 20:
                recommendations.append("Verify medical records for occupant injuries")
        
        # 9. Determine damage consistency status
        damage_consistency = "consistent"
        if any("IMPOSSIBLE" in flag for flag in flags):
            damage_consistency = "impossible"
        elif any("MISMATCH" in flag or "UNUSUAL" in flag for flag in flags):
            damage_consistency = "inconsistent"
        elif not is_valid:
            damage_consistency = "questionable"
        
        return {
            "is_valid": is_valid,
            "confidence": confidence,
            "damageConsistency": damage_consistency,
            "flags": flags,
            "physics_analysis": physics_analysis,
            "recommendations": recommendations,
        }
    
    def calculate_impact_force(
        self,
        vehicle_mass: float,  # kg
        impact_speed: float,  # m/s
        contact_time: float = 0.1,  # seconds (typical collision duration)
    ) -> float:
        """
        Calculate average impact force during collision
        F = m * Δv / Δt
        """
        momentum_change = vehicle_mass * impact_speed
        average_force = momentum_change / contact_time
        return average_force  # Newtons
    
    def estimate_repair_cost_from_energy(
        self,
        kinetic_energy: float,  # Joules
        vehicle_value: float,  # USD
    ) -> Tuple[float, float]:
        """
        Estimate repair cost range based on impact energy
        Returns (min_cost, max_cost)
        """
        # Empirical relationship: repair cost ≈ 0.5-2% of vehicle value per 10kJ
        energy_factor = kinetic_energy / 10000  # Per 10kJ
        min_cost = vehicle_value * 0.005 * energy_factor
        max_cost = vehicle_value * 0.02 * energy_factor
        
        # Cap at vehicle value (total loss)
        min_cost = min(min_cost, vehicle_value * 0.7)
        max_cost = min(max_cost, vehicle_value)
        
        return (min_cost, max_cost)


def main():
    """
    CLI interface for physics validation
    Usage: python3 physics_validator.py '{"vehicle_type": "sedan", ...}'
    """
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python3 physics_validator.py '{\"vehicle_type\": \"sedan\", ...}'"
        }))
        sys.exit(1)
    
    try:
        input_data = json.loads(sys.argv[1])
        
        validator = PhysicsValidator()
        result = validator.validate_collision_scenario(
            vehicle_type=input_data.get("vehicle_type", "sedan"),
            accident_type=input_data.get("accident_type", "rear_end"),
            estimated_speed=input_data.get("estimated_speed", 50),
            damage_severity=input_data.get("damage_severity", "moderate"),
            damage_locations=input_data.get("damage_locations", ["rear"]),
            reported_description=input_data.get("reported_description", ""),
        )
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "success": False
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
