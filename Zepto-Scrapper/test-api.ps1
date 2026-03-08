# Test script for Zepto Scraper API
# Make sure the server is running first: npm run server

Write-Host "`n🧪 Testing Zepto Scraper API`n" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "Test 1: Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:4000/health" -Method Get
    Write-Host "✅ Health check passed:" -ForegroundColor Green
    $health | ConvertTo-Json
} catch {
    Write-Host "❌ Health check failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n---`n"

# Test 2: Scrape Categories
Write-Host "Test 2: Scraping 3 categories..." -ForegroundColor Yellow

$body = @{
    pincode = "411001"
    categories = @(
        @{
            name = "Fruit & Vegetables - All"
            url = "https://www.zepto.com/cn/fruits-vegetables/all/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/e78a8422-5f20-4e4b-9a9f-22a0e53962e3"
        },
        @{
            name = "Fruit & Vegetables - Fresh Vegetables"
            url = "https://www.zepto.com/cn/fruits-vegetables/fresh-vegetables/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/b4827798-fcb6-4520-ba5b-0f2bd9bd7208"
        },
        @{
            name = "Fruit & Vegetables - Fresh Fruits"
            url = "https://www.zepto.com/cn/fruits-vegetables/fresh-fruits/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/09e63c15-e5f7-4712-9ff8-513250b79942"
        }
    )
    scrollCount = 3
    maxProductsPerSearch = 30
    maxConcurrentTabs = 8
    headless = $true
    navigationTimeout = 60000
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/zeptocategoryscrapper" `
        -Method Post `
        -Body $body `
        -ContentType "application/json"
    
    Write-Host "✅ Scraping completed successfully!" -ForegroundColor Green
    Write-Host "`nResults:" -ForegroundColor Cyan
    Write-Host "  Total Products: $($response.data.totalProducts)"
    Write-Host "  Total Categories: $($response.data.totalCategories)"
    Write-Host "  Duration: $($response.data.durationSeconds)s"
    Write-Host "  Pincode: $($response.data.pincode)"
    Write-Host "`nFirst product:" -ForegroundColor Cyan
    $response.data.products[0] | ConvertTo-Json
    
} catch {
    Write-Host "❌ Scraping failed: $_" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode
    exit 1
}

Write-Host "`n✅ All tests passed!`n" -ForegroundColor Green
