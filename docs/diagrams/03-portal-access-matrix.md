# KINGA Portal Access Matrix

**Author:** Tavonga Shoko, Lead Engineer

This diagram shows which roles can access which portals and key features.

## Role → Portal Mapping

```mermaid
graph LR
    subgraph Roles
        R1[claimant]
        R2[claims_processor]
        R3[assessor_internal]
        R4[claims_manager]
        R5[risk_manager]
        R6[executive]
        R7[insurer_admin]
        R8[assessor]
        R9[panel_beater]
        R10[fleet_manager]
        R11[fleet_admin]
        R12[agency_broker]
        R13[agency_admin]
        R14[engineer]
        R15[platform_super_admin]
    end

    subgraph Portals
        P1[My Portal /client]
        P2[Insurer Portal /insurer]
        P3[Assessor Portal /assessor]
        P4[Panel Beater Portal /panel-beater]
        P5[Fleet Portal /fleet]
        P6[Agency Portal /agency]
        P7[Engineer Portal /engineer]
        P8[Platform Admin /admin]
    end

    R1 --> P1
    R2 --> P2
    R3 --> P2
    R4 --> P2
    R5 --> P2
    R6 --> P2
    R7 --> P2
    R8 --> P3
    R9 --> P4
    R10 --> P5
    R11 --> P5
    R12 --> P6
    R13 --> P6
    R14 --> P7
    R15 --> P8
    R15 --> P2
    R15 --> P3
    R15 --> P4
    R15 --> P5
    R15 --> P6
    R15 --> P7
```

## Feature Access by Role

| Feature | claimant | claims_processor | assessor_internal | claims_manager | risk_manager | executive | insurer_admin | assessor | panel_beater | fleet_manager | engineer | platform_super_admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Submit claim | ✅ | ✅ | — | — | — | — | — | — | — | — | — | ✅ |
| View own claims | ✅ | ✅ | — | — | — | — | — | — | — | — | — | ✅ |
| View all claims (tenant) | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — | ✅ |
| Trigger AI assessment | — | ✅ | — | — | — | — | — | — | — | — | — | ✅ |
| View CL report | ✅ | ✅ | ✅ | ✅ | — | — | — | ✅ | — | — | — | ✅ |
| View CI report | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — | ✅ |
| View FR report | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — | ✅ |
| Approve settlement | — | — | — | ✅ | — | — | — | — | — | — | — | ✅ |
| Submit repair quote | — | — | — | — | — | — | — | — | ✅ | — | — | ✅ |
| Assign assessor | — | ✅ | — | ✅ | — | — | — | — | — | — | — | ✅ |
| View executive dashboard | — | — | — | — | ✅ | ✅ | — | — | — | — | — | ✅ |
| Manage fleet | — | — | — | — | — | — | — | — | — | ✅ | — | ✅ |
| Conduct inspections | — | — | — | — | — | — | — | — | — | — | ✅ | ✅ |
| Manage tenants | — | — | — | — | — | — | — | — | — | — | — | ✅ |
| View all portals | — | — | — | — | — | — | — | — | — | — | — | ✅ |

## Report Access Tiers

```mermaid
graph TD
    subgraph CL["CL — Claims Assessment (Process Tier)"]
        CL1[Claimant]
        CL2[Assessor]
        CL3[Claims Processor]
        CL4[Claims Manager]
    end
    subgraph CI["CI — Claims Intelligence (Protect Tier)"]
        CI1[Claims Processor]
        CI2[Internal Assessor]
        CI3[Claims Manager]
        CI4[Risk Manager]
        CI5[Executive]
        CI6[Insurer Admin]
    end
    subgraph FR["FR — Forensic Decision (Prove Tier)"]
        FR1[Internal Assessor]
        FR2[Claims Manager]
        FR3[Risk Manager]
        FR4[Executive]
        FR5[Insurer Admin]
    end
```

## My Portal — All Roles Can Access

Every authenticated user, regardless of their primary role, can access My Portal (`/client`). This allows a fleet manager to also be a claimant, an agent to also submit personal claims, and so on. The My Portal tabs shown depend on the user's data:

- **Home** — always shown
- **My Vehicles** — shown if user has personal vehicles
- **Valuations** — shown if user has valuation requests
- **Insurance** — shown if user has insurance requests or policies
- **Claims** — shown if user has submitted claims
- **Company** — shown if user is linked to a fleet account (fleet manager view of company vehicle claims)
