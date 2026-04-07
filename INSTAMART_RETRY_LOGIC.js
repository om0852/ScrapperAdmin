/**
 * Instamart API Retry Logic Explanation
 * ════════════════════════════════════════════════════════════════════
 * 
 * ISSUE: API was hitting ERR_NON_2XX_3XX_RESPONSE errors and giving up after 20 retries
 * SOLUTION: Keep retrying indefinitely until a valid response is received
 * 
 * ════════════════════════════════════════════════════════════════════
 * 
 * NEW RETRY FLOW:
 * 
 * 1. postFilterWithInternalRetries() is called
 *    └─ Retry indefinitely (RETRY_LIMIT = 999999)
 * 
 * 2. For each attempt:
 *    
 *    a) postFilterRequest() makes the API call
 *       └─ 3 retries for transient network errors
 *       └─ Returns: { ok, status, data, error }
 *    
 *    b) Check if response is valid (ok=true, data exists)
 *       │
 *       ├─ YES: Check if API returned ERR_NON_2XX_3XX_RESPONSE error
 *       │  │
 *       │  ├─ YES (Error): Calculate backoff, wait, then RETRY (don't give up)
 *       │  │               ✅ This is the new logic - keep trying
 *       │  │
 *       │  └─ NO (Valid): Return response immediately ✅
 *       │
 *       └─ NO: Check if error is retriable (network error)
 *          │
 *          ├─ YES: Calculate backoff, wait, then RETRY
 *          │
 *          └─ NO: Give up and return error
 * 
 * ════════════════════════════════════════════════════════════════════
 * 
 * KEY CHANGES:
 * 
 * BEFORE (Old Logic - 20 retries max):
 * ┌─────────────────────────────────────────┐
 * │ API Error (ERR_NON_2XX_3XX_RESPONSE):   │
 * │ ❌ Give up after 20 attempts            │
 * │ ❌ Return error response to caller      │
 * │ ❌ Pagination breaks on error           │
 * └─────────────────────────────────────────┘
 * 
 * AFTER (New Logic - Infinite retries):
 * ┌──────────────────────────────────────────────┐
 * │ API Error (ERR_NON_2XX_3XX_RESPONSE):       │
 * │ ✅ Keep retrying indefinitely               │
 * │ ✅ Exponential backoff (0.8s → 8s max)     │
 * │ ✅ Never return error to caller             │
 * │ ✅ Pagination continues when API recovers   │
 * └──────────────────────────────────────────────┘
 * 
 * ════════════════════════════════════════════════════════════════════
 * 
 * BACKOFF STRATEGY:
 * 
 * Attempt 1-5:     Print warning + backoff
 * Attempt 6-10:    Silent backoff (no warning)
 * Attempt 11+:     Every 10 attempts print warning
 * 
 * Backoff time: min(800ms + (attempt * 100ms), 8000ms)
 * Example:
 *  - Attempt 1:  800ms + 100ms   = 900ms
 *  - Attempt 5:  800ms + 500ms   = 1300ms
 *  - Attempt 10: 800ms + 1000ms  = 1800ms
 *  - Attempt 50: 800ms + 5000ms → capped at 8000ms
 *  - Attempt 100+: 8000ms (max)
 * 
 * ════════════════════════════════════════════════════════════════════
 * 
 * EXPECTED BEHAVIOR:
 * 
 * Scenario 1: Transient API errors (recovers quickly)
 * ──────────────────────────────────────────────────
 * Attempt 1: ERR_NON_2XX_3XX_RESPONSE → Wait 900ms
 * Attempt 2: ERR_NON_2XX_3XX_RESPONSE → Wait 1000ms
 * Attempt 3: ✅ Valid response → Continue pagination
 * Result: ✅ Pagination succeeds after 3 attempts
 * 
 * Scenario 2: Sustained API errors (takes longer to recover)
 * ───────────────────────────────────────────────────────────
 * Attempts 1-15: All ERR_NON_2XX_3XX_RESPONSE → Wait with increasing backoff
 * Attempt 16: ✅ Valid response → Continue pagination
 * Result: ✅ Pagination succeeds after 16 attempts (takes ~2-3 minutes)
 * 
 * Scenario 3: API returns valid response with 0 products
 * ─────────────────────────────────────────────────────
 * Request page 2: No error, just 0 products
 * Response: ✅ Valid response (no error)
 * Products added: 0
 * Next cursor: null (no more pages)
 * Result: ✅ Pagination stops gracefully
 * 
 * ════════════════════════════════════════════════════════════════════
 * 
 * EXAMPLE LOG OUTPUT:
 * 
 * [Direct API] pagination pageNo=2 offset=2 (attempt 1)
 * [Direct API] ⚠️  pagination pageNo=2 offset=2 ERR_NON_2XX_3XX_RESPONSE (attempt 1) - waiting 900ms...
 * [Direct API] ⚠️  pagination pageNo=2 offset=2 ERR_NON_2XX_3XX_RESPONSE (attempt 2) - waiting 1000ms...
 * [Direct API] ⚠️  pagination pageNo=2 offset=2 ERR_NON_2XX_3XX_RESPONSE (attempt 3) - waiting 1100ms...
 * [Direct API] ✅ pagination pageNo=2 offset=2 recovered after 3 attempts
 * [Direct API] page 2: +245 products (total 532)
 * 
 * ════════════════════════════════════════════════════════════════════
 * 
 * BENEFITS:
 * 
 * ✅ No more manual retry from user
 * ✅ Handles temporary API issues automatically
 * ✅ Exponential backoff prevents overwhelming the API
 * ✅ Full category data is scraped once API recovers
 * ✅ No data loss from failed pages
 * 
 * ════════════════════════════════════════════════════════════════════
 */

export const instamartRetryLogicExplanation = {
  description: "Automatic infinite retry with exponential backoff for API errors",
  version: "2.0",
  status: "✅ IMPLEMENTED"
};
