/**
 * KINGA Quotes Router
 * Extracted from server/routers.ts for maintainability — Aug 2026.
 * Panel beater quote submission, review, and optimisation procedures.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { panelBeaterQuotes, claims } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  getClaimById,
  getQuotesByClaimId,
  createPanelBeaterQuote,
  updateClaimStatus,
  createAuditEntry,
  createNotification,
  getUsersByInsurerRoles,
  getQuoteLineItemsByQuoteId,
} from "../db";
export const quotesRouter = router({
  // Submit quote (panel beaters)
  submit: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      panelBeaterId: z.number(),
      quotedAmount: z.number(),
      laborCost: z.number().optional(),
      partsCost: z.number().optional(),
      laborHours: z.number().optional(),
      estimatedDuration: z.number(),
      itemizedBreakdown: z.array(z.object({
        item: z.string(),
        cost: z.number(),
      })),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");

      // ── ROUTE 4 idempotency guard ─────────────────────────────────────────
      // Prevent duplicate quotes from the same panel beater for the same claim.
      // If a quote already exists (e.g. from pipeline extraction or a prior
      // submission), update it rather than inserting a second row.
      const _existingDb = await getDb();
      if (_existingDb) {
        const { panelBeaterQuotes: _pbq } = await import('../../drizzle/schema');
        const { eq: _eq2, and: _and2 } = await import('drizzle-orm');
        const [_existing] = await _existingDb
          .select({ id: _pbq.id })
          .from(_pbq)
          .where(_and2(
            _eq2(_pbq.claimId, input.claimId),
            _eq2(_pbq.panelBeaterId, input.panelBeaterId),
          ))
          .limit(1);
        if (_existing) {
          const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
          await _existingDb.update(_pbq).set({
            quotedAmount: input.quotedAmount,
            laborCost: input.laborCost ?? null,
            partsCost: input.partsCost ?? null,
            laborHours: input.laborHours ?? null,
            estimatedDuration: input.estimatedDuration,
            itemizedBreakdown: JSON.stringify(input.itemizedBreakdown),
            notes: input.notes ?? null,
            status: 'submitted',
            updatedAt: now,
          }).where(_eq2(_pbq.id, _existing.id));
          console.log(`[quotes.submit] Updated existing quote id=${_existing.id} for claim ${input.claimId} panel beater ${input.panelBeaterId}`);
          // Skip the createPanelBeaterQuote insert below and continue to post-submit logic
          const allQuotes = await getQuotesByClaimId(input.claimId);
          const tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || 'default');
          const claim = await getClaimById(input.claimId, tenantId);
          return { success: true, quoteId: _existing.id, allQuotesCount: allQuotes.length, claimStatus: claim?.status };
        }
      }

      await createPanelBeaterQuote({
        claimId: input.claimId,
        panelBeaterId: input.panelBeaterId,
        quotedAmount: input.quotedAmount,
        laborCost: input.laborCost,
        partsCost: input.partsCost,
        laborHours: input.laborHours,
        estimatedDuration: input.estimatedDuration,
        itemizedBreakdown: JSON.stringify(input.itemizedBreakdown),
        notes: input.notes,
        status: "submitted",
      });
      

      // TECH-05A: Write line items to quote_line_items table so the cost optimisation
      // engine can read per-line prices from the structured table (not just the JSON blob).
      if (input.itemizedBreakdown && input.itemizedBreakdown.length > 0) {
        try {
          const _db05 = await getDb();
          if (_db05) {
            const { panelBeaterQuotes: _pbq2 } = await import('../../drizzle/schema');
            const { eq: _eq3, and: _and3, desc: _desc3 } = await import('drizzle-orm');
            const [_newQuote] = await _db05
              .select({ id: _pbq2.id })
              .from(_pbq2)
              .where(_and3(_eq3(_pbq2.claimId, input.claimId), _eq3(_pbq2.panelBeaterId, input.panelBeaterId)))
              .orderBy(_desc3(_pbq2.id))
              .limit(1);
            if (_newQuote) {
              const { quoteLineItems: _qli } = await import('../../drizzle/schema');
              const lineItemRows = input.itemizedBreakdown.map((li, idx) => ({
                quoteId: _newQuote.id,
                itemNumber: idx + 1,
                description: li.item,
                category: 'parts' as const,
                quantity: '1.00',
                unitPrice: String(li.cost),
                lineTotal: String(li.cost),
                currency: 'USD',
                isReplacement: 1,
              }));
              await _db05.insert(_qli).values(lineItemRows);
              console.log(`[quotes.submit] Wrote ${lineItemRows.length} line items to quote_line_items for quote ${_newQuote.id}`);
            }
          }
        } catch (_liErr) {
          console.error('[quotes.submit] Failed to write line items:', _liErr);
        }
      }
      // Check if all quotes have been received (3 panel beaters)
      const allQuotes = await getQuotesByClaimId(input.claimId);
      const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
      const claim = await getClaimById(input.claimId, tenantId);
      
      if (allQuotes.length >= 3) {
        // All quotes received, progress to comparison stage (legacy field only)
        await updateClaimStatus(input.claimId, "comparison", ctx.user.id, "panel_beater", claim?.tenantId || "default");

        // ── AI Cost Optimisation ─────────────────────────────────────────────
        // Trigger asynchronously so quote submission returns immediately.
        // The optimisation result is persisted to quote_optimisation_results.
        if (claim) {
          const quotesToAnalyse = allQuotes.slice(0, 3);
          setImmediate(async () => {
            try {
              const { runQuoteOptimisation } = await import("../quote-ai-optimisation");
              // Build QuoteInput from stored quotes + marketplace profile lookup
              const { getDb: _getDb } = await import("../db");
              const { marketplaceProfiles: _mp } = await import("../../drizzle/schema");
              const { eq: _eq } = await import("drizzle-orm");
              const _db = await _getDb();

              const quoteInputs = await Promise.all(
                quotesToAnalyse.map(async (q) => {
                  // Try to resolve marketplace profile for this panel beater
                  let profileId = `legacy-${q.panelBeaterId}`;
                  let companyName = `Panel Beater #${q.panelBeaterId}`;
                  if (_db) {
                    const [profile] = await _db
                      .select({ id: _mp.id, companyName: _mp.companyName })
                      .from(_mp)
                      .where(_eq(_mp.id, String(q.panelBeaterId)))
                      .limit(1);
                    if (profile) {
                      profileId = profile.id;
                      companyName = profile.companyName;
                    }
                  }
                  return {
                    profileId,
                    companyName,
                    totalAmount: q.quotedAmount,
                    partsAmount: q.partsCost ?? 0,
                    labourAmount: q.laborCost ?? 0,
                    labourHours: q.laborHours ?? 0,
                    itemizedBreakdown: q.itemizedBreakdown ?? null,
                    partsQuality: q.partsQuality ?? "aftermarket",
                  };
                })
              );

              const optimisationResult = await runQuoteOptimisation(
                input.claimId,
                {
                  vehicleMake: claim.vehicleMake ?? "Unknown",
                  vehicleModel: claim.vehicleModel ?? "Unknown",
                  vehicleYear: claim.vehicleYear ?? new Date().getFullYear(),
                },
                quoteInputs,
                ctx.user.id
              );
              console.log(`[QuoteOptimisation] Auto-triggered for claim ${input.claimId}`);
              // ── Notify insurer(s) that AI optimisation is complete ────────
              if (optimisationResult) {
                try {
                  const { sendAiOptimisationCompleteEmail } = await import("../safe-email");
                  const { getUsersByInsurerRoles: _getInsurerRoles } = await import("../db");
                  // Only email operational roles (claims_manager) — not executive or insurer_admin
                  const insurers = await _getInsurerRoles(["claims_manager"]);
                  // Filter to insurers in the same tenant as the claim
                  const tenantInsuers = insurers.filter(
                    (u) => !claim.tenantId || u.tenantId === claim.tenantId
                  );
                  for (const insurer of tenantInsuers) {
                    if (insurer.email) {
                      await sendAiOptimisationCompleteEmail({
                        claimId: input.claimId,
                        claimNumber: claim.claimNumber ?? String(input.claimId),
                        recipientUserId: insurer.id,
                        recipientEmail: insurer.email,
                        riskScore: Number(optimisationResult.riskScoreNumeric ?? 0),
                        recommendedRepairer: optimisationResult.recommendedCompanyName ?? "Unknown",
                        tenantId: claim.tenantId ?? undefined,
                      });
                    }
                  }
                } catch (emailErr) {
                  console.error(`[QuoteOptimisation] Email notification failed for claim ${input.claimId}:`, emailErr);
                }
              }
            } catch (err) {
              console.error(`[QuoteOptimisation] Auto-trigger failed for claim ${input.claimId}:`, err);
            }
          });
        }
        // ────────────────────────────────────────────────────────────────────

        // Notify insurer that all quotes are ready for comparison
        // Only notify operational roles (claims_manager, insurer_admin) — not executive
        if (claim) {
          const insurers = await getUsersByInsurerRoles(["claims_manager"]);
          const tenantInsurers = insurers.filter((u) => !claim.tenantId || u.tenantId === claim.tenantId);
          const { createNotification } = await import("../db");
          
          for (const insurer of tenantInsurers) {
            await createNotification({
              userId: insurer.id,
              title: "All Quotes Received — AI Analysis Running",
              message: `All panel beater quotes received for claim ${claim.claimNumber}. AI cost optimisation has been triggered.`,
              type: "quote_submitted",
              claimId: input.claimId,
              entityType: "quote",
              actionUrl: `/insurer/claims/${input.claimId}/comparison`,
              priority: "high",
            });
          }
        }
      } else {
        // Notify insurer of new quote submission
        // Only notify operational roles (claims_manager, insurer_admin) — not executive
        if (claim) {
          const insurers = await getUsersByInsurerRoles(["claims_manager"]);
          const tenantInsurers = insurers.filter((u) => !claim.tenantId || u.tenantId === claim.tenantId);
          const { createNotification } = await import("../db");
          
          for (const insurer of tenantInsurers) {
            await createNotification({
              userId: insurer.id,
              title: "New Quote Submitted",
              message: `Panel beater submitted quote for claim ${claim.claimNumber} (${allQuotes.length}/3 quotes received)`,
              type: "quote_submitted",
              claimId: input.claimId,
              entityType: "quote",
              actionUrl: `/insurer/claims/${input.claimId}/comparison`,
              priority: "medium",
            });
          }
        }
      }

      // Create audit entry
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "quote_submitted",
        entityType: "quote",
        changeDescription: `Quote submitted: $${(input.quotedAmount / 100).toFixed(2)}`,
      });

      // Emit event for analytics
      await emitClaimEvent({
        claimId: input.claimId,
        eventType: "quote_submitted",
        userId: ctx.user.id,
        userRole: ctx.user.role,
        tenantId,
        eventPayload: { 
          panelBeaterId: input.panelBeaterId,
          quotedAmount: input.quotedAmount,
          quotesReceived: allQuotes.length + 1, // Include current quote
        },
      });
      
      // Send email notification for quote submission
      if (claim) {
        const { notifyQuoteSubmission } = await import('../workflow-notifications');
        await notifyQuoteSubmission({
          claimId: input.claimId,
          panelBeaterId: input.panelBeaterId,
          claimNumber: claim.claimNumber,
          quotedAmount: input.quotedAmount,
          estimatedDays: input.estimatedDuration || 0,
          tenantId: tenantId || 'default',
        });
      }

      return { success: true };
    }),

  // Get quotes for a claim
  byClaim: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const tenantId = ctx.user.role === "admin" ? undefined : (ctx.user.tenantId || "default");
      return await getQuotesByClaimId(input.claimId, tenantId);
    }),

  // Get quotes with line items for comparison
  getWithLineItems: protectedProcedure
    .input(z.object({ claimId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      // Do NOT apply tenant filtering here — claimId already uniquely identifies the claim.
      // Tenant filtering via innerJoin was causing quotes to be silently dropped when the
      // user's tenantId didn't exactly match the claim's tenantId (e.g. "default" vs actual tenant).
      const quotes = await getQuotesByClaimId(input.claimId);
      console.log(`[getWithLineItems] claimId=${input.claimId} quotes=${quotes.length} ids=${quotes.map(q=>q.id).join(',')} pbIds=${quotes.map(q=>q.panelBeaterId).join(',')}`);
      
      // Fetch panel beater details for name resolution
      const panelBeaterIds = [...new Set(quotes.map(q => q.panelBeaterId))];
      const { panelBeaters: pbTable } = await import("../../drizzle/schema");
      const db = await getDb();
      const pbRows = db ? await db.select({ id: pbTable.id, businessName: pbTable.businessName, name: pbTable.name })
        .from(pbTable)
        .where(inArray(pbTable.id, panelBeaterIds.length > 0 ? panelBeaterIds : [-1])) : [];
      const pbMap = new Map(pbRows.map(pb => [pb.id, pb]));
      
      // Fetch line items for each quote
      const quotesWithItems = await Promise.all(
        quotes.map(async (quote) => {
          const lineItems = await getQuoteLineItemsByQuoteId(quote.id);
          const pb = pbMap.get(quote.panelBeaterId);
          // Fall back to repairerName from the base quote (populated by getQuotesByClaimId join)
          const resolvedName = pb?.businessName || pb?.name || (quote as any).repairerName || null;
          return {
            ...quote,
            lineItems,
            panelBeaterName: resolvedName,
          };
        })
      );
      
      return quotesWithItems;
    }),

  // Assessor quote adjustment — sets modified=1, preserves original amount, records reason
  adjustByAssessor: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
      adjustedAmount: z.number(), // in cents
      modificationReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { panelBeaterQuotes: _pbq } = await import('../../drizzle/schema');
      const { eq: _eq } = await import('drizzle-orm');
      // Fetch current quote to preserve original amount
      const [current] = await db.select().from(_pbq).where(_eq(_pbq.id, input.quoteId)).limit(1);
      if (!current) throw new Error(`Quote ${input.quoteId} not found`);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await db.update(_pbq).set({
        modified: 1,
        quoteType: 'assessor_adjusted',
        originalQuotedAmount: current.originalQuotedAmount ?? current.quotedAmount, // only set once
        quotedAmount: input.adjustedAmount,
        modificationReason: input.modificationReason ?? 'Assessor adjustment',
        modifiedByAssessorId: ctx.user.id,
        status: 'modified',
        updatedAt: now,
      }).where(_eq(_pbq.id, input.quoteId));
      console.log(`[quotes.adjustByAssessor] Quote ${input.quoteId} adjusted by assessor ${ctx.user.id}: $${(current.quotedAmount ?? 0) / 100} → $${input.adjustedAmount / 100}`);
      return { success: true, originalAmount: current.originalQuotedAmount ?? current.quotedAmount, adjustedAmount: input.adjustedAmount };
    }),

  // Strip & requote — insurer requested vehicle strip to expose latent damage; repairer submits new (often higher) quote
  submitStripRequote: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      panelBeaterId: z.number(),
      quotedAmount: z.number(), // in cents
      parentQuoteId: z.number(), // the original quote this supersedes
      laborCost: z.number().optional(),
      partsCost: z.number().optional(),
      laborHours: z.number().optional(),
      estimatedDuration: z.number().optional(),
      itemizedBreakdown: z.array(z.object({ item: z.string(), cost: z.number() })).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error('Not authenticated');
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      const { panelBeaterQuotes: _pbq } = await import('../../drizzle/schema');
      const { eq: _eq } = await import('drizzle-orm');
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      // Mark the parent quote as superseded
      await db.update(_pbq).set({ status: 'modified', updatedAt: now }).where(_eq(_pbq.id, input.parentQuoteId));
      // Insert the new strip-requote record
      await db.insert(_pbq).values({
        claimId: input.claimId,
        panelBeaterId: input.panelBeaterId,
        quotedAmount: input.quotedAmount,
        laborCost: input.laborCost ?? null,
        partsCost: input.partsCost ?? null,
        laborHours: input.laborHours ?? null,
        estimatedDuration: input.estimatedDuration ?? 0,
        itemizedBreakdown: JSON.stringify(input.itemizedBreakdown ?? []),
        notes: input.notes ?? null,
        quoteType: 'strip_requote',
        parentQuoteId: input.parentQuoteId,
        modified: 0,
        status: 'submitted',
        tenantId: ctx.user.tenantId || 'default',
        createdAt: now,
        updatedAt: now,
      });
      console.log(`[quotes.submitStripRequote] Strip requote for claim ${input.claimId} panel beater ${input.panelBeaterId}: $${input.quotedAmount / 100} (parent quote ${input.parentQuoteId})`);
      return { success: true };
    }),

  // Supplementary quote — additional damage found during repair not in original scope
  submitSupplementary: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      panelBeaterId: z.number(),
      quotedAmount: z.number(), // in cents — the ADDITIONAL amount only
      parentQuoteId: z.number(),
      notes: z.string().optional(),
      itemizedBreakdown: z.array(z.object({ item: z.string(), cost: z.number() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error('Not authenticated');
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      const { panelBeaterQuotes: _pbq } = await import('../../drizzle/schema');
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await db.insert(_pbq).values({
        claimId: input.claimId,
        panelBeaterId: input.panelBeaterId,
        quotedAmount: input.quotedAmount,
        itemizedBreakdown: JSON.stringify(input.itemizedBreakdown ?? []),
        notes: input.notes ?? null,
        quoteType: 'supplementary',
        parentQuoteId: input.parentQuoteId,
        modified: 0,
        estimatedDuration: 0,
        status: 'submitted',
        tenantId: ctx.user.tenantId || 'default',
        createdAt: now,
        updatedAt: now,
      });
      console.log(`[quotes.submitSupplementary] Supplementary quote for claim ${input.claimId}: +$${input.quotedAmount / 100}`);
      return { success: true };
    }),

  // Extract quote from handwritten image using OCR
  extractFromImage: protectedProcedure
    .input(z.object({ 
      claimId: z.number(),
      imageBase64: z.string() 
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const { invokeLLM } = await import("../_core/llm");

      // Use AI vision to extract line items from the image
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an expert at extracting structured data from handwritten quotations. Extract all line items with description, quantity, unit price, and calculate line totals. Return valid JSON only."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all line items from this handwritten quotation. For each item, provide: description, part_number (if visible), quantity, unit_price, and line_total. Return as JSON array."
              },
              {
                type: "image_url",
                image_url: {
                  url: input.imageBase64
                }
              }
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
                lineItems: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string" },
                      partNumber: { type: "string" },
                      quantity: { type: "number" },
                      unitPrice: { type: "number" },
                      lineTotal: { type: "number" }
                    },
                    required: ["description", "quantity", "unitPrice", "lineTotal"],
                    additionalProperties: false
                  }
                }
              },
              required: ["lineItems"],
              additionalProperties: false
            }
          }
        }
      });

      const extracted = JSON.parse((response.choices[0].message.content as string) || "{}");

      return extracted;
    }),

  // AI audit: review line items against damage analysis and annotate each with a short verdict
  runAudit: protectedProcedure
    .input(z.object({ quoteId: z.number(), claimId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      const { invokeLLM } = await import("../_core/llm");
      const { getDb, getQuoteLineItemsByQuoteId, getAiAssessmentByClaimId } = await import("../db");
      const { panelBeaterQuotes, quoteLineItems: qliTable } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Load line items and KINGA assessment
      const lineItems = await getQuoteLineItemsByQuoteId(input.quoteId);
      if (lineItems.length === 0) return { success: false, reason: "No line items found" };
      // R-GH-16: scope to caller's tenant so cross-tenant reads are blocked
      const _tenantId = ctx.user.role === 'admin' ? undefined : (ctx.user.tenantId || undefined);
      const assessment = await getAiAssessmentByClaimId(input.claimId, _tenantId);
      const damageZones: string[] = [];
      const detectedComponents: string[] = [];
      if (assessment) {
        try {
          const ci = assessment.costIntelligenceJson ? JSON.parse(assessment.costIntelligenceJson as string) : null;
          if (ci?.components) ci.components.forEach((c: any) => detectedComponents.push(c.name || c.component || ""));
          if (ci?.damage_zones) ci.damage_zones.forEach((z: any) => damageZones.push(z.zone || z.name || ""));
        } catch { /* ignore */ }
      }

      const lineItemSummary = lineItems.map((li, i) => `${i+1}. ${li.description} (${li.category}) qty:${li.quantity} unit:${li.unitPrice} total:${li.lineTotal}`).join("\n");
      const detectedSummary = detectedComponents.length > 0 ? detectedComponents.join(", ") : "(no AI component data available)";

      const prompt = `You are a motor vehicle insurance claims auditor. Review each quoted line item against the AI-detected damage components.

AI-detected damage components: ${detectedSummary}

Quoted line items:
${lineItemSummary}

For each line item, assign a short AI review tag (max 3 words, plain text, no symbols):
- "Consistent" — item matches detected damage
- "Price high" — item present but price seems disproportionate to damage severity
- "Scope broad" — item present but scope of work seems wider than damage warrants
- "Not detected" — no corresponding damage detected for this item
- "Verify qty" — quantity seems high relative to damage
- "Insufficient data" — cannot assess without more information

Also list any detected damage components that are NOT quoted (unquoted items).
Return JSON: { "lineItemReviews": [{"index": 1, "review": "Consistent"}, ...], "unquotedComponents": ["component name", ...], "congruencyScore": 0-100, "summary": "one sentence" }`;

      let auditResult: any = null;
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a motor vehicle insurance claims auditor. Return valid JSON only." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_schema", json_schema: { name: "quote_audit", strict: true, schema: { type: "object", properties: { lineItemReviews: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, review: { type: "string" } }, required: ["index", "review"], additionalProperties: false } }, unquotedComponents: { type: "array", items: { type: "string" } }, congruencyScore: { type: "integer" }, summary: { type: "string" } }, required: ["lineItemReviews", "unquotedComponents", "congruencyScore", "summary"], additionalProperties: false } } },
        });
        auditResult = JSON.parse((response.choices[0].message.content as string) || "{}");
      } catch (err) {
        console.error("[QuoteAudit] LLM failed:", err);
        return { success: false, reason: "AI audit failed" };
      }

      // Persist ai_review on each line item
      if (auditResult?.lineItemReviews) {
        for (const review of auditResult.lineItemReviews) {
          const li = lineItems[review.index - 1];
          if (li) {
            await db.update(qliTable).set({ aiReview: review.review }).where(eq(qliTable.id, li.id));
          }
        }
      }

      // Persist audit summary on the quote
      await db.update(panelBeaterQuotes).set({
        quoteAuditJson: JSON.stringify({ unquotedComponents: auditResult.unquotedComponents, summary: auditResult.summary }),
        quoteCongruencyScore: String(auditResult.congruencyScore ?? 0),
      }).where(eq(panelBeaterQuotes.id, input.quoteId));

      return { success: true, congruencyScore: auditResult.congruencyScore, summary: auditResult.summary, unquotedComponents: auditResult.unquotedComponents };
    }),
});
