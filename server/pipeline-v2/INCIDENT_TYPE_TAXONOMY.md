# KINGA Incident Type Taxonomy v2

## Design Principles

1. **LLM-reasoning-first**: The authoritative incident type is determined by an LLM that reads the full incident narrative, damage description, and any available photo context. Keyword matching is a deterministic fallback used only when the LLM is unavailable or the input is too short to reason over.

2. **Sub-type granularity**: Every incident has a primary type and an optional sub-type. The primary type drives fraud scenario routing; the sub-type drives physics/damage zone profiling.

3. **Direction is separate from type**: For collision-family incidents, direction (frontal, rear, side, rollover) is captured as a separate field — not embedded in the type name — because the same fraud profile applies across directions but the damage zones differ.

4. **Claim form is a hint, not the truth**: Claim form fields like "accident" or "MVA" are treated as low-confidence hints. The narrative and damage description always override the claim form.

---

## Primary Incident Types (ClassifiedIncidentType)

| Type | Description | Canonical Pipeline Type |
|---|---|---|
| `animal_strike` | Vehicle struck an animal (livestock, wildlife) | `animal_strike` |
| `rollover` | Vehicle rolled onto its side or roof, with or without prior collision | `rollover` |
| `rear_end` | Vehicle struck from behind, or struck another vehicle from behind | `rear_end` |
| `head_on` | Frontal collision between two vehicles travelling in opposite directions | `head_on` |
| `sideswipe` | Lateral contact between two vehicles travelling in the same or opposite direction | `sideswipe` |
| `single_vehicle` | Vehicle left the road, struck a fixed object, or lost control with no other vehicle involved | `single_vehicle` |
| `pedestrian_strike` | Vehicle struck a pedestrian or cyclist | `pedestrian_strike` |
| `vehicle_collision` | Multi-vehicle collision that cannot be sub-typed from available evidence | `vehicle_collision` |
| `theft` | Vehicle stolen, hijacked, or parts removed without consent | `theft` |
| `fire` | Vehicle fire (engine, electrical, arson) | `fire` |
| `flood` | Flood, hail, or weather damage | `flood` |
| `vandalism` | Malicious damage, keying, window smashing | `vandalism` |
| `unknown` | Insufficient evidence to classify | `unknown` |

---

## Sub-types

### Rollover sub-types
- `tripped` — vehicle tripped over a kerb, pothole, or soft verge
- `untripped` — vehicle rolled due to excessive speed or evasive manoeuvre
- `post_collision` — vehicle rolled as a secondary event after a collision

### Single-vehicle sub-types
- `run_off_road` — vehicle left the carriageway
- `fixed_object` — vehicle struck a wall, pole, tree, barrier, or ditch
- `pothole` — vehicle struck a pothole or road defect

### Theft sub-types
- `full_vehicle` — entire vehicle stolen
- `hijacking` — vehicle taken by force
- `parts_theft` — catalytic converter, wheels, battery, or other parts removed

### Fire sub-types
- `engine_fire` — fire originating in engine bay
- `electrical_fire` — fire originating in wiring or battery
- `arson` — fire deliberately set

---

## LLM Classification Prompt Design

The LLM is given:
- Full incident narrative (from claim form and driver statement)
- Damage description (from assessor notes and claim form)
- Vehicle make/model (for physics plausibility)
- Any photo context summary (from Stage 6 vision analysis)

The LLM returns a structured JSON object:
```json
{
  "primary_type": "rollover",
  "sub_type": "tripped",
  "collision_direction": null,
  "confidence": 88,
  "reasoning": "Narrative states vehicle 'left the road and rolled twice' — this is a tripped rollover. Damage description confirms roof crush and A-pillar deformation consistent with rollover kinematics. No other vehicle mentioned.",
  "claim_form_type_matches": false,
  "claim_form_stated": "accident",
  "signals": ["rolled twice", "roof crush", "A-pillar", "left the road"]
}
```

---

## Fraud Profile Routing

| Incident Type | Fraud Scenario Profile |
|---|---|
| `animal_strike` | `animal_strike_fraud` — staged strike, wrong animal, wrong time/location |
| `rollover` | `rollover_fraud` — staged rollover on remote road, inflated total-loss, pre-existing roof damage |
| `rear_end` | `rear_end_fraud` — cash-for-crash, staged brake, phantom passengers |
| `head_on` | `head_on_fraud` — wrong-side staging, speed inflation, phantom vehicle |
| `sideswipe` | `sideswipe_fraud` — lane-change staging, paint transfer inconsistency |
| `single_vehicle` | `single_vehicle_fraud` — pre-existing damage claimed as new, false run-off-road |
| `pedestrian_strike` | `pedestrian_fraud` — staged pedestrian, inflated injury claims |
| `vehicle_collision` | `vehicle_collision_fraud` — generic multi-vehicle fraud |
| `theft` | `theft_fraud` — owner involvement, false hijacking, parts-only theft |
| `fire` | `fire_fraud` — arson, financial distress total-loss |
| `flood` | `flood_fraud` — pre-existing water damage, non-flood-event area |
| `vandalism` | `vandalism_fraud` — self-inflicted damage |

---

## Damage Zone Profiles by Incident Type

| Incident Type | Expected Primary Zones | Expected Secondary Zones |
|---|---|---|
| `animal_strike` | Front bumper, bonnet, grille, headlights | Windscreen, A-pillars (large animals) |
| `rollover` | Roof, A-pillar, B-pillar, door tops | All glass, side panels, mirror |
| `rear_end` (struck from behind) | Rear bumper, boot lid, rear lights | Rear quarter panels |
| `rear_end` (struck another) | Front bumper, bonnet, grille | Radiator, headlights |
| `head_on` | Front bumper, bonnet, grille, radiator | Windscreen, A-pillars, airbags |
| `sideswipe` | Door panels (driver or passenger side), mirror | Rear quarter, front quarter |
| `single_vehicle` (fixed object) | Front or corner zone depending on object | Underbody, suspension |
| `single_vehicle` (run-off-road) | Underbody, suspension, tyres | Side panels, roof (if rolled) |
| `pedestrian_strike` | Front bumper, bonnet, windscreen lower | A-pillar (pedestrian head impact) |
| `theft` | No structural damage expected | Ignition, door lock, window |
| `fire` | Engine bay, interior | Wiring, fuel system |
| `flood` | Interior, underbody, engine bay | Electrical systems |
| `vandalism` | Scattered — keying, glass, mirrors | No structural deformation expected |

---

## Keyword Fallback Map (used only when LLM unavailable)

### Rollover keywords
rolled, rollover, roll over, rolled over, overturned, overturn, turned over, flipped, on its side, on its roof, roof crush, A-pillar, B-pillar deformation

### Rear-end keywords
rear-ended, rear ended, struck from behind, hit from behind, hit the back of, ran into the back, tailgated, shunted, rear impact, boot damage, rear bumper

### Head-on keywords
head-on, head on, oncoming, wrong side, opposite direction, frontal collision, met head on, collided head on

### Sideswipe keywords
sideswiped, side-swiped, sideswipe, scraped the side, brushed, clipped the side, lane change, merging, overtaking contact, door panel, side panel scrape

### Single-vehicle keywords
left the road, run off road, ran off road, left the carriageway, struck a wall, struck a pole, struck a tree, struck a barrier, hit a ditch, hit a pothole, lost control, skidded off, no other vehicle, single vehicle

### Pedestrian keywords
struck a pedestrian, hit a pedestrian, pedestrian, cyclist, knocked down, knocked over a person, person crossing
