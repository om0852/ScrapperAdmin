# ⚡ Quick Reference - Auto-Retry System

## 🚀 Main Command (Use This!)

```powershell
# DEFAULT - Ingest all files with automatic retry
node batch-ingest-with-retry.js ./scraped_data

# With custom retry settings
node batch-ingest-with-retry.js ./scraped_data --max-retries=5 --retry-delay=10000
```

---

## 📋 All Commands

| Command | What It Does | Use When |
|---------|-------------|----------|
| `node batch-ingest-with-retry.js <dir>` | Ingest files with auto-retry | First time ingesting |
| `node list-failed-sessions.js` | Show failed sessions | Want to check what failed |
| `node list-failed-sessions.js --details` | Show failed sessions with file details | Need details about failures |
| `node batch-ingest-retry-session.js <id>` | Retry specific session | Re-attempting failed files |

---

## 📁 Common Paths

```powershell
# Entire scraped data folder
node batch-ingest-with-retry.js ./scraped_data

# Specific category
node batch-ingest-with-retry.js ./scraped_data/Fruits_Vegetables

# Specific date
node batch-ingest-with-retry.js ./scraped_data/20april

# Multiple scrapers combined
node batch-ingest-with-retry.js ./scraped_data
```

---

## ⚙️ Common Settings

### Default (Good for most)
```powershell
node batch-ingest-with-retry.js ./scraped_data
# 3 retries, 5 second delay between attempts
```

### Network Issues
```powershell
node batch-ingest-with-retry.js ./scraped_data --max-retries=5 --retry-delay=10000
# 5 retries, 10 second delay - better for unstable networks
```

### Quick Process
```powershell
node batch-ingest-with-retry.js ./scraped_data --max-retries=2 --retry-delay=2000
# 2 retries, 2 second delay - faster but may miss some
```

---

## 📊 Output Indicators

| Symbol | Meaning |
|--------|---------|
| ✅ | Success - file inserted |
| ❌ | Failed - file will retry |
| 🔄 | Retrying - second attempt |
| ⏱️ | Waiting between retries |
| 📊 | Summary/Report |
| 🎯 | Session tracking |

---

## 🔍 Check Results

```powershell
# See what failed
node list-failed-sessions.js --details

# Look for patterns:
# Network timeout? → Increase delay
# Invalid JSON? → Fix file
# Platform error? → Check extraction
```

---

## 🔄 Recovery Steps

**If some files STILL fail after 3 retries:**

```powershell
# Step 1: Check what failed
node list-failed-sessions.js --details

# Step 2: Retry with more patience (copy sessionId from Step 1)
node batch-ingest-retry-session.js ingest_2026-04-11T10-30-45_abc123 --max-retries=5

# Step 3: Check report
# Look in failed_ingestion_logs/<sessionId>_retry_report.json
```

---

## 💾 Where Logs Go

```
failed_ingestion_logs/
├── ingest_2026-04-11T10-30-45_abc123_failed.json      ← Failed files
├── ingest_2026-04-11T10-30-45_abc123_retry_report.json ← Report
└── (older sessions...)
```

---

## ⏱️ Typical Times (Per File)

- **Successful:** 2-5 seconds
- **With 1 Retry:** 5-10 seconds  
- **With 3 Retries:** 15-20 seconds
- **Large file (1000+ products):** +5-10 seconds

---

## ✨ Tips

1. **Run overnight** - Set to high retry count, go to bed
   ```powershell
   node batch-ingest-with-retry.js ./scraped_data --max-retries=10 --retry-delay=15000
   ```

2. **Quick check** - Use `list-failed-sessions.js` first
   ```powershell
   node list-failed-sessions.js
   ```

3. **Specific category** - Better than whole directory
   ```powershell
   node batch-ingest-with-retry.js ./scraped_data/20april
   ```

4. **Check network** - Before running large batches
   ```powershell
   ping 8.8.8.8  # Test internet
   ```

---

## 🆘 If Stuck

```powershell
# Show recent failures
node list-failed-sessions.js --details

# Retry oldest session with max patience
node batch-ingest-retry-session.js <oldest-id> --max-retries=10

# Check if specific files have pattern
# (e.g., all Blinkit files failing = platform issue)
```

---

**Save this file for quick reference! 📌**
