# 🔄 Auto-Retry Failed Ingestion Guide

## Overview

This guide explains how to use the new **automatic retry system** for handling failed file insertions during manual batch ingestion. When network failures occur, files are automatically tracked and can be retried without manual intervention.

---

## Problem This Solves

❌ **Before:** When network goes offline during ingestion:
- Some files fail and never retry
- Users must manually find and re-insert failed files
- No tracking of what failed and why

✅ **After:** With new auto-retry system:
- Failed files are automatically tracked with session ID
- All failed files are auto-retried at the end
- Failed files after max retries can be retried later anytime
- Full reports show what failed and why

---

## 📚 Key Components

### 1. **Failure Tracker** (`utils/failedIngestionTracker.js`)
- Logs failed files with details
- Stores in `failed_ingestion_logs/` directory
- One log file per session
- Tracks retry attempts

### 2. **Batch Ingest with Auto-Retry** (`batch-ingest-with-retry.js`)
- Primary script for ingesting all files in a directory
- Tracks failures automatically
- Retries failed files at the end
- Generates retry reports

### 3. **Session Retry** (`batch-ingest-retry-session.js`)
- Retries specific failed session
- Useful for manual retry of persistent failures
- Can be run anytime after initial ingestion

### 4. **List Sessions** (`list-failed-sessions.js`)
- Shows all historical failed sessions
- Lists files in each session
- Helps identify which sessions need retry

---

## 🚀 Quick Start

### Step 1: Run Batch Ingestion with Auto-Retry

```powershell
# Ingest all files in a directory with automatic retry
node batch-ingest-with-retry.js ./scraped_data/Fruits_Vegetables

# Custom: More retries, longer delay between retries
node batch-ingest-with-retry.js ./scraped_data --max-retries=5 --retry-delay=10000
```

**What happens:**
1. ✅ Ingests all JSON files found
2. ✅ Logs any failures
3. 🔄 Automatically retries failed files (default: 3 times)
4. 📊 Generates report with results

### Step 2: If Some Files Still Fail

Files that fail after max retries are saved for later.

Check available sessions:
```powershell
node list-failed-sessions.js
```

### Step 3: Retry Specific Session Later

```powershell
# Retry a session (when network recovers, etc.)
node batch-ingest-retry-session.js ingest_2026-04-11T10-30-45_abc123

# With more retries
node batch-ingest-retry-session.js ingest_2026-04-11T10-30-45_abc123 --max-retries=5
```

---

## 📖 Command Reference

### Batch Ingest with Auto-Retry

```bash
node batch-ingest-with-retry.js <directory> [options]
```

**Parameters:**
- `<directory>` - Path to directory containing JSON files (required)
- `--max-retries=N` - Maximum retry attempts (default: 3, can be 1-10)
- `--retry-delay=MS` - Milliseconds to wait between retries (default: 5000)

**Examples:**
```powershell
# Default: 3 retries, 5 second delay
node batch-ingest-with-retry.js ./scraped_data

# Aggressive: 5 retries, 3 second delay
node batch-ingest-with-retry.js ./scraped_data --max-retries=5 --retry-delay=3000

# Conservative: 2 retries, 10 second delay
node batch-ingest-with-retry.js ./scraped_data/Fruits_Vegetables --max-retries=2 --retry-delay=10000

# Nested directories (recursive search)
node batch-ingest-with-retry.js ./scraped_data --max-retries=4
```

### List Failed Sessions

```bash
node list-failed-sessions.js [--details]
```

**Examples:**
```powershell
# Show all sessions
node list-failed-sessions.js

# Show sessions with failed file details
node list-failed-sessions.js --details
```

**Output Example:**
```
[1] 🎯 ingest_2026-04-11T10-30-45_abc123
    📅 Date: 4/11/2026, 10:30:45 AM
    📊 Failed Files: 2
    📄 Files:
       • Blinkit_400070_2026-03-27T06-52-29.json
         Platform: Blinkit, Pincode: 400070
         Error: Network timeout

       • Instamart_400070_2026-03-28T08-15-42.json
         Platform: Instamart, Pincode: 400070
         Error: Connection refused
```

### Retry Specific Session

```bash
node batch-ingest-retry-session.js <sessionId> [options]
```

**Parameters:**
- `<sessionId>` - Session ID from failed ingestion (required)
- `--max-retries=N` - Maximum retry attempts (default: 3)
- `--retry-delay=MS` - Milliseconds to wait between retries (default: 5000)

**Examples:**
```powershell
# Retry with defaults
node batch-ingest-retry-session.js ingest_2026-04-11T10-30-45_abc123

# Retry with aggressive settings
node batch-ingest-retry-session.js ingest_2026-04-11T10-30-45_abc123 --max-retries=5 --retry-delay=2000
```

---

## 📊 Understanding Output

### Initial Ingestion Phase
```
[1/10] (10%) 📂 Blinkit_400070_file.json
   🔄 Processing 52 product(s)...
   ✅ Success! Inserted: 52 products
      New: 45, Updated: 7
```

### Failed File Example
```
[2/10] (20%) 📂 Instamart_400070_file.json
   🔄 Processing 38 product(s)...
   ❌ Failed: Network timeout

[File logged to failed_ingestion_logs/]
```

### Auto-Retry Phase
```
🔄 AUTO-RETRY PHASE - Retrying 2 failed file(s)

🔄 RETRY ATTEMPT 1/3 - 2 file(s) remaining
─────────────────────────────────────────────
[1/2] (50%) 🔄 Instamart_400070_file.json
   📍 Pincode: 400070, 🏪 Platform: Instamart
   🚀 Retrying...
   ✅ Recovered! Inserted: 38 products
```

### Final Summary
```
📊 FINAL INGESTION SUMMARY

📈 Initial Ingestion Results:
   ✅ Successful: 8
   ❌ Failed: 2

🔄 Retry Results:
   ✅ Recovered: 1
   ❌ Still Failed: 1

🎯 Final Results:
   Total Files: 10
   ✅ Total Successful: 9
   ❌ Total Failed: 1
   📊 Success Rate: 90%
```

---

## 📁 File Structure

```
mainserver/
├── batch-ingest-with-retry.js          ← Main ingestion script
├── batch-ingest-retry-session.js       ← Retry specific session
├── list-failed-sessions.js             ← List all sessions
├── utils/
│   ├── failedIngestionTracker.js       ← Tracking utilities
│   ├── manualIngest.js                 ← Core ingestion logic
│   └── ...
└── failed_ingestion_logs/              ← Auto-created directory
    ├── ingest_2026-04-11T10-30-45_abc123_failed.json
    ├── ingest_2026-04-11T10-30-45_abc123_retry_report.json
    └── ...
```

---

## 🔍 Failed Logs Structure

### Failed Files Log (`*_failed.json`)
```json
[
  {
    "timestamp": "2026-04-11T10:30:45.123Z",
    "fileName": "Blinkit_400070_2026-03-27T06-52-29.json",
    "filePath": "d:\\path\\to\\file.json",
    "categoryFolder": "Fruits _ Vegetables",
    "pincode": "400070",
    "platform": "Blinkit",
    "error": "Network timeout after 30000ms",
    "fileSize": 51200,
    "retryCount": 0,
    "lastRetryTime": null
  }
]
```

### Retry Report (`*_retry_report.json`)
```json
{
  "sessionId": "ingest_2026-04-11T10-30-45_abc123",
  "generatedAt": "2026-04-11T10:45:30.123Z",
  "totalFailed": 2,
  "successfulRetries": 1,
  "failedRetries": 1,
  "retrySuccessRate": "50%",
  "failedFiles": [...],
  "successfulRetries": [...],
  "failedRetries": [...]
}
```

---

## 💡 Best Practices

### 1. **Use Appropriate Retry Settings**
- Network issues: `--max-retries=5 --retry-delay=10000`
- Data format issues: `--max-retries=2` (won't help more)
- Small batches: `--max-retries=3 --retry-delay=5000` (default)

### 2. **Monitor Logs**
```powershell
# Check failed sessions regularly
node list-failed-sessions.js --details

# Retry oldest sessions first
node batch-ingest-retry-session.js <oldest-session-id>
```

### 3. **Batch Processing**
```powershell
# Process one date at a time
node batch-ingest-with-retry.js ./scraped_data/20april
node batch-ingest-with-retry.js ./scraped_data/21april
```

### 4. **Failed Investigation**
```powershell
# Check failed files with details
node list-failed-sessions.js --details

# Look for patterns:
# - Network timeouts? → Increase --retry-delay
# - Data format errors? → Fix source data, then retry
# - Platform errors? → Check pincode/platform extraction
```

---

## 🆘 Troubleshooting

### Issue: Files still failing after retries
```powershell
# 1. Check the error message in report
node list-failed-sessions.js --details

# 2. Common causes:
#    - Invalid JSON format → Fix file before retry
#    - Network issues → Retry when network is stable
#    - Platform API down → Wait and retry later

# 3. Retry with more patience
node batch-ingest-retry-session.js <sessionId> --max-retries=10 --retry-delay=15000
```

### Issue: Session ID not found
```powershell
# 1. List all available sessions
node list-failed-sessions.js

# 2. Copy exact session ID from output
# 3. Use correct session ID in retry command
```

### Issue: Directory not found
```powershell
# Use absolute or correct relative path
node batch-ingest-with-retry.js d:\creatosaurus-intership\quick-commerce-scrappers\mainserver\scraped_data
```

---

## 📈 Success Metrics

**Good:**
- ✅ Success Rate > 95%
- ✅ Failed files < 5%
- ✅ Most files succeed on first try

**Needs Attention:**
- ⚠️ Success Rate 80-95%
- ⚠️ Network timeouts? Increase delay
- ⚠️ Format errors? Fix source data

**Critical:**
- ❌ Success Rate < 80%
- ❌ Repeating errors
- ❌ System instability

---

## 🔐 Security Notes

- Failed logs contain file paths and errors
- Keep `failed_ingestion_logs/` directory secure
- Don't share logs with sensitive path information
- Logs auto-clean when session succeeds

---

## 📞 Support

For issues or feature requests, refer to existing logs:

```powershell
# Most recent report
ls failed_ingestion_logs/ | sort -Descending -Property LastWriteTime | select -First 1

# Open report
cat "failed_ingestion_logs\<newer-session>_retry_report.json"
```

---

## 🎯 Next Steps

1. **Try it:** Run `node batch-ingest-with-retry.js ./scraped_data`
2. **Monitor:** Check reports in `failed_ingestion_logs/`
3. **Retry:** Use session ID if needed
4. **Optimize:** Adjust retry parameters based on results

---

**Happy ingesting! 🚀**
