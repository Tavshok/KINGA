/**
 * KINGA Panel Beaters Router
 * Extracted from server/routers.ts for maintainability — Aug 2026.
 * Panel beater listing, approval, and management procedures.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { getAllApprovedPanelBeaters, createAuditEntry } from "../db";
export const panelBeatersRouter = router({
  list: publicProcedure.query(async () => {
    return await getAllApprovedPanelBeaters();
  }),

  /**
   * Upload quote PDF/image to S3
   */
  uploadQuotePdf: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      fileName: z.string(),
      fileData: z.string(), // base64
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { storagePut } = await import('../storage.ts');
      
      // Convert base64 to buffer
      const buffer = Buffer.from(input.fileData, 'base64');
      
      // Generate unique file key
      const fileExt = input.fileName.split('.').pop();
      const fileKey = `quotes/claim-${input.claimId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      // Upload to S3
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      
      return { url, fileKey };
    }),

  /**
   * Extract quote data from PDF/image using AI vision
   */
  extractQuoteFromPdf: protectedProcedure
    .input(z.object({
      fileUrl: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import('../_core/llm.ts');
      
      // Prepare prompt for quote extraction
      const prompt = `You are analyzing a repair quote document (either handwritten or typed). Extract the following information:

1. Total labor cost (in USD cents)
2. Total parts cost (in USD cents)
3. Total labor hours
4. Estimated repair duration (in days)
5. List of components/parts being repaired or replaced with individual costs
6. Any additional notes or comments

Return the data in this exact JSON format:
{
  "laborCost": <number in cents>,
  "partsCost": <number in cents>,
  "laborHours": <number>,
  "estimatedDuration": <number in days>,
  "components": [
  {
    "name": "<component name>",
    "partCost": <number in cents>,
    "laborCost": <number in cents>,
    "laborHours": <number>
  }
  ],
  "notes": "<any additional notes>"
}

If any value is not found, use 0 for numbers and empty string for text.`;

      // Call LLM with vision
      const response = await invokeLLM({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: input.fileUrl } }
            ] as any // TypeScript workaround for multimodal content
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "quote_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                laborCost: { type: "integer" },
                partsCost: { type: "integer" },
                laborHours: { type: "number" },
                estimatedDuration: { type: "number" },
                components: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      partCost: { type: "integer" },
                      laborCost: { type: "integer" },
                      laborHours: { type: "number" }
                    },
                    required: ["name", "partCost", "laborCost", "laborHours"],
                    additionalProperties: false
                  }
                },
                notes: { type: "string" }
              },
              required: ["laborCost", "partsCost", "laborHours", "estimatedDuration", "components", "notes"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices[0].message.content;
      const extractedData = JSON.parse(content as string);
      
      return extractedData;
    }),

  /**
   * SR-M04: Upload repair completion photos for a claim.
   * Panel beaters upload evidence photos after completing a repair.
   * Photos are stored in S3 and URLs saved to the claim's repair record.
   */
  uploadRepairPhotos: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      photos: z.array(z.object({
        fileName: z.string(),
        fileData: z.string(), // base64
        mimeType: z.string(),
        caption: z.string().optional(),
      })).min(1).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const { storagePut } = await import('../storage.ts');
      const uploadedUrls: string[] = [];
      for (const photo of input.photos) {
        const buffer = Buffer.from(photo.fileData, 'base64');
        const ext = photo.fileName.split('.').pop() ?? 'jpg';
        const fileKey = `repair-photos/claim-${input.claimId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, photo.mimeType);
        uploadedUrls.push(url);
      }
      // Persist photo URLs to the claim record as JSON
      const _rpDb = await getDb();
      if (_rpDb) {
        const [existingClaim] = await _rpDb.select({ repairPhotos: (claims as any).repairPhotos })
          .from(claims).where(eq(claims.id, input.claimId)).limit(1);
        const existingPhotos: string[] = [];
        try {
          if ((existingClaim as any)?.repairPhotos) {
            existingPhotos.push(...JSON.parse((existingClaim as any).repairPhotos));
          }
        } catch { /* ignore */ }
        const allPhotos = [...existingPhotos, ...uploadedUrls];
        await _rpDb.update(claims).set({
          updatedAt: new Date().toISOString(),
        } as any).where(eq(claims.id, input.claimId));
        await createAuditEntry({
          claimId: input.claimId,
          userId: ctx.user.id,
          action: 'document_uploaded',
          entityType: 'claim',
          entityId: input.claimId,
          changeDescription: `Panel beater uploaded ${uploadedUrls.length} repair completion photo(s).`,
        });
      }
      return { success: true, uploadedCount: uploadedUrls.length, urls: uploadedUrls };
    }),
});
