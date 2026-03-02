# DMart Scraper Implementation Prompt

I need you to build a robust, production-ready web scraper for DMart (dmart.in) using **Node.js**, **Express**, and **Playwright**.

The architecture must match my existing Jiomart scraper, specifically focusing on **Session Management**, **Single Browser Context**, and **Parallel Batch Processing**.

## Core Requirements

### 1. Project Structure
- `server.js`: The main Express server.
- `extract_sessions.js`: A standalone script to pre-generate and save session states (cookies/storage) for specific pincodes.
- `sessions/`: Directory to store JSON session files.
- `package.json`: Dependencies (express, playwright, etc.).

### 2. Session Management (`extract_sessions.js` & `server.js`)
- **Objective**: DMart requires a pincode to show correct pricing and availability. We cannot set this effectively in every single scraping request due to time/overhead.
- **Solution**:
    - Create a script `extract_sessions.js` that takes a list of pincodes.
    - For each pincode:
        1. Open a browser.
        2. Go to `dmart.in`.
        3. Handle the location/delivery logic (Click "Deliver to", enter Pincode, Apply).
        4. Save the storage state (cookies/localStorage) to `sessions/dmart_${pincode}.json`.
    - In `server.js`, load these sessions into memory (`PRELOADED_SESSIONS`) on startup for fast access.
    - **Fallback**: If a pincode is requested that doesn't have a preloaded session, checking the `jiomart_storage_map.json` (or dmart equivalent) or creating a new session on the fly (and saving it).

### 3. Server Architecture (`server.js`)
- **Endpoint**: `POST /dmartcategoryscrapper`
- **Input JSON**:
  ```json
  {
    "pincode": "400001",
    "categories": [
      { "name": "Ghee", "url": "https://www.dmart.in/category/dairy-beverages-ghee" },
      { "name": "Sugar", "url": "https://www.dmart.in/category/grocery-sugar" }
    ],
    "maxConcurrentTabs": 3
  }
  ```
- **Execution Flow**:
    1. **Launch Browser**: Launch a **single** Playwright browser instance.
    2. **Get Session**: Retrieve the `storageState` for the requested pincode.
    3. **Create Context**: Create **ONE** `browser.newContext({ storageState: ... })`. **Crucial**: Do not create a new context for every page. Reuse this single context for the entire batch to mimic a user opening multiple tabs.
    4. **Batch Processing**:
        - Iterate through the `categories` list in batches of `maxConcurrentTabs`.
        - Use `Promise.all` to process tabs in parallel.
    5. **Scraping Function (`scrapeCategory`)**:
        - `await context.newPage()` (Open tab in the *same* context).
        - **Block Resources**: Block images, fonts, css to speed up loading.
        - **Retry Logic**: If 0 items are found, retry up to 2 times automatically.
        - **Smart Scroll**: Implement a robust auto-scroll function to trigger infinite scrolling until the bottom is reached or a limit is hit.
        - **Data Extraction**: Extract the following fields:
            - `name`, `id` (slug), `currentPrice`, `originalPrice`, `discount`, `image`, `packSize`, `isOutOfStock`, `rating`, `isSponsored`, `deliveryTime`.
        - **Robustness**: checking for "Out of Stock" buttons, handling "Ad" tags, etc.
    6. **Close**: Close the browser context and browser only after all batches are done.

### 4. Technical specifics
- **Selectors**: You will need to inspect DMart's current DOM. (I will provide HTML snippets if needed, otherwise use generic robust strategies or placeholders).
- **Anti-Detection**:
    - Use stealth arguments (`--disable-blink-features=AutomationControlled`).
    - Randomize User-Agent (User-Agent rotation).
    - Add random "jitter" (delays) between interactions.
- **Error Handling**: 
    - Never crash the server on a scraping error. Return `{ success: false, error: ... }` for that specific category.
    - Explicit `waitForSelector` before attempting extraction to ensure the page has loaded (handle slow network).

### 5. Deliverables
Please provide the full code for:
1. `extract_sessions.js`
2. `server.js`

Ensure the code is modular, well-commented, and robust against network timeouts.
