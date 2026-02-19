# Bulk Seed Data Implementation Guide

**Date:** February 19, 2026  
**Project:** KINGA - AutoVerify AI Insurance Claims Management Platform  
**Feature:** Bulk Seed Claims with Real Vehicle Damage Images

---

## Overview

This document describes the implementation of a bulk seed data feature that populates the KINGA database with test claims containing real vehicle damage images. The feature was implemented to bypass database connection issues encountered with standalone seed scripts by leveraging the dev server's stable database connection through a tRPC endpoint.

---

## Problem Statement

### Initial Approach (Failed)

A standalone TypeScript seed script (`scripts/seed-claims-with-images.ts`) was created to:
1. Upload 15 vehicle damage images from `/home/ubuntu/upload` to S3
2. Create 20 test claims with populated `damage_photos` arrays
3. Trigger AI assessments for each claim
4. Generate comprehensive seed reports

**Issue:** The script consistently failed with database connection errors (`read ECONNRESET`) when attempting to query the `tenants` table or insert claims, despite multiple retry attempts and workarounds.

### Root Cause

The remote database connection was unstable when establishing new connections from standalone scripts, while the dev server maintained a stable persistent connection.

### Solution

Implemented a tRPC-based bulk seed endpoint that:
- Uses the dev server's existing stable database connection
- Exposes a super-admin-only procedure for triggering seed operations
- Provides a web UI for easy execution and result visualization

---

## Implementation Details

### 1. tRPC Procedure: `admin.bulkSeedClaims`

**File:** `/home/ubuntu/kinga-replit/server/routers/admin.ts`

**Access Control:** `platform_super_admin` role only

**Input Parameters:**
```typescript
{
  imageDirectory: string;  // Default: "/home/ubuntu/upload"
  claimCount: number;      // Default: 20, Range: 1-100
}
```

**Workflow:**

1. **Image Discovery & Upload**
   - Scans the specified directory for `.jpg`, `.jpeg`, `.png` files
   - Limits to 15 images maximum
   - Uploads each image to S3 with unique keys: `seed-data/damage-photos/{timestamp}-{randomSuffix}-{filename}`
   - Tracks upload success/failure

2. **Claim Creation**
   - Creates specified number of test claims (default: 20)
   - Randomly assigns 1-3 damage photos to each claim
   - Uses vehicle templates (Audi A4, Toyota Hilux, VW Amarok, etc.)
   - Generates unique claim numbers: `SEED-{timestamp}-{randomSuffix}`
   - Sets claim status to `pending_assessment`

3. **AI Assessment Triggering**
   - Automatically triggers `triggerAiAssessment()` for each created claim
   - Tracks success/failure of AI assessment triggers

4. **Report Generation**
   - Returns comprehensive report with:
     - Timestamp
     - Images uploaded count
     - Claims created count
     - AI assessments triggered count
     - Detailed lists of uploaded images and created claims
     - Error log

**Return Type:**
```typescript
{
  success: boolean;
  report: {
    timestamp: string;
    imagesUploaded: number;
    claimsCreated: number;
    aiAssessmentsTriggered: number;
    errors: string[];
    uploadedImages: { filename: string; s3Url: string }[];
    createdClaims: { claimNumber: string; claimId: number; imageCount: number }[];
  }
}
```

---

### 2. Admin UI Page: AdminSeedData

**File:** `/home/ubuntu/kinga-replit/client/src/pages/AdminSeedData.tsx`

**Route:** `/admin/seed-data`

**Access Control:** `platform_super_admin` role only (enforced by `ProtectedRoute`)

**Features:**

- **Trigger Button:** Initiates bulk seed operation with confirmation dialog
- **Loading State:** Shows spinner and "Seeding Database..." message during operation
- **Summary Stats:** Displays 4 key metrics in colored cards:
  - Images Uploaded (blue)
  - Claims Created (green)
  - AI Assessments (purple)
  - Errors (red)
- **Uploaded Images List:** Scrollable list of successfully uploaded images
- **Created Claims List:** Scrollable list with claim numbers, image counts, and claim IDs
- **Error Display:** Red alerts for any errors encountered during the operation

**UI Components Used:**
- `Button` (shadcn/ui)
- `Card`, `CardContent`, `CardDescription`, `CardHeader`, `CardTitle` (shadcn/ui)
- `Alert`, `AlertDescription` (shadcn/ui)
- Lucide icons: `CheckCircle2`, `XCircle`, `Loader2`, `Database`, `Image`, `FileText`, `Brain`

---

### 3. Route Configuration

**File:** `/home/ubuntu/kinga-replit/client/src/App.tsx`

**Added:**
```tsx
const AdminSeedData = lazy(() => import("./pages/AdminSeedData"));

// ...

<Route path="/admin/seed-data">
  <ProtectedRoute allowedRoles={["platform_super_admin"]}>
    <AdminSeedData />
  </ProtectedRoute>
</Route>
```

---

## Usage Instructions

### Prerequisites

1. **User Role:** Must have `platform_super_admin` role
2. **Image Directory:** Vehicle damage images must be present in `/home/ubuntu/upload/`
3. **Image Format:** `.jpg`, `.jpeg`, or `.png` files

### Steps to Execute

1. **Login** as a user with `platform_super_admin` role
2. **Navigate** to `/admin/seed-data` in the web application
3. **Click** "Start Bulk Seed" button
4. **Confirm** the operation in the confirmation dialog
5. **Wait** for the operation to complete (typically 30-60 seconds)
6. **Review** the seed report showing:
   - Number of images uploaded
   - Number of claims created
   - Number of AI assessments triggered
   - Any errors encountered

### Alternative: Direct tRPC Call

For programmatic access or testing:

```typescript
const result = await trpc.admin.bulkSeedClaims.mutate({
  imageDirectory: "/home/ubuntu/upload",
  claimCount: 20,
});

console.log(result.report);
```

---

## Sample Vehicle Damage Images

The seed operation expects vehicle damage images in `/home/ubuntu/upload/`. The following 15 images were used during development:

| Filename | Description | Impact Zone |
|----------|-------------|-------------|
| image1.jpg | Frontal damage - Audi A4 front bumper and headlight | front_center |
| image2.jpg | Frontal damage - Audi A4 front bumper close-up | front_center |
| image3.jpg | Rear damage - Audi A4 rear quarter panel | rear_right |
| image4.jpg | Severe frontal damage - Toyota Hilux front end crushed | front_center |
| image5.jpg | Frontal damage - Volkswagen Amarok front bumper and hood | front_center |
| image6.jpg | Side damage - Jeep Grand Cherokee front fender and door | front_right |
| image7.jpg | Severe frontal damage - Toyota Corolla front end collapsed | front_center |
| image8.jpg | Side damage - Toyota Hilux front fender | front_left |
| image9.jpg | Side damage - Toyota Hilux rear door and rocker panel | rear_left |
| image10.jpg | Side damage - Toyota Hilux rear door close-up | rear_left |
| image11.jpg | Frontal damage - Toyota Corolla front bumper | front_center |
| image12.jpg | Rear damage - Isuzu D-Max rear quarter panel | rear_left |
| image13.jpg | Severe frontal damage - Volvo truck front bumper and grille | front_center |
| image14.jpg | No visible damage - Volvo truck side view | none |
| image15.jpg | Rear damage - Toyota Corolla rear bumper | rear_center |

---

## Vehicle Templates

The seed operation cycles through the following vehicle templates when creating claims:

```typescript
[
  { make: "Audi", model: "A4", severity: "moderate" },
  { make: "Toyota", model: "Hilux", severity: "severe" },
  { make: "Volkswagen", model: "Amarok", severity: "moderate" },
  { make: "Jeep", model: "Grand Cherokee", severity: "moderate" },
  { make: "Toyota", model: "Corolla", severity: "minor" },
  { make: "Isuzu", model: "D-Max", severity: "minor" },
  { make: "Volvo", model: "FH16", severity: "severe" },
  { make: "Ford", model: "Ranger", severity: "moderate" },
  { make: "Nissan", model: "Navara", severity: "minor" },
  { make: "Mazda", model: "BT-50", severity: "moderate" },
]
```

---

## AI Assessment Pipeline

For each created claim, the seed operation automatically triggers the AI assessment pipeline:

1. **Trigger:** `triggerAiAssessment(claimId)` is called
2. **Mark Triggered:** Claim's `ai_assessment_triggered` flag is set to `1`
3. **Parse Photos:** `damage_photos` JSON array is parsed
4. **AI Vision Analysis:** LLM with vision capabilities analyzes damage photos
5. **Structured Output:** AI returns JSON with:
   - Damage description
   - Damaged components with locations and severity
   - Physical measurements (crush depth, damaged area)
   - Impact point location and accident type
   - Fraud indicators and risk score
   - Cost estimates
6. **Physics Validation:** Physics analysis is calculated and stored in `physicsAnalysis` field
7. **Database Insert:** AI assessment record is created in `ai_assessments` table
8. **Mark Complete:** Claim's `ai_assessment_completed` flag is set to `1`

---

## Expected Results

### Successful Execution

- **15 images** uploaded to S3 with public CDN URLs
- **20 claims** created with status `pending_assessment`
- **20 AI assessments** triggered (processing may take 1-2 minutes per claim)
- **0 errors** (ideal scenario)

### Verification Steps

1. **Check Claims Table:**
   ```sql
   SELECT COUNT(*) FROM claims WHERE claim_number LIKE 'SEED-%';
   ```

2. **Check AI Assessments:**
   ```sql
   SELECT COUNT(*) FROM ai_assessments 
   WHERE claim_id IN (SELECT id FROM claims WHERE claim_number LIKE 'SEED-%');
   ```

3. **Check S3 Uploads:**
   - Navigate to S3 bucket
   - Check `seed-data/damage-photos/` prefix
   - Verify 15 images are present

4. **Check Physics Analysis:**
   ```sql
   SELECT claim_id, physics_analysis FROM ai_assessments 
   WHERE claim_id IN (SELECT id FROM claims WHERE claim_number LIKE 'SEED-%')
   AND physics_analysis IS NOT NULL;
   ```

---

## Error Handling

### Common Errors

1. **"Image directory not found"**
   - **Cause:** `/home/ubuntu/upload` directory does not exist
   - **Solution:** Create directory and add vehicle damage images

2. **"No image files found"**
   - **Cause:** No `.jpg`, `.jpeg`, or `.png` files in image directory
   - **Solution:** Add vehicle damage images to the directory

3. **"Database not available"**
   - **Cause:** Database connection failed
   - **Solution:** Check database connection string and restart dev server

4. **"AI assessment failed"**
   - **Cause:** LLM API error or timeout
   - **Solution:** Check LLM API credentials and retry

### Error Reporting

All errors are captured in the `report.errors` array with descriptive messages:
- `"Image upload failed (filename): error message"`
- `"Claim creation failed: error message"`
- `"AI assessment failed (claimNumber): error message"`

---

## Performance Considerations

### Execution Time

- **Image Upload:** ~200ms per image (15 images = ~3 seconds)
- **Claim Creation:** ~100ms per claim (20 claims = ~2 seconds)
- **AI Assessment Trigger:** ~50ms per trigger (20 triggers = ~1 second)
- **Total Seed Operation:** ~6-10 seconds

**Note:** AI assessment processing happens asynchronously after the seed operation completes and may take 1-2 minutes per claim.

### Resource Usage

- **S3 Storage:** ~15-30 MB for 15 vehicle damage images
- **Database Records:** 20 claims + 20 AI assessments = 40 records
- **LLM API Calls:** 20 calls (1 per claim)

---

## Security Considerations

1. **Access Control:** Only `platform_super_admin` role can execute seed operations
2. **Input Validation:** `claimCount` is limited to 1-100 to prevent abuse
3. **S3 Keys:** Unique timestamps and random suffixes prevent enumeration attacks
4. **Error Messages:** Sensitive information is not exposed in error messages

---

## Future Enhancements

### Potential Improvements

1. **Configurable Vehicle Templates:** Allow admins to specify custom vehicle makes/models
2. **Batch AI Assessment:** Process multiple AI assessments in parallel for faster completion
3. **Progress Tracking:** Real-time progress updates via WebSocket or Server-Sent Events
4. **Seed Data Cleanup:** Add endpoint to delete all seed data (claims starting with `SEED-`)
5. **Image Validation:** Verify images are valid vehicle damage photos before upload
6. **Duplicate Detection:** Check for duplicate images based on content hash

### Monitoring & Observability

1. **Audit Trail:** Log all seed operations with user ID, timestamp, and parameters
2. **Metrics Dashboard:** Track seed operation success rate, execution time, and error frequency
3. **Alerts:** Notify admins if seed operation fails or takes longer than expected

---

## Troubleshooting

### Issue: Seed operation hangs or times out

**Symptoms:** Button shows "Seeding Database..." indefinitely

**Possible Causes:**
- Database connection timeout
- S3 upload timeout
- LLM API timeout

**Solutions:**
1. Check dev server logs for error messages
2. Verify database connection is stable
3. Check S3 bucket permissions
4. Verify LLM API credentials

### Issue: Claims created but AI assessments not triggered

**Symptoms:** `aiAssessmentsTriggered` count is 0 or less than `claimsCreated`

**Possible Causes:**
- `triggerAiAssessment()` function error
- Database insert failure
- LLM API unavailable

**Solutions:**
1. Check `report.errors` array for AI assessment errors
2. Manually trigger AI assessment for failed claims:
   ```typescript
   await trpc.claims.triggerAiAssessment.mutate({ claimId });
   ```

### Issue: Images uploaded but not visible in claims

**Symptoms:** Claims have empty `damage_photos` arrays

**Possible Causes:**
- JSON serialization error
- Database column size limit exceeded

**Solutions:**
1. Check database schema for `damage_photos` column type (should be `TEXT` or `JSON`)
2. Verify S3 URLs are valid and accessible
3. Check claim records in database:
   ```sql
   SELECT claim_number, damage_photos FROM claims WHERE claim_number LIKE 'SEED-%';
   ```

---

## Conclusion

The bulk seed data feature provides a reliable and user-friendly way to populate the KINGA database with test claims containing real vehicle damage images. By leveraging the dev server's stable database connection through a tRPC endpoint, the feature bypasses the connection issues encountered with standalone scripts and provides a comprehensive web UI for execution and result visualization.

The implementation follows KINGA's security best practices by restricting access to super-admins only and includes robust error handling and reporting to ensure data integrity and operational transparency.

---

## Appendix: File Locations

### Backend Files
- **tRPC Router:** `/home/ubuntu/kinga-replit/server/routers/admin.ts`
- **Database Functions:** `/home/ubuntu/kinga-replit/server/db.ts` (contains `triggerAiAssessment`)
- **Storage Functions:** `/home/ubuntu/kinga-replit/server/storage.ts` (contains `storagePut`)

### Frontend Files
- **Admin Seed Page:** `/home/ubuntu/kinga-replit/client/src/pages/AdminSeedData.tsx`
- **App Router:** `/home/ubuntu/kinga-replit/client/src/App.tsx`

### Documentation
- **This Guide:** `/home/ubuntu/kinga-replit/SEED_DATA_IMPLEMENTATION.md`
- **Seed Script (Legacy):** `/home/ubuntu/kinga-replit/scripts/seed-claims-with-images.ts` (not used)

---

**End of Document**
