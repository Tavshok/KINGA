import { describe, expect, it } from "vitest";

import {
  buildP0B1GeographicOperationalClusters,
  projectP0B1ProcessorQueueRows,
} from "./claims-core";

describe("P0-B1 operational claims projections", () => {
  it("removes historic fraud fields and keeps processor ordering chronological", () => {
    const result = projectP0B1ProcessorQueueRows(
      [
        {
          id: 2,
          claimNumber: "QUEUE-NEW",
          createdAt: "2026-09-02 10:00:00",
          fraudRiskLevel: "low",
          fraudRiskScore: 1,
        },
        {
          id: 1,
          claimNumber: "QUEUE-OLD",
          createdAt: "2026-09-01 10:00:00",
          fraudRiskLevel: "critical",
          fraudRiskScore: 99,
        },
      ],
      Date.parse("2026-09-03T10:00:00Z")
    );

    expect(result.map(row => row.claimNumber)).toEqual([
      "QUEUE-OLD",
      "QUEUE-NEW",
    ]);
    expect(result.every(row => !("fraudRiskLevel" in row))).toBe(true);
    expect(result.every(row => !("fraudRiskScore" in row))).toBe(true);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fraudDecision: expect.objectContaining({
            status: "FRAUD_DECISION_WITHHELD",
            reviewRequired: true,
          }),
        }),
      ])
    );
  });

  it("produces the same geographic workload view for contradictory historic fraud values", () => {
    const base = [
      {
        incidentLocation: "Harare, Zimbabwe",
        incidentType: "collision",
        approvedAmount: "2500",
      },
      {
        incidentLocation: "Harare, Zimbabwe",
        incidentType: "collision",
        approvedAmount: "1500",
      },
    ];

    const high = buildP0B1GeographicOperationalClusters(
      base.map(row => ({
        ...row,
        fraudRiskLevel: "critical",
        fraudRiskScore: 100,
      }))
    );
    const low = buildP0B1GeographicOperationalClusters(
      base.map(row => ({ ...row, fraudRiskLevel: "low", fraudRiskScore: 0 }))
    );

    expect(high).toEqual(low);
    expect(high).toEqual({
      clusters: [
        {
          location: "Harare",
          totalClaims: 2,
          totalExposure: 4000,
          dominantIncidentType: "collision",
        },
      ],
      totalLocations: 1,
    });
  });
});
