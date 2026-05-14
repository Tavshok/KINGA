# Memory Diagnosis — Server Stability

## Root Cause: OOM Kills

The Linux OOM killer is killing the Node.js server process when memory exceeds available RAM.

### Evidence from dmesg:
- 09:19:35 — Chromium OOM killed (Puppeteer PDF generation)
- 09:19:36 — Node.js server OOM killed (47GB virtual, 898MB RSS)
- 09:40:29 — Node.js OOM killed again (2.6GB virtual, 1.7GB RSS)
- 09:49:54 — Node.js OOM killed again (59GB virtual, 1.4GB RSS)

### Current State:
- Server RSS: 2,110 MB (53.5% of 3.8GB total RAM)
- Available memory: ~988 MB
- No `--max-old-space-size` set
- No `process.on('uncaughtException')` handler
- No garbage collection hints between pipeline stages
- PDF image extraction holds all page buffers in memory simultaneously

### Memory Hotspots:
1. **PDF Image Extraction** — renders ALL pages to PNG buffers in memory before processing
2. **Pipeline stages** — 11 stages accumulate results without releasing intermediate data
3. **Puppeteer PDF generation** — spawns Chromium which can use 500MB+
4. **Sharp image processing** — each image conversion creates new buffers

### Fix Strategy:
1. Set `--max-old-space-size=1536` on the Node.js process
2. Add `global.gc()` hints between pipeline stages (with `--expose-gc`)
3. Release page buffers after each page is processed (not all at once)
4. Add `process.on('uncaughtException')` to prevent silent crashes
5. Reduce concurrent image processing batch size from 5 to 2
6. Clear intermediate pipeline data after each stage completes
