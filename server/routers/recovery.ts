/**
 * Recovery / Subrogation Router
 * ─────────────────────────────
 * Extracted from server/routers.ts (TECH-02: router file split, Aug 2026)
 * Handles recovery cases, demand letters, third-party profiles, and correspondence.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, asc, inArray, gte, lte, or, sql, count } from "drizzle-orm";
import {
  claims, recoveryCases, recoveryCorrespondenceLog,
  thirdPartyVehicles, aiAssessments as aiAssessmentsTable,
  auditTrail, notifications
} from "../../drizzle/schema";
import { generateDemandLetter } from "../recovery/demandLetterGenerator";
import { checkSingleCaseDeadline } from "../recovery/recoveryDeadlineAlerts";
import { nanoid } from "nanoid";

export const recoveryRouter = router({
  /**
   * Get all recovery cases for the current insurer tenant.
   * Accessible by: recovery_officer, claims_manager, executive, insurer_admin
   */
  getCases: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      assignedToMe: z.boolean().optional(),
      repeatOffendersOnly: z.boolean().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      if (!tenantId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No insurer tenant associated with this account' });
      const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access requires recovery_officer, claims_manager, executive, or insurer_admin role' });
      }
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;
      const conditions = [eq(recoveryCases.tenantId, tenantId)];
      if (input?.status) conditions.push(eq(recoveryCases.status, input.status as any));
      if (input?.assignedToMe) conditions.push(eq(recoveryCases.assignedOfficerUserId, user.id));
      if (input?.repeatOffendersOnly) conditions.push(eq(recoveryCases.isRepeatOffender, 1));
      const rows = await db
        .select()
        .from(recoveryCases)
        .leftJoin(claims, eq(recoveryCases.claimId, claims.id))
        .where(and(...conditions))
        .orderBy(desc(recoveryCases.recoveryPotentialScore))
        .limit(pageSize)
        .offset(offset);
      return rows.map(r => ({
        ...r.recovery_cases,
        claimNumber: r.claims?.claimNumber ?? null,
        vehicleRegistration: r.claims?.vehicleRegistration ?? null,
        incidentDate: r.claims?.incidentDate ?? null,
      }));
    }),

  /**
   * Get a single recovery case by ID.
   */
  getCase: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
      }
      const [row] = await db
        .select()
        .from(recoveryCases)
        .leftJoin(claims, eq(recoveryCases.claimId, claims.id))
        .where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.tenantId, tenantId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recovery case not found' });
      return {
        ...row.recovery_cases,
        claimNumber: row.claims?.claimNumber ?? null,
        vehicleRegistration: row.claims?.vehicleRegistration ?? null,
        incidentDate: row.claims?.incidentDate ?? null,
        policeReportNumber: row.recovery_cases.policeReportNumber ?? row.claims?.policeReportNumber ?? null,
        policeStation: row.recovery_cases.policeStation ?? null,
        thirdPartyNameFromClaim: row.claims?.thirdPartyName ?? null,
        thirdPartyRegistrationFromClaim: row.claims?.thirdPartyRegistration ?? null,
        thirdPartyInsurerFromClaim: row.claims?.thirdPartyInsurer ?? null,
      };
    }),

  /**
   * Update a recovery case — officer notes, status change, investigation details.
   */
  updateCase: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['pending_review','under_investigation','open','demand_sent','liability_denied','disputed_legal','settled_full','settled_partial','closed_no_recovery','archived']).optional(),
      officerNotes: z.string().optional(),
      recoveredAmount: z.number().optional(),
      investigationReason: z.string().optional(),
      investigationExpectedResolutionDate: z.string().optional(),
      demandLetterSentAt: z.string().optional(),
      demandResponseDueDate: z.string().optional(),
      demandResponseReceivedAt: z.string().optional(),
      settlementAgreementDate: z.string().optional(),
      settlementNotes: z.string().optional(),
      recoveryTarget: z.enum(['insurer','individual','unknown']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
      }
      const [existing] = await db
        .select({ id: recoveryCases.id })
        .from(recoveryCases)
        .where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.tenantId, tenantId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recovery case not found' });
      const updateData: Record<string, unknown> = {};
      if (input.status !== undefined) updateData.status = input.status;
      if (input.officerNotes !== undefined) updateData.officerNotes = input.officerNotes;
      if (input.recoveredAmount !== undefined) updateData.recoveredAmount = input.recoveredAmount;
      if (input.investigationReason !== undefined) updateData.investigationReason = input.investigationReason;
      if (input.investigationExpectedResolutionDate !== undefined) updateData.investigationExpectedResolutionDate = input.investigationExpectedResolutionDate;
      if (input.demandLetterSentAt !== undefined) updateData.demandLetterSentAt = input.demandLetterSentAt;
      if (input.demandResponseDueDate !== undefined) updateData.demandResponseDueDate = input.demandResponseDueDate;
      if (input.demandResponseReceivedAt !== undefined) updateData.demandResponseReceivedAt = input.demandResponseReceivedAt;
      if (input.settlementAgreementDate !== undefined) updateData.settlementAgreementDate = input.settlementAgreementDate;
      if (input.settlementNotes !== undefined) updateData.settlementNotes = input.settlementNotes;
      if (input.recoveryTarget !== undefined) updateData.recoveryTarget = input.recoveryTarget;
      // Auto-set closedAt when terminal status is set
      if (input.status && ['settled_full','settled_partial','closed_no_recovery','archived'].includes(input.status)) {
        updateData.closedAt = new Date().toISOString().replace('T',' ').substring(0,19);
      }
       await db.update(recoveryCases).set(updateData).where(eq(recoveryCases.id, input.id));
      // Auto-log status change
      const now = new Date().toISOString().replace('T',' ').substring(0,19);
      const actorName = (user as any).name ?? (user as any).email ?? 'Unknown';
      const actorRole = (user as any).insurerRole ?? user.role ?? 'user';
      if (input.status) {
        db.insert(recoveryCorrespondenceLog).values({
          recoveryCaseId: input.id, tenantId,
          entryType: 'status_change',
          actorId: user.id.toString(), actorName, actorRole,
          subject: `Status changed to ${input.status.replace(/_/g,' ')}`,
          body: input.officerNotes ?? null,
          toStatus: input.status,
          createdAt: now,
        }).catch(() => {});
      }
      if (input.recoveryTarget) {
        db.insert(recoveryCorrespondenceLog).values({
          recoveryCaseId: input.id, tenantId,
          entryType: 'recovery_target_changed',
          actorId: user.id.toString(), actorName, actorRole,
          subject: `Recovery target changed to ${input.recoveryTarget}`,
          toTarget: input.recoveryTarget,
          createdAt: now,
        }).catch(() => {});
      }
      // Event-driven deadline check: fire immediately after any case update
      checkSingleCaseDeadline(input.id).catch(err =>
        console.error(`[RecoveryDeadlineAlerts] Event-driven check failed for RC-${input.id}:`, err)
      );
      return { success: true };
    }),
  /**
   * Assign a recovery case to a recovery officer.
   */
  assignCase: protectedProcedure
    .input(z.object({ id: z.number(), officerUserId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['claims_manager','executive','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only claims managers, executives, or admins can assign recovery cases' });
      }
      await db.update(recoveryCases)
        .set({ assignedOfficerUserId: input.officerUserId, assignedAt: new Date().toISOString().replace('T',' ').substring(0,19) })
        .where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.tenantId, tenantId)));
      return { success: true };
    }),

  /**
   * Generate an AI demand letter on insurer letterhead for a recovery case.
   * Returns a presigned S3 URL to the draft PDF.
   */
  generateDemandLetter: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['recovery_officer','claims_manager','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only recovery officers, claims managers, or admins can generate demand letters' });
      }
      const [rcRow] = await db.select().from(recoveryCases).where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.tenantId, tenantId))).limit(1);
      if (!rcRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recovery case not found' });
      const allowedStatuses = ['open','demand_sent','pending_review'];
      if (!allowedStatuses.includes(rcRow.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot generate demand letter for a case in '${rcRow.status}' status. Move the case to 'Open' first.` });
      }
      const result = await generateDemandLetter(input.id);
      // Auto-log demand letter generation
      const now = new Date().toISOString().replace('T',' ').substring(0,19);
      db.insert(recoveryCorrespondenceLog).values({
        recoveryCaseId: input.id, tenantId,
        entryType: 'demand_letter_generated',
        actorId: user.id.toString(),
        actorName: (user as any).name ?? (user as any).email ?? 'Unknown',
        actorRole: (user as any).insurerRole ?? user.role ?? 'user',
        subject: 'Demand letter generated',
        attachmentUrl: result.downloadUrl,
        createdAt: now,
      }).catch(() => {});
      return { downloadUrl: result.downloadUrl, s3Key: result.s3Key };
    }),
  /**
   * Get recovery KPIs for the current insurer tenant.
   */
  getKPIs: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
      }
      const rows = await db
        .select()
        .from(recoveryCases)
        .where(eq(recoveryCases.tenantId, tenantId));
      const total = rows.length;
      const pendingReview = rows.filter(r => r.status === 'pending_review').length;
      const open = rows.filter(r => r.status === 'open').length;
      const underInvestigation = rows.filter(r => r.status === 'under_investigation').length;
      const demandSent = rows.filter(r => r.status === 'demand_sent').length;
      const disputedLegal = rows.filter(r => r.status === 'disputed_legal').length;
      const settled = rows.filter(r => r.status === 'settled_full' || r.status === 'settled_partial').length;
      const archived = rows.filter(r => r.status === 'archived').length;
      const totalRecovered = rows.reduce((sum, r) => sum + (r.recoveredAmount ?? 0), 0);
      const totalSettlementAmount = rows.reduce((sum, r) => sum + (r.approvedSettlementAmount ?? 0), 0);
      const recoveryRate = totalSettlementAmount > 0 ? Math.round((totalRecovered / totalSettlementAmount) * 100) : 0;
      const avgRPS = total > 0 ? Math.round(rows.reduce((sum, r) => sum + r.recoveryPotentialScore, 0) / total) : 0;
      // Recovery deadline warnings: cases with deadline within 90 days
      const today = new Date();
      const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const approachingDeadlines = rows.filter(r =>
        r.recoveryDeadline && r.recoveryDeadline <= in90Days &&
        !['settled_full','settled_partial','closed_no_recovery','archived'].includes(r.status)
      ).length;
      return { total, pendingReview, open, underInvestigation, demandSent, disputedLegal, settled, archived, totalRecovered, totalSettlementAmount, recoveryRate, avgRPS, approachingDeadlines };
    }),

  /**
   * Fetch prior recovery cases by an array of IDs (for the repeat offender panel).
   */

  /**
   * Get inter-insurer intelligence — settlement rate, dispute rate, avg settlement time
   * per third-party insurer across all recovery cases for this tenant.
   * Accessible by: recovery_officer, claims_manager
   */
  getInsurerIntelligence: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
      }
      // Load all closed/settled/disputed recovery cases with a third-party insurer
      const rows = await db
        .select({
          thirdPartyInsurer: recoveryCases.thirdPartyInsurer,
          status: recoveryCases.status,
          approvedSettlementAmount: recoveryCases.approvedSettlementAmount,
          recoveredAmount: recoveryCases.recoveredAmount,
          createdAt: recoveryCases.createdAt,
          demandLetterSentAt: recoveryCases.demandLetterSentAt,
          settlementAgreementDate: recoveryCases.settlementAgreementDate,
        })
        .from(recoveryCases)
        .where(
          and(
            eq(recoveryCases.tenantId, tenantId),
            isNotNull(recoveryCases.thirdPartyInsurer)
          )
        )
        .orderBy(recoveryCases.createdAt);

      // Aggregate per insurer
      const map: Record<string, {
        insurer: string;
        total: number;
        settled: number;
        disputed: number;
        noRecovery: number;
        totalApprovedCents: number;
        totalRecoveredCents: number;
        settlementDays: number[];
      }> = {};

      for (const row of rows) {
        const ins = row.thirdPartyInsurer!;
        if (!map[ins]) {
          map[ins] = { insurer: ins, total: 0, settled: 0, disputed: 0, noRecovery: 0, totalApprovedCents: 0, totalRecoveredCents: 0, settlementDays: [] };
        }
        const entry = map[ins];
        entry.total++;
        if (row.status === 'settled_full' || row.status === 'settled_partial') {
          entry.settled++;
          // Days from demand sent to settlement
          if (row.demandLetterSentAt && row.settlementAgreementDate) {
            const days = Math.round((new Date(row.settlementAgreementDate).getTime() - new Date(row.demandLetterSentAt).getTime()) / (1000 * 60 * 60 * 24));
            if (days >= 0 && days < 3650) entry.settlementDays.push(days);
          }
        } else if (row.status === 'disputed_legal') {
          entry.disputed++;
        } else if (row.status === 'closed_no_recovery') {
          entry.noRecovery++;
        }
        if (row.approvedSettlementAmount) entry.totalApprovedCents += row.approvedSettlementAmount;
        if (row.recoveredAmount) entry.totalRecoveredCents += row.recoveredAmount;
      }

      return Object.values(map)
        .filter(e => e.total >= 1)
        .map(e => ({
          insurer: e.insurer,
          totalCases: e.total,
          settledCases: e.settled,
          disputedCases: e.disputed,
          noRecoveryCases: e.noRecovery,
          settlementRate: e.total > 0 ? Math.round((e.settled / e.total) * 100) : 0,
          disputeRate: e.total > 0 ? Math.round((e.disputed / e.total) * 100) : 0,
          avgSettlementDays: e.settlementDays.length > 0
            ? Math.round(e.settlementDays.reduce((a, b) => a + b, 0) / e.settlementDays.length)
            : null,
          totalApprovedCents: e.totalApprovedCents,
          totalRecoveredCents: e.totalRecoveredCents,
          recoveryEfficiency: e.totalApprovedCents > 0
            ? Math.round((e.totalRecoveredCents / e.totalApprovedCents) * 100)
            : 0,
        }))
        .sort((a, b) => b.totalCases - a.totalCases);
    }),

  /**
   * Get aggregated third-party profiles — individuals and insurers with case history.
   * Groups by thirdPartyName + thirdPartyRegistration, with insurer associations.
   */
  getThirdPartyProfiles: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
      }
      // Load all cases for this tenant with third-party info
      const rows = await db
        .select({
          id: recoveryCases.id,
          thirdPartyName: recoveryCases.thirdPartyName,
          thirdPartyRegistration: recoveryCases.thirdPartyRegistration,
          thirdPartyInsurer: recoveryCases.thirdPartyInsurer,
          thirdPartyPolicyNumber: recoveryCases.thirdPartyPolicyNumber,
          thirdPartyIdNumber: sql<string | null>`${recoveryCases}.third_party_id_number`,
          thirdPartyPhone: sql<string | null>`${recoveryCases}.third_party_phone`,
          thirdPartyAddress: sql<string | null>`${recoveryCases}.third_party_address`,
          thirdPartyInsurerPhone: sql<string | null>`${recoveryCases}.third_party_insurer_phone`,
          thirdPartyInsurerAddress: sql<string | null>`${recoveryCases}.third_party_insurer_address`,
          recoveryTarget: sql<string | null>`${recoveryCases}.recovery_target`,
          status: recoveryCases.status,
          approvedSettlementAmount: recoveryCases.approvedSettlementAmount,
          recoveredAmount: recoveryCases.recoveredAmount,
          currencyCode: recoveryCases.currencyCode,
          recoveryPotentialScore: recoveryCases.recoveryPotentialScore,
          isRepeatOffender: recoveryCases.isRepeatOffender,
          createdAt: recoveryCases.createdAt,
          claimNumber: claims.claimNumber,
          incidentDate: claims.incidentDate,
        })
        .from(recoveryCases)
        .leftJoin(claims, eq(recoveryCases.claimId, claims.id))
        .where(eq(recoveryCases.tenantId, tenantId))
        .orderBy(desc(recoveryCases.createdAt));

      // Group by third-party identity key (name + registration)
      const profileMap: Record<string, {
        key: string;
        thirdPartyName: string | null;
        thirdPartyRegistration: string | null;
        thirdPartyIdNumber: string | null;
        thirdPartyPhone: string | null;
        thirdPartyAddress: string | null;
        insurers: Set<string>;
        insurerPhone: string | null;
        insurerAddress: string | null;
        cases: Array<{
          id: number;
          claimNumber: string | null;
          status: string;
          approvedSettlementAmount: number | null;
          recoveredAmount: number | null;
          currencyCode: string | null;
          recoveryPotentialScore: number | null;
          incidentDate: string | null;
          createdAt: string | null;
        }>;
        totalApprovedCents: number;
        totalRecoveredCents: number;
        settled: number;
        disputed: number;
      }> = {};

      for (const row of rows) {
        const nameKey = (row.thirdPartyName ?? '').toLowerCase().trim();
        const regKey = (row.thirdPartyRegistration ?? '').toLowerCase().trim();
        const key = nameKey || regKey ? `${nameKey}|${regKey}` : `unknown-${row.id}`;

        if (!profileMap[key]) {
          profileMap[key] = {
            key,
            thirdPartyName: row.thirdPartyName,
            thirdPartyRegistration: row.thirdPartyRegistration,
            thirdPartyIdNumber: row.thirdPartyIdNumber,
            thirdPartyPhone: row.thirdPartyPhone,
            thirdPartyAddress: row.thirdPartyAddress,
            insurers: new Set(),
            insurerPhone: row.thirdPartyInsurerPhone,
            insurerAddress: row.thirdPartyInsurerAddress,
            cases: [],
            totalApprovedCents: 0,
            totalRecoveredCents: 0,
            settled: 0,
            disputed: 0,
          };
        }
        const p = profileMap[key];
        if (row.thirdPartyInsurer) p.insurers.add(row.thirdPartyInsurer);
        if (!p.insurerPhone && row.thirdPartyInsurerPhone) p.insurerPhone = row.thirdPartyInsurerPhone;
        if (!p.insurerAddress && row.thirdPartyInsurerAddress) p.insurerAddress = row.thirdPartyInsurerAddress;
        p.cases.push({
          id: row.id,
          claimNumber: row.claimNumber ?? null,
          status: row.status,
          approvedSettlementAmount: row.approvedSettlementAmount,
          recoveredAmount: row.recoveredAmount,
          currencyCode: row.currencyCode,
          recoveryPotentialScore: row.recoveryPotentialScore,
          incidentDate: row.incidentDate ?? null,
          createdAt: row.createdAt ?? null,
        });
        if (row.approvedSettlementAmount) p.totalApprovedCents += row.approvedSettlementAmount;
        if (row.recoveredAmount) p.totalRecoveredCents += row.recoveredAmount;
        if (row.status === 'settled_full' || row.status === 'settled_partial') p.settled++;
        if (row.status === 'disputed_legal') p.disputed++;
      }

      let profiles = Object.values(profileMap).map(p => ({
        key: p.key,
        thirdPartyName: p.thirdPartyName,
        thirdPartyRegistration: p.thirdPartyRegistration,
        thirdPartyIdNumber: p.thirdPartyIdNumber,
        thirdPartyPhone: p.thirdPartyPhone,
        thirdPartyAddress: p.thirdPartyAddress,
        insurers: Array.from(p.insurers),
        insurerPhone: p.insurerPhone,
        insurerAddress: p.insurerAddress,
        totalCases: p.cases.length,
        settledCases: p.settled,
        disputedCases: p.disputed,
        totalApprovedCents: p.totalApprovedCents,
        totalRecoveredCents: p.totalRecoveredCents,
        isRepeatOffender: p.cases.length > 1,
        latestIncidentDate: p.cases[0]?.incidentDate ?? null,
        cases: p.cases.slice(0, 10), // return up to 10 most recent cases per profile
      })).sort((a, b) => b.totalCases - a.totalCases);

      // Apply search filter
      if (input.search && input.search.trim()) {
        const q = input.search.toLowerCase().trim();
        profiles = profiles.filter(p =>
          (p.thirdPartyName ?? '').toLowerCase().includes(q) ||
          (p.thirdPartyRegistration ?? '').toLowerCase().includes(q) ||
          (p.thirdPartyIdNumber ?? '').toLowerCase().includes(q) ||
          p.insurers.some(ins => ins.toLowerCase().includes(q))
        );
      }

      const total = profiles.length;
      const offset = (input.page - 1) * input.pageSize;
      return {
        profiles: profiles.slice(offset, offset + input.pageSize),
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),
  getPriorCases: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
      }
      const rows = await db
        .select({
          id: recoveryCases.id,
          status: recoveryCases.status,
          recoveryPotentialScore: recoveryCases.recoveryPotentialScore,
          approvedSettlementAmount: recoveryCases.approvedSettlementAmount,
          recoveredAmount: recoveryCases.recoveredAmount,
          currencyCode: recoveryCases.currencyCode,
          wrongedParty: recoveryCases.wrongedParty,
          thirdPartyLiabilityPct: recoveryCases.thirdPartyLiabilityPct,
          recoveryDeadline: recoveryCases.recoveryDeadline,
          createdAt: recoveryCases.createdAt,
          claimNumber: claims.claimNumber,
          vehicleRegistration: claims.vehicleRegistration,
          incidentDate: claims.incidentDate,
        })
        .from(recoveryCases)
        .leftJoin(claims, eq(recoveryCases.claimId, claims.id))
        .where(
          and(
            eq(recoveryCases.tenantId, tenantId),
            inArray(recoveryCases.id, input.ids)
          )
        )
         .orderBy(recoveryCases.createdAt);
      return rows;
    }),

  // ── Correspondence Log ──────────────────────────────────────────────────
  getCorrespondenceLog: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = (ctx.user as any).tenantId ?? ctx.user.id.toString();
      const rows = await db
        .select()
        .from(recoveryCorrespondenceLog)
        .where(
          and(
            eq(recoveryCorrespondenceLog.recoveryCaseId, input.caseId),
            eq(recoveryCorrespondenceLog.tenantId, tenantId)
          )
        )
        .orderBy(desc(recoveryCorrespondenceLog.createdAt));
      return rows;
    }),

  addCorrespondenceEntry: protectedProcedure
    .input(z.object({
      caseId:        z.number(),
      entryType:     z.enum([
        "demand_letter_generated", "demand_letter_sent", "response_received",
        "follow_up_sent", "legal_escalation", "settlement_offer",
        "settlement_accepted", "settlement_rejected", "case_note",
        "status_change", "recovery_target_changed", "system_event",
      ]).default("case_note"),
      subject:       z.string().max(255).optional(),
      body:          z.string().optional(),
      attachmentUrl: z.string().max(1024).optional(),
      fromStatus:    z.string().optional(),
      toStatus:      z.string().optional(),
      fromTarget:    z.string().optional(),
      toTarget:      z.string().optional(),
      amountCents:   z.number().int().optional(),
      currencyCode:  z.string().max(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const tenantId = (ctx.user as any).tenantId ?? ctx.user.id.toString();
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      await db.insert(recoveryCorrespondenceLog).values({
        recoveryCaseId: input.caseId,
        tenantId,
        entryType:     input.entryType,
        actorId:       ctx.user.id.toString(),
        actorName:     ctx.user.name ?? ctx.user.email ?? "Unknown",
        actorRole:     (ctx.user as any).insurerRole ?? ctx.user.role ?? "user",
        subject:       input.subject ?? null,
        body:          input.body ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        fromStatus:    input.fromStatus ?? null,
        toStatus:      input.toStatus ?? null,
        fromTarget:    input.fromTarget ?? null,
        toTarget:      input.toTarget ?? null,
        amountCents:   input.amountCents ?? null,
        currencyCode:  input.currencyCode ?? "USD",
        createdAt:     now,
      });
      return { success: true };
    }),

  /**
   * Export the correspondence log for a recovery case as a PDF.
   * Returns a base64-encoded PDF string for client-side download.
   */
  exportCorrespondenceLog: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
      }
      // Load case details
      const [rcRow] = await db.select().from(recoveryCases).where(and(eq(recoveryCases.id, input.caseId), eq(recoveryCases.tenantId, tenantId))).limit(1);
      if (!rcRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recovery case not found' });
      // Load correspondence entries
      const entries = await db
        .select()
        .from(recoveryCorrespondenceLog)
        .where(and(eq(recoveryCorrespondenceLog.recoveryCaseId, input.caseId), eq(recoveryCorrespondenceLog.tenantId, tenantId)))
        .orderBy(recoveryCorrespondenceLog.createdAt);
      // Build PDF using pdfkit
      const PDFDocument = (await import('pdfkit')).default;
      const { storagePut } = await import('../storage');
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', resolve);
        doc.on('error', reject);
        // Header
        doc.fontSize(18).font('Helvetica-Bold').text('Correspondence Log', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica').text(`Recovery Case #${rcRow.id}`, { align: 'center' });
        doc.fontSize(9).fillColor('#666').text(`Third Party: ${rcRow.thirdPartyName ?? 'Unknown'} | Insurer: ${rcRow.thirdPartyInsurer ?? 'Unknown'}`, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(9).text(`Exported: ${new Date().toLocaleDateString('en-ZA')} ${new Date().toLocaleTimeString('en-ZA')} by ${user.name ?? user.email ?? 'Unknown'}`, { align: 'center' });
        doc.moveDown(1);
        // Divider
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
        doc.moveDown(0.5);
        if (entries.length === 0) {
          doc.fillColor('#333').fontSize(10).text('No correspondence entries recorded for this case.');
        } else {
          entries.forEach((entry, idx) => {
            const typeLabel = entry.entryType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            doc.fillColor('#1a1a2e').fontSize(10).font('Helvetica-Bold').text(`${idx + 1}. [${typeLabel}]`, { continued: true });
            if (entry.subject) doc.font('Helvetica').fillColor('#333').text(` — ${entry.subject}`, { continued: false });
            else doc.text('', { continued: false });
            doc.fontSize(8).fillColor('#666').font('Helvetica').text(`${entry.createdAt}${entry.actorName ? ' · ' + entry.actorName : ''}${entry.actorRole ? ' (' + entry.actorRole.replace(/_/g, ' ') + ')' : ''}`);
            if (entry.body) { doc.moveDown(0.2); doc.fontSize(9).fillColor('#333').font('Helvetica').text(entry.body, { indent: 10 }); }
            if (entry.amountCents) { doc.moveDown(0.2); doc.fontSize(9).fillColor('#2d6a4f').text(`Amount: ${entry.currencyCode ?? 'USD'} ${(entry.amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { indent: 10 }); }
            if (entry.attachmentUrl) { doc.moveDown(0.2); doc.fontSize(8).fillColor('#5a67d8').text(`Attachment: ${entry.attachmentUrl}`, { indent: 10 }); }
            doc.moveDown(0.5);
            if (idx < entries.length - 1) { doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#eee').stroke(); doc.moveDown(0.3); }
          });
        }
        doc.end();
      });
      const pdfBuffer = Buffer.concat(chunks);
      const fileKey = `recovery-correspondence/${tenantId}/case-${input.caseId}-log-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
      return { downloadUrl: url };
    }),

  /**
   * Recovery Watchlist
   *
   * Returns four actionable recovery categories for the Claims Manager.
   * Source: recovery_cases table. Zero schema changes required.
   */
  getWatchlist: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = ctx.user;
      const tenantId = (user as any).tenantId;
      const allowedRoles = ['recovery_officer', 'claims_manager', 'executive', 'insurer_admin'];
      if (!allowedRoles.includes((user as any).insurerRole)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Recovery module access denied' });
      }
      const rows = await db
        .select()
        .from(recoveryCases)
        .where(eq(recoveryCases.tenantId, tenantId))
        .orderBy(desc(recoveryCases.recoveryPotentialScore));

      const today = new Date().toISOString().split('T')[0];
      const in90Days = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
      const highValueThreshold = FINANCIAL_APPROVAL_THRESHOLD_CENTS;

      const recoveryEligible = rows.filter(r =>
        ['open', 'pending_review'].includes(r.status) && r.recoveryPotentialScore >= 60
      );
      const demandOutstanding = rows.filter(r =>
        r.status === 'demand_sent' && !r.settlementAgreementDate
      );
      const deadlineApproaching = rows.filter(r =>
        r.recoveryDeadline && r.recoveryDeadline >= today && r.recoveryDeadline <= in90Days &&
        !['settled_full', 'settled_partial', 'closed_no_recovery', 'archived'].includes(r.status)
      );
      const highValueRecoveries = rows.filter(r =>
        (r.approvedSettlementAmount ?? 0) > highValueThreshold &&
        !['settled_full', 'settled_partial', 'closed_no_recovery', 'archived'].includes(r.status)
      );

      const summariseCase = (arr: typeof rows) => ({
        count: arr.length,
        totalAmount: arr.reduce((sum, r) => sum + (r.approvedSettlementAmount ?? 0), 0),
        topCases: arr.slice(0, 3).map(r => ({
          id: r.id,
          thirdPartyName: r.thirdPartyName,
          thirdPartyInsurer: r.thirdPartyInsurer,
          status: r.status,
          recoveryPotentialScore: r.recoveryPotentialScore,
          recoveryDeadline: r.recoveryDeadline,
        })),
      });

      return {
        recoveryEligible: summariseCase(recoveryEligible),
        demandOutstanding: summariseCase(demandOutstanding),
        deadlineApproaching: summariseCase(deadlineApproaching),
        highValueRecoveries: summariseCase(highValueRecoveries),
        totalWatchlistItems: new Set([
          ...recoveryEligible.map(r => r.id),
          ...demandOutstanding.map(r => r.id),
          ...deadlineApproaching.map(r => r.id),
          ...highValueRecoveries.map(r => r.id),
        ]).size,
      };
    }),
});

