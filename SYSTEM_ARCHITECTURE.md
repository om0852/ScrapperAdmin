# 🔄 Auto-Retry System Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER STARTS INGESTION                                              │
│  node batch-ingest-with-retry.js ./scraped_data                     │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  PHASE 1: INITIAL INGESTION    │
        └────────┬───────────────────────┘
                 │
     ┌───────────┴───────────┐
     │                       │
     ▼                       ▼
┌─────────────┐      ┌──────────────────┐
│  FILE OK?   │      │ FILE FAILED?     │
└──────┬──────┘      └────────┬─────────┘
       │                      │
    ✅ YES                   ❌ NO
       │                      │
       ▼                      ▼
   INSERT            LOG TO FAILED.JSON
   PRODUCT          (With metadata:
   DATA             - Pincode
                    - Platform
                    - Category
                    - Error reason
                    - File size)
       │                      │
       └───────────┬──────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ ALL FILES PROCESSED? │
        └──────────┬───────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │ PHASE 2: AUTO-RETRY              │
    │ (Only if files failed)           │
    └────────┬─────────────────────────┘
             │
      ┌──────┴──────┐
      │ FAILED=0?   │
      └──┬────────┬─┘
         │        │
       ✅ YES    ❌ NO
         │        │
         │        ▼
         │   RETRY ATTEMPT 1/N
         │   (Wait retryDelay ms)
         │        │
         │    ┌───┴────┐
         │    │ OK?    │
         │    └──┬──┬──┘
         │      ✅│ ❌│
         │   YES │ │ NO
         │       │ │
         │   ✅  │ ▼
         │   SUCCESS  LOG RETRY
         │       │    (Update count)
         │       │    │
         │       │    ▼
         │       │  Attempt 2/N?
         │       │    │
         │       ├─YES→ (Loop back)
         │       │
         │       └─NO→ STILL FAILED
         │
         └───────────────────┐
                             ▼
                 ┌────────────────────────┐
                 │ PHASE 3: FINAL REPORT  │
                 └────────┬───────────────┘
                          │
                    ┌─────┴─────┐
                    │           │
                    ▼           ▼
              PRINT           SAVE
              SUMMARY         REPORT.JSON
              (Console)       (File)
                    │           │
                    └─────┬─────┘
                          ▼
                  ┌───────────────────┐
                  │ SUCCESS ≥ TARGET? │
                  └───┬────────────┬──┘
                      │            │
                    EXIT 0      EXIT 1
```

---

## File Processing States

```
                    ┌─────────────────────────────────┐
                    │ NEW FILE (From Directory)       │
                    └────────────┬────────────────────┘
                                 │
                        ┌────────▼────────┐
                        │ INITIAL ATTEMPT │
                        ├─────┬──────────┬┤
        ┌───────────────┤  ✅ │    ❌   │
        │               └─────┴──────────┘
        ▼                          │
    ┌────────────┐                ▼
    │ SUCCESSFUL │          ┌──────────────┐
    │  (Remove   │          │  FAILED      │
    │   from     │          │  (Log in     │
    │   retry    │          │   session)   │
    │   queue)   │          └──────┬───────┘
    └────────────┘                 │
                         ┌─────────▼──────────┐
                         │ AUTO-RETRY PHASE   │
                         ├──┬──┬──┬──┬──┬──┬──┤
                         │1 │2 │3 │4 │5 │6 │N │ (Attempts)
                         ├──┴─┬┴─┬─┴─┬┴─┬─┴┬─┘
                         │    │  │   │  │  │
                    ┌────┴─┐  │  │  │  │  └────┐
                    │      ▼  ▼  ▼  ▼  ▼       ▼
                    │   ✅ SUCCESS  or  ❌ FAILED FINAL
                    │
                    └─ Records final status
                       in report
```

---

## Data Flow

```
┌────────────────────────────────────────────────────────────┐
│                  DIRECTORY OF JSON FILES                   │
│              (scraped_data/20april/*.json)                 │
└──────────────────────────┬─────────────────────────────────┘
                           │
                    ┌──────▼────────┐
                    │ READ FILE 1   │
                    └──┬────────┬───┘
                       │        │
                   ✅ OK   ❌ FAILED
                       │        │
                       ▼        ▼
                   INSERT    ┌─────────────────────┐
                   PRODUCTS  │ LogFailedFile()     │
                             │                     │
                             │ Create/Update:     │
                             │ SESSION_failed.json │
                             │                     │
                             │ [                   │
                             │   {                 │
                             │     "fileName": ... │
                             │     "pincode": ...  │
                             │     "platform": ... │
                             │     "error": ...    │
                             │     "retryCount": 0 │
                             │   }                 │
                             │ ]                   │
                             └────────┬────────────┘
                                      │
                           ┌──────────▼──────────┐
                           │ READ FILE 2         │
                           │ (Same process...)   │
                           └─────────────────────┘
```

---

## Session Management

```
┌────────────────────────────────────────┐
│  CREATE SESSION ID (Per Ingestion)     │
│  ingest_2026-04-11T10-30-45_abc123    │
└──┬─────────────────────────────────────┘
   │
   ├─► ingest_2026-04-11T10-30-45_abc123_failed.json
   │   └─ List of all failed files
   │
   ├─► ingest_2026-04-11T10-30-45_abc123_retry_report.json
   │   └─ Final report with stats
   │
   └─► Store in: failed_ingestion_logs/
       └─ Accessible anytime for retry
```

---

## Retry Strategy Decision Tree

```
                     ┌─────────────────┐
                     │ RETRY FAILED    │
                     │ FILES?          │
                     └────────┬────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Load from         │
                    │ SESSION_failed.json
                    │ Count: N files    │
                    └────────┬──────────┘
                             │
                    ┌────────▼────────┐
                    │ N == 0?         │
                    └──┬────────────┬─┘
                       │            │
                    ✅ YES      ❌ NO
                       │            │
                       │            ▼
                       │     ┌──────────────────────┐
                       │     │ RETRY ATTEMPT 1      │
                       │     │ For each file:       │
                       │     │ - ingestJsonFile()   │
                       │     │ - Track success      │
                       │     │ - Remove if success  │
                       │     └──┬─────────────────┬─┘
                       │        │                 │
                       │   ✅ ALL OK        SOME FAILED
                       │        │                 │
                       │        │                 ▼
                       │        │         ┌────────────────┐
                       │        │         │ Wait: delay ms │
                       │        │         └────────┬───────┘
                       │        │                  │
                       │        │         ┌────────▼──────────────┐
                       │        │         │ RETRY COUNT < MAX?    │
                       │        │         └────┬────────────┬─────┘
                       │        │              │            │
                       │        │          YES │      NO    │
                       │        │              │            │
                       │        │              ▼            ▼
                       │        │         (Loop back) ❌ FINAL FAIL
                       │        │                         │
                       ▼        ▼                         ▼
                    ┌─────────────────────────────────────────┐
                    │ GENERATE FINAL REPORT                   │
                    │ - Success count                         │
                    │ - Final fail count                      │
                    │ - Success rate %                        │
                    │ - List failed files                     │
                    │ - Save to JSON                          │
                    └─────────────────────────────────────────┘
```

---

## Error Handling Flow

```
┌──────────────────────────┐
│ Exception during ingest? │
└──┬───────────────────────┘
   │
   ▼
┌─────────────────────────────────┐
│ CATCH ERROR & EXTRACT MESSAGE   │
│ - Network timeout               │
│ - Invalid JSON                  │
│ - File not found                │
│ - Permission denied             │
│ - etc...                        │
└──┬──────────────────────────────┘
   │
   ▼
┌────────────────────────────────────────────┐
│ LOG FAILED FILE WITH ERROR DETAILS         │
│ - ErrorMessage extracted                   │
│ - Retry count = 0                          │
│ - Status = pending_retry                   │
└──┬─────────────────────────────────────────┘
   │
   ▼
┌───────────────────────────────────────┐
│ Continue with next file               │
│ (Don't stop batch)                    │
└───────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────┐
│ After all files: AUTO-RETRY failed files    │
│ (Another chance to succeed)                 │
└─────────────────────────────────────────────┘
```

---

## Success Rate Calculation

```
     Total Attempted Files = A
     Initial Successes = B
     Initial Failures = C (A - B)
     
     Retry Successes = D
     Final Failures = E (C - D)
     
     ╔═══════════════════════════════════╗
     ║ TOTAL SUCCESS = B + D             ║
     ║ TOTAL FAILURES = E                ║
     ║ SUCCESS RATE = ((B + D) / A) × 100║
     ╚═══════════════════════════════════╝

Example:
  A = 10 files
  B = 8 successes (initial)
  C = 2 failures (initial)
  D = 1 success (retry)
  E = 1 failure (final)
  
  TOTAL SUCCESS = 8 + 1 = 9
  SUCCESS RATE = 9/10 × 100 = 90%
```

---

## Key Components & Interactions

```
┌──────────────────────────────┐
│ batch-ingest-with-retry.js   │ ◄─ Entry point
└────────────┬─────────────────┘
             │
             ├──► manualIngest.js
             │    └─ ingestJsonFile()
             │       ingestDirectory()
             │
             ├──► failedIngestionTracker.js
             │    ├─ createSessionId()
             │    ├─ logFailedFile()
             │    ├─ getFailedFiles()
             │    ├─ updateRetryCount()
             │    ├─ createRetryReport()
             │    └─ printFormatted()
             │
             ├──► dataControllerOptimized.js
             │    └─ Process & insert products
             │
             └──► failed_ingestion_logs/
                  └─ Store session data
```

---

## State Transitions

```
FILE STATE MACHINE:

[PENDING] ──┬──► [SUCCESS] ──► [REMOVED FROM RETRY QUEUE]
            │
            └──► [FAILED] ──┬──► [RETRY 1] ──┬──► [SUCCESS]
                            │                │
                            ├──► [RETRY 2] ──┤
                            │                │
                            ├──► [RETRY 3] ──┤
                            │                │
                            └──► [FINAL FAIL] ──► [REPORT]
                                              └─► [SAVED FOR LATER]
```

---

This visual guide helps understand how files flow through the auto-retry system!
