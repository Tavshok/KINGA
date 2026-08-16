import { z } from "zod";
import { router } from "../_core/trpc";
import { customerDomainProcedure } from "../_core/domain-middleware";
import { generateVehicleValuation } from "../insurance/valuation-engine";

const vehicleInput = z.object({
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.number().int().min(1950).max(new Date().getFullYear() + 1),
  registrationNumber: z.string().max(20).optional(),
  condition: z.enum(["excellent", "good", "fair", "poor"]).optional().default("good"),
  mileage: z.number().int().min(0).optional(),
});

export const clientValuationRouter = router({
  getMarketValuation: customerDomainProcedure
    .input(vehicleInput.extend({ valuationDate: z.string().datetime({ offset: true }).optional() }))
    .query(async ({ input }) => {
      const valuationDate = input.valuationDate ? new Date(input.valuationDate) : new Date();
      const result = await generateVehicleValuation({ ...input, valuationDate });
      return { ...result, valuationDate: valuationDate.toISOString() };
    }),

  bulkMarketValuation: customerDomainProcedure
    .input(z.object({ vehicles: z.array(vehicleInput.extend({ rowIndex: z.number().int() })).min(1).max(50) }))
    .mutation(async ({ input }) => {
      const valuationDate = new Date();
      const results = await Promise.allSettled(input.vehicles.map(async (vehicle) => {
        const result = await generateVehicleValuation({ ...vehicle, valuationDate });
        return { ...vehicle, ...result, valuationDate: valuationDate.toISOString() };
      }));
      return results.map((result, index) => result.status === "fulfilled"
        ? { ...result.value, error: null }
        : {
            rowIndex: input.vehicles[index]?.rowIndex ?? index,
            make: input.vehicles[index]?.make ?? "",
            model: input.vehicles[index]?.model ?? "",
            year: input.vehicles[index]?.year ?? 0,
            error: result.reason?.message ?? "Valuation failed",
          });
    }),
});
