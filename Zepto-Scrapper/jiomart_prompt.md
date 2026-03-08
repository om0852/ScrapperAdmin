# Prompt: Build a Robust Jiomart Scraper API Server

I need you to create a robust **Express.js API server** (`server.js`) that hosts a **Playwright-based scraper** for **Jiomart**, mirroring the functionality of my existing Zepto scraper.

## Core Requirements

1.  **Tech Stack**: Node.js, Express, Playwright (Chromium).
2.  **API Endpoint**:
    -   `POST /jiomartcategoryscrapper`
    -   **Input Body**:
        ```json
        {
          "pincode": "400001",
          "categories": [
            { "name": "Fruits", "url": "https://www.jiomart.com/..." }
          ],
          "maxConcurrentTabs": 5,
          "proxyUrl": "http://user:pass@host:port" (optional)
        }
        ```
    -   **Output**: JSON object with `success`, `data` (array of products), and `metadata`.

3.  **Key Features**:
    -   **Pincode Logic**:
        -   Navigate to `jiomart.com`.
        -   Detect the "Delivery to" or location button in the header.
        -   Open modal, type the `pincode`, and click "Apply".
        -   **Crucial**: Handle cases where the location is already set or the modal doesn't appear (retry logic).
    -   **Concurrency**:
        -   Process the list of `categories` in batches (e.g., 5 at a time) to avoid memory overload.
        -   Use `browser.newContext()` for isolation.
    -   **Anti-Detection**:
        -   Use stealth arguments (disable automation flags, user-agent rotation).
        -   **Jitter**: Add random delays (1-3s) between requests and before interactions to mimic human behavior.
    -   **Proxy Support**:
        -   If `proxyUrl` is provided, configure the browser context to use it.
        -   Handle authentication automatically.

4.  **Scraping Details**:
    -   For each category URL:
        -   Wait for product grid to load.
        -   **Infinite Scroll**: Scroll down automatically to load all products (or up to a limit).
        -   **Extraction**:
            -   Name, Price (Current & Original), Discount, Image URL, Rating.
            -   **Quantity/Pack Size** (Important).
            -   **In Stock Status** (Result should contain `isOutOfStock` boolean).
            -   Product ID/Slug from URL.

5.  **Resilience**:
    -   Wrap critical steps (navigation, extraction) in `try-catch` blocks.
    -   If a category fails, log the error but **continue** with the next ones.
    -   Add a `health` check endpoint (`GET /health`).

6.  **Code Structure**:
    -   Keep it clean. Use helper functions for `setPincode`, `autoScroll`, `extractProducts`.
    -   Add console logs with emojis for clear status updates (e.g., `🚀 Starting`, `✅ Batch complete`).

## Storage Optimization (Bonus)
-   Like the Zepto version, include logic to check for a local `jiomart_storage_map.json` file.
-   If present, try to load `storageState` for the requested pincode to skip the manual location setup step.

Please write the complete `server.js` code.
