# KINGA Workflow & User Experience Test Script

**Purpose**: Rigorously test end-to-end user workflows and catch real-world errors that have caused production issues.

**Focus Areas**:
- PDF upload and processing (timeout issues)
- Report generation and visualization rendering
- Data flow between components
- Error handling and edge cases
- User experience and navigation

---

## Critical Workflow Tests (Based on Past Issues)

### 🔴 CRITICAL TEST 1: PDF Upload & Processing
**Issue History**: Timeouts at 90%, "Service Unavailable" errors, "Failed to fetch"

**Test Steps**:
1. Log in as Insurer
2. Navigate to "Upload External Assessment"
3. Select a real panel beater PDF (921 KB as shown in screenshot)
4. Click "Upload & Analyze"
5. **Monitor closely**:
   - Progress indicator updates (0% → 20% → 40% → 60% → 80% → 90% → 100%)
   - No timeout after 90%
   - No "Service Unavailable" error
   - No "Failed to fetch" error
6. Verify redirect to Assessment Results page

**Expected Duration**: < 2 minutes

**Checkpoints**:
- [ ] Upload starts without error
- [ ] Progress shows "Uploading PDF..."
- [ ] Progress shows "Extracting Data..."
- [ ] Progress shows "Analyzing Physics..."
- [ ] Progress shows "Detecting Fraud..."
- [ ] Completes without timeout
- [ ] Redirects to results page
- [ ] No console errors (F12)

**If Fails**:
- Check browser console for exact error
- Check server logs: `tail -100 /tmp/webdev-server-*.log`
- Note exact percentage where it fails
- Note exact error message

**Status**: ☐ Pass ☐ Fail  
**Time Taken**: [ ] seconds  
**Notes**:

---

### 🔴 CRITICAL TEST 2: Assessment Results Report Generation
**Issue History**: Missing photos, visualizations not rendering, "undefined" values

**Test Steps**:
1. After successful PDF upload, land on Assessment Results page
2. **Verify Overview Tab**:
   - [ ] Vehicle information displays correctly (make, model, year, registration)
   - [ ] Damage summary shows extracted text
   - [ ] Cost estimate displays as number (not "undefined")
   - [ ] Confidence score shows percentage
   - [ ] Damage photos section exists
3. **Verify Damage Photos**:
   - [ ] Photos extracted from PDF are displayed
   - [ ] Photo count badge shows correct number
   - [ ] Click on photo opens zoom dialog
   - [ ] Navigation arrows work (next/previous)
   - [ ] Photo counter shows "Photo X of Y"
   - [ ] Close button works
4. **Verify Damage Analysis Tab**:
   - [ ] Vehicle diagram SVG renders
   - [ ] Damaged components highlighted
   - [ ] Hover tooltips show damage details
   - [ ] Severity badges show colors
5. **Verify Physics Tab**:
   - [ ] Force vector diagram renders
   - [ ] Impact metrics display (G-force, energy, etc.)
   - [ ] Validation score shows
   - [ ] AI commentary card displays
   - [ ] Commentary text is readable and relevant
6. **Verify Fraud Risk Tab**:
   - [ ] Radar/spider chart renders
   - [ ] Risk level badge shows (LOW/MEDIUM/HIGH)
   - [ ] Fraud probability percentage displays
   - [ ] Risk factors list shows
   - [ ] AI commentary card displays
7. **Verify Cost Breakdown Tab**:
   - [ ] Pie chart renders
   - [ ] Bar chart renders
   - [ ] Detailed table shows line items
   - [ ] Total matches estimate

**Critical Checks**:
- [ ] NO "undefined" or "null" text anywhere
- [ ] NO broken images (check for 404s in Network tab)
- [ ] NO console errors
- [ ] ALL charts render (no blank spaces)
- [ ] ALL text is readable (no invisible text on same-color background)

**Status**: ☐ Pass ☐ Fail  
**Missing/Broken Elements**:

---

### 🔴 CRITICAL TEST 3: Create Claim from Assessment
**Issue History**: Validation error "selectedPanelBeaterIds must be exactly 3"

**Test Steps**:
1. On Assessment Results page, click "Create Claim with This Data"
2. **Verify pre-filled data**:
   - [ ] Vehicle make, model, year populated
   - [ ] Damage description populated
   - [ ] Cost estimate populated
   - [ ] Claimant name populated (if in PDF)
3. **Test with 0 panel beaters**:
   - Select 0 panel beaters
   - Click "Create Claim"
   - [ ] Should succeed (validation allows 0-3)
4. **Test with 1 panel beater**:
   - Select 1 panel beater
   - Click "Create Claim"
   - [ ] Should succeed
5. **Test with 3 panel beaters**:
   - Select 3 panel beaters
   - Click "Create Claim"
   - [ ] Should succeed
6. **Verify claim created**:
   - [ ] Claim number assigned (CLM-YYYYMMDD-XXXX format)
   - [ ] Redirects to claim details or success page
   - [ ] No validation errors
   - [ ] No console errors

**Status**: ☐ Pass ☐ Fail  
**Claim Number**: [ ]  
**Notes**:

---

### 🟡 IMPORTANT TEST 4: Edit Extracted Data
**Purpose**: Verify users can correct AI extraction errors

**Test Steps**:
1. On Assessment Results page, click "Edit Extracted Data"
2. Modify:
   - Vehicle make: Change to different value
   - Cost estimate: Change to different number
   - Damage description: Add text
3. Click "Save Changes"
4. **Verify**:
   - [ ] Changes saved
   - [ ] Updated values display in report
   - [ ] No errors
   - [ ] Can edit again if needed

**Status**: ☐ Pass ☐ Fail  
**Notes**:

---

### 🟡 IMPORTANT TEST 5: Navigation & Back Button
**Purpose**: Ensure users don't get trapped in workflows

**Test Steps**:
1. Upload assessment → Results page
2. Click "Back to Dashboard" (or browser back button)
3. [ ] Returns to upload page or portal
4. Navigate to Results page again
5. Click "Upload Another Assessment"
6. [ ] Returns to upload page
7. [ ] Previous assessment data not lost (can navigate back)

**Status**: ☐ Pass ☐ Fail  
**Notes**:

---

## Data Flow & Integration Tests

### TEST 6: Python Integration - Image Extraction
**Test Steps**:
1. Upload PDF with embedded images
2. Check server logs for Python script execution
3. Verify images extracted to temp directory
4. Verify images uploaded to S3
5. Verify S3 URLs returned to frontend
6. Verify images display in photo gallery

**Checkpoints**:
- [ ] Python script `process_assessment.py` executes
- [ ] No Python errors in logs
- [ ] Images extracted (check temp directory)
- [ ] S3 upload successful (check logs for S3 URLs)
- [ ] Frontend receives image URLs
- [ ] Images display correctly

**Status**: ☐ Pass ☐ Fail  
**Notes**:

---

### TEST 7: Python Integration - Physics Validation
**Test Steps**:
1. Upload assessment
2. Check server logs for `validate_physics.py` execution
3. Verify physics analysis returned
4. Verify physics data displays on Physics tab

**Checkpoints**:
- [ ] Python script executes
- [ ] Returns JSON with physics analysis
- [ ] No Python errors
- [ ] Force calculations present
- [ ] G-force present
- [ ] Damage consistency status present
- [ ] Data displays on frontend

**Status**: ☐ Pass ☐ Fail  
**Physics Data Received**: ☐ Yes ☐ No  
**Notes**:

---

### TEST 8: Python Integration - Fraud Detection
**Test Steps**:
1. Upload assessment
2. Check server logs for `detect_fraud.py` execution
3. Verify fraud analysis returned
4. Verify fraud data displays on Fraud Risk tab

**Checkpoints**:
- [ ] Python script executes
- [ ] Returns JSON with fraud analysis
- [ ] Fraud probability calculated
- [ ] Risk factors identified
- [ ] Radar chart data present
- [ ] Data displays on frontend

**Status**: ☐ Pass ☐ Fail  
**Fraud Probability**: [ ]%  
**Notes**:

---

### TEST 9: LLM Integration - Data Extraction
**Test Steps**:
1. Upload PDF
2. Monitor network tab for LLM API call
3. Verify LLM extracts vehicle info, damage, cost
4. Check extraction accuracy vs PDF content

**Checkpoints**:
- [ ] LLM API called
- [ ] Response received
- [ ] Vehicle make extracted correctly
- [ ] Vehicle model extracted correctly
- [ ] Damage description extracted
- [ ] Cost estimate extracted
- [ ] Accuracy >90%

**Status**: ☐ Pass ☐ Fail  
**Extraction Accuracy**: [ ]%  
**Notes**:

---

## Error Handling Tests

### TEST 10: Large PDF Upload (>10MB)
**Test Steps**:
1. Attempt to upload PDF >10MB
2. Verify error handling

**Expected**: Clear error message about file size limit

**Status**: ☐ Pass ☐ Fail  
**Error Message**: [ ]

---

### TEST 11: Corrupted PDF Upload
**Test Steps**:
1. Upload corrupted or password-protected PDF
2. Verify error handling

**Expected**: Clear error message explaining the issue

**Status**: ☐ Pass ☐ Fail  
**Error Message**: [ ]

---

### TEST 12: Invalid File Type Upload
**Test Steps**:
1. Attempt to upload .docx, .jpg, .txt file
2. Verify error handling

**Expected**: "Only PDF files are supported"

**Status**: ☐ Pass ☐ Fail  
**Error Message**: [ ]

---

### TEST 13: Network Timeout Simulation
**Test Steps**:
1. Open browser DevTools → Network tab
2. Throttle to "Slow 3G"
3. Upload PDF
4. Verify timeout handling

**Expected**: Either completes slowly or shows timeout error with retry option

**Status**: ☐ Pass ☐ Fail  
**Notes**:

---

### TEST 14: Session Expiry During Upload
**Test Steps**:
1. Start PDF upload
2. In another tab, log out
3. Return to upload tab

**Expected**: Graceful handling - either completes or shows "session expired" message

**Status**: ☐ Pass ☐ Fail  
**Notes**:

---

## User Experience Tests

### TEST 15: Loading States
**Test Steps**:
1. Monitor all loading indicators during upload
2. Verify no "stuck" loading states
3. Verify spinners/progress bars visible

**Checkpoints**:
- [ ] Upload button shows loading state
- [ ] Progress bar updates smoothly
- [ ] Stage text updates ("Extracting Data...", etc.)
- [ ] No infinite loading spinners
- [ ] Loading completes or shows error

**Status**: ☐ Pass ☐ Fail  
**Notes**:

---

### TEST 16: Empty States
**Test Steps**:
1. Navigate to Results page with no photos
2. Navigate to claim with no quotes
3. Verify empty state messages

**Expected**: Helpful messages like "No photos extracted" or "No quotes received yet"

**Status**: ☐ Pass ☐ Fail  
**Notes**:

---

### TEST 17: Error Messages Quality
**Test Steps**:
1. Trigger various errors (invalid file, timeout, etc.)
2. Evaluate error message quality

**Criteria**:
- [ ] Error messages are clear and specific
- [ ] Error messages suggest next steps
- [ ] Error messages are user-friendly (not technical jargon)
- [ ] Error messages are visible (not hidden in console)

**Status**: ☐ Pass ☐ Fail  
**Notes**:

---

### TEST 18: Mobile Responsiveness
**Test Steps**:
1. Open KINGA on mobile device or resize browser to 375px width
2. Test upload workflow
3. Test report viewing

**Checkpoints**:
- [ ] Upload page usable on mobile
- [ ] File picker works
- [ ] Results page readable
- [ ] Charts render correctly
- [ ] Photos zoomable
- [ ] Navigation accessible

**Status**: ☐ Pass ☐ Fail  
**Issues**:

---

### TEST 19: Browser Compatibility
**Test Browsers**:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

**Test**: Upload PDF and view results in each browser

**Status**: 
- Chrome: ☐ Pass ☐ Fail
- Firefox: ☐ Pass ☐ Fail
- Safari: ☐ Pass ☐ Fail
- Edge: ☐ Pass ☐ Fail

**Issues**:

---

### TEST 20: Performance - Multiple Uploads
**Test Steps**:
1. Upload 5 assessments in sequence
2. Monitor memory usage
3. Check for memory leaks

**Checkpoints**:
- [ ] Each upload completes successfully
- [ ] No slowdown on subsequent uploads
- [ ] Memory usage doesn't continuously increase
- [ ] No browser crashes

**Status**: ☐ Pass ☐ Fail  
**Notes**:

---

## Real-World Scenario Tests

### SCENARIO 1: Insurer Daily Workflow
**Steps**:
1. Log in as Insurer
2. Upload 3 external assessments
3. Review all 3 results
4. Create claims from 2 of them
5. Assign assessors to claims
6. Log out

**Time Taken**: [ ] minutes  
**Issues Encountered**:  
**Status**: ☐ Pass ☐ Fail

---

### SCENARIO 2: Assessor Review Workflow
**Steps**:
1. Log in as Assessor
2. View assigned claims
3. Review AI assessment
4. Submit own evaluation
5. Compare AI vs own assessment

**Issues Encountered**:  
**Status**: ☐ Pass ☐ Fail

---

### SCENARIO 3: Panel Beater Quote Workflow
**Steps**:
1. Log in as Panel Beater
2. View assigned claim
3. Review damage assessment
4. Submit detailed quote
5. Verify quote appears in system

**Issues Encountered**:  
**Status**: ☐ Pass ☐ Fail

---

### SCENARIO 4: End-to-End Claim Lifecycle
**Steps**:
1. Insurer uploads assessment
2. Insurer creates claim with 3 panel beaters
3. Panel beaters submit quotes
4. Insurer compares quotes
5. Insurer selects winning quote
6. Assessor evaluates
7. Claim approved/rejected

**Time Taken**: [ ] minutes  
**Issues Encountered**:  
**Status**: ☐ Pass ☐ Fail

---

## Console & Network Monitoring

### During All Tests, Monitor:

**Browser Console (F12 → Console)**:
- [ ] No errors (red messages)
- [ ] No warnings about missing resources
- [ ] No React/TypeScript errors

**Network Tab (F12 → Network)**:
- [ ] No 404 errors (missing files)
- [ ] No 500 errors (server crashes)
- [ ] No failed requests
- [ ] API responses are JSON (not HTML error pages)
- [ ] Image URLs return 200 status

**Server Logs**:
```bash
# Monitor server logs during tests
tail -f /tmp/webdev-server-*.log
```

- [ ] No Python errors
- [ ] No tRPC errors
- [ ] No database errors
- [ ] No S3 upload errors

---

## Critical Issues Checklist

Based on past problems, verify these are fixed:

- [x] PDF upload timeout at 90% → **Fixed with 5-minute timeout**
- [x] "Service Unavailable" error → **Fixed with error handling**
- [x] Claim creation validation error → **Fixed (allows 0-3 panel beaters)**
- [ ] Missing damage photos in report → **Test with real PDF**
- [ ] Visualizations not rendering → **Test all charts**
- [ ] "undefined" values in report → **Test data extraction**
- [ ] Physics validation not running → **Test Python integration**
- [ ] Fraud detection not running → **Test Python integration**
- [ ] AI commentary missing → **Test LLM integration**

---

## Test Summary

**Date**: [ ]  
**Tester**: [ ]  
**Environment**: [ ] Development [ ] Production

**Critical Tests Passed**: [ ] / 5  
**Important Tests Passed**: [ ] / 2  
**Integration Tests Passed**: [ ] / 4  
**Error Handling Tests Passed**: [ ] / 5  
**UX Tests Passed**: [ ] / 5  
**Scenario Tests Passed**: [ ] / 4

**Total Pass Rate**: [ ]%

**Critical Issues Found**: [ ]  
**Major Issues Found**: [ ]  
**Minor Issues Found**: [ ]

**System Ready for Production**: ☐ Yes ☐ No ☐ With Fixes

---

## Issues Log

| # | Severity | Component | Issue Description | Steps to Reproduce | Status |
|---|----------|-----------|-------------------|-------------------|--------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

## Recommendations

### High Priority Fixes
1. [ ]
2. [ ]
3. [ ]

### Medium Priority Improvements
1. [ ]
2. [ ]
3. [ ]

### Low Priority Enhancements
1. [ ]
2. [ ]
3. [ ]

---

**Tester Signature**: ___________________  
**Date**: ___________________
