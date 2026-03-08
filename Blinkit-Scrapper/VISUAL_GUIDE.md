# Visual Guide: End Detection & Invalid URL Handling

## Flow Diagram

```
START SCRAPE REQUEST
        ↓
  ┌─────────────────────────┐
  │ FAST ERROR CHECK        │
  │ (1-2 seconds)           │
  ├─────────────────────────┤
  │ Load page               │
  │ Check for error msgs    │
  │ (sorry, not available...) │
  └─────────────────────────┘
        ↓
   ┌────┴────┐
   │          │
   ▼          ▼
ERROR      NO ERROR
  ↓          ↓
┌──────┐   ┌──────────────────┐
│SKIP  │   │START SCRAPING    │
│      │   │(30-60 seconds)   │
│MARK  │   ├──────────────────┤
│INVALID   │Set up API        │
│          │interception      │
│          │                  │
└──────┘   │Click first       │
  ↓        │product           │
  ↓        │                  │
  ↓        │Auto-scroll loop  │
  ↓        │with smart end    │
  ↓        │detection         │
  ↓        │                  │
  ↓        │Process API data  │
  ↓        └──────────────────┘
  ↓              ↓
STORE        RETURN
IN JSON      PRODUCTS
  ↓              ↓
  └──────┬───────┘
         ↓
    SEND RESPONSE
         ↓
   END SCRAPE
```

---

## Decision Tree

```
Does page show error message?
    │
    ├─ YES → Add to invalid_urls.json → Skip scraping → Return 0 products
    │        (Takes 1-2 seconds)
    │
    └─ NO → Continue with scraping
             │
             ├─ API interception set up
             ├─ Click first product
             ├─ Start scrolling
             │
             ├─ Scroll loop:
             │   ├─ Scroll down
             │   ├─ Wait for API response
             │   ├─ Count products
             │   │
             │   ├─ Are we at bottom?
             │   │   ├─ YES → Stop (Early exit)
             │   │   └─ NO → Continue
             │   │
             │   └─ Any new products?
             │       ├─ YES → Reset counter, keep scrolling
             │       └─ NO → Increment no-change counter
             │
             ├─ Reached end? (no new products × 3-5 times)
             │   └─ YES → Exit scroll loop
             │
             ├─ Process all captured API responses
             ├─ Deduplicate products
             │
             └─ Return results
```

---

## Performance Comparison

### Without Error Detection
```
Category 1 (valid):       30s ████████████████████
Category 2 (valid):       30s ████████████████████
Category 3 (ERROR):       30s ████████████████████ (wasted!)
Category 4 (valid):       30s ████████████████████
─────────────────────────────────
Total: 120 seconds
```

### With Error Detection
```
Category 1 (valid):       30s ████████████████████
Category 2 (valid):       30s ████████████████████
Category 3 (ERROR):        1s ▌ (detected & skipped!)
Category 4 (valid):       30s ████████████████████
─────────────────────────────────
Total: 91 seconds
Saved: 29 seconds (24% faster!)
```

---

## Error Detection Timeline

```
TIME    ACTION                          STATUS
────────────────────────────────────────────────
0ms     Start page load                 ⏳ Loading
200ms   Page DOM loaded                 ✓ Ready
500ms   Start reading page text         🔍 Checking
800ms   Error pattern detected          ❌ FOUND!
1000ms  Add to invalid_urls.json        📝 Stored
1500ms  Return (0 products)             ⏹ Skip

Total: 1.5 seconds (vs 30-60s if tried to scrape)
```

---

## Scroll Detection Logic

```
SCROLL LOOP ITERATION
├─ Scroll page to bottom
├─ Wait 800ms for API response
├─ Count new products loaded
│
├─ MORE PRODUCTS LOADED?
│   │
│   ├─ YES: 
│   │   └─ Reset "no change" counter
│   │   └─ Continue scrolling
│   │
│   └─ NO:
│       ├─ Increment "no change" counter
│       │
│       ├─ ARE WE AT PAGE BOTTOM?
│       │   │
│       │   ├─ YES (scrollHeight - scrollTop < 50px):
│       │   │   └─ STOP SCROLLING ← Early exit!
│       │   │
│       │   └─ NO:
│       │       └─ Continue scrolling
│       │
│       └─ NO CHANGE COUNTER = 3-5?
│           │
│           ├─ YES: STOP SCROLLING
│           └─ NO: Continue scrolling
```

---

## File Structure

```
invalid_urls.json
│
├─ URL
│  └─ https://blinkit.com/cn/baby-care/cid/891/32
│
├─ Category
│  └─ Baby Care
│
├─ Error Type
│  ├─ sorry_message (Blinkit's error page)
│  └─ error_message (Generic error)
│
├─ Timestamp
│  └─ 2026-01-25T10:30:45.123Z (ISO 8601)
│
└─ Date Added
   └─ 1/25/2026, 10:30:45 AM (Readable)
```

---

## Error Pattern Matching

```
Page Text Detection:
    ↓
┌─────────────────────────────────┐
│ Check against patterns:         │
├─────────────────────────────────┤
│ • "sorry"                       │
│ • "not available"               │
│ • "unavailable"                 │
│ • "out of service"              │
│ • "coming soon"                 │
│ • "not in your area"            │
│ • "service not available"       │
│ • "no products"                 │
│ • "something went wrong"        │
│ • "service under maintenance"   │
└─────────────────────────────────┘
    ↓
Match found?
    │
    ├─ YES → Error detected ❌
    │
    └─ NO → Continue scraping ✓
```

---

## Time Breakdown

### Typical Scraping (No Errors)
```
Location setup:         5s  (one time)
Per category:
├─ API setup:          0.5s
├─ Navigate to page:   3s
├─ Wait for load:      2s
├─ Click first item:   1s
├─ Scroll + wait:      15s
├─ Process data:       3s
└─ API save:           1s
────────────────────────
Total per category:     25-35s
```

### With Error Detection
```
Location setup:         5s  (one time)
Per valid category:     25-35s (same as above)

Per invalid category:   1-2s (new, much faster!)
├─ Navigate:           0.5s
├─ Read page text:     0.5s
├─ Check patterns:     0.2s
└─ Store URL:          0.3s
```

---

## Output Examples

### Valid Category
```
[10:30:45] [pasta] 🚀 Starting scrape... (Attempt 1/2)
[10:30:47] [pasta] ℹ️ Loading products...
[10:30:52] [pasta] 🐛 Loaded 50 products
[10:31:02] [pasta] 🐛 Loaded 150 products
[10:31:12] [pasta] 🐛 Loaded 245 products
[10:31:17] [pasta] ℹ️ Reached bottom of page
[10:31:17] [pasta] ℹ️ Loaded 245 products (5 scrolls)
[10:31:18] [pasta] ✅ Extracted 245 products
```

### Invalid Category (Error Detected)
```
[10:35:20] [baby-care] 🚀 Starting scrape... (Attempt 1/2)
[10:35:22] [baby-care] ⚠️ "Sorry" message found - storing as invalid
[10:35:22] [Invalid] ℹ️ Added to invalid list: Baby Care
[10:35:22] [baby-care] ❌ Failed to extract products
```

---

## Storage Structure

### Before
```
invalid_urls.json
│
└─ File doesn't exist
   (URLs with errors not tracked)
```

### After
```
invalid_urls.json
│
├─ Entry 1
│  ├─ url: "https://..."
│  ├─ category: "Baby Care"
│  ├─ errorType: "sorry_message"
│  ├─ timestamp: "2026-01-25T10:30:45.123Z"
│  └─ dateAdded: "1/25/2026, 10:30:45 AM"
│
├─ Entry 2
│  ├─ url: "https://..."
│  ├─ category: "Pet Supplies"
│  ├─ errorType: "sorry_message"
│  ├─ timestamp: "2026-01-25T10:35:12.456Z"
│  └─ dateAdded: "1/25/2026, 10:35:12 AM"
│
└─ Entry 3+
   └─ ... more entries
```

---

## Configuration Tuning

### Bottom Detection Threshold
```javascript
// Current: 50 pixels
const atBottom = (scrollHeight - scrollTop - clientHeight) < 50;
                                                           ↑
// Lower value = More sensitive (stops sooner)
// Higher value = Less sensitive (scrolls more)

// Example: 100px (less sensitive)
const atBottom = (scrollHeight - scrollTop - clientHeight) < 100;

// Example: 20px (more sensitive, needs more accuracy)
const atBottom = (scrollHeight - scrollTop - clientHeight) < 20;
```

### Error Patterns
```javascript
const sorryPatterns = [
    'sorry',                      // Default patterns
    'not available',
    'unavailable',
    'out of service',
    'coming soon',
    'not in your area',
    'service not available',
    'no products',
    'something went wrong',
    'service under maintenance',
    'your custom pattern here'     // Add custom
];
```

---

## Status Indicators

```
✅ Success - Products extracted
⚠️  Warning - Error message detected
❌ Failed - No products after retries
ℹ️  Info - Status messages
🚀 Start - Beginning operation
🐛 Debug - Detailed logging
📝 Saved - Data stored to file
🔍 Check - Verifying something
💾 Cache - Memory management
⏳ Loading - Waiting for response
⏹ Stopped - Operation ended
```

---

## Common Scenarios

### Scenario 1: 100 Categories, 0 Errors
```
All valid, zero problems
Time: 100 × 30s = 3000s (50 min)
Files: failed_urls.json (empty)
       invalid_urls.json (not created)
```

### Scenario 2: 100 Categories, 5 Errors
```
5 with errors, 95 valid
Time: (5 × 1s) + (95 × 30s) = 2855s (47.6 min)
Saved: 145s (2.4 min)
Files: failed_urls.json (if any timeout)
       invalid_urls.json (5 entries)
```

### Scenario 3: 100 Categories, 15 Errors
```
15 with errors, 85 valid
Time: (15 × 1s) + (85 × 30s) = 2565s (42.8 min)
Saved: 435s (7.2 min)
Files: invalid_urls.json (15 entries)
       failed_urls.json (timeouts)
```

---

## Quick Commands Visualization

### Check for Errors
```bash
cat invalid_urls.json | jq
        │
        └─ Shows all invalid URLs with details
```

### Count Errors
```bash
cat invalid_urls.json | jq 'length'
        │
        └─ Shows: 3, 5, 12, etc.
```

### Find Specific Type
```bash
cat invalid_urls.json | jq '.[] | select(.errorType == "sorry_message")'
        │
        └─ Shows only those with "sorry" messages
```

### Export URLs
```bash
cat invalid_urls.json | jq -r '.[].url'
        │
        └─ Shows just the URLs, one per line
```

---

**Visual Guide Complete** ✅  
Better understanding of the flow and logic
