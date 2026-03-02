import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map of pincodes to their file timestamps
const pincodeFiles = {
  '122008': [
    'scraped_data_122008_2026-02-12T05-37-13-379Z.json',
    'scraped_data_122008_2026-02-16T18-19-37-963Z.json'
  ],
  '122010': [
    'scraped_data_122010_2026-02-12T05-38-57-120Z.json',
    'scraped_data_122010_2026-02-17T03-19-15-704Z.json',
    'scraped_data_122010_2026-02-17T04-28-32-876Z.json'
  ],
  '122016': [
    'scraped_data_122016_2026-02-12T05-25-43-413Z.json',
    'scraped_data_122016_2026-02-17T02-59-35-811Z.json'
  ],
  '201014': [
    'scraped_data_201014_2026-02-12T05-37-21-290Z.json',
    'scraped_data_201014_2026-02-17T03-01-15-181Z.json'
  ],
  '201303': [
    'scraped_data_201303_2026-02-12T05-33-44-081Z.json',
    'scraped_data_201303_2026-02-16T18-56-30-650Z.json'
  ],
  '400070': [
    'scraped_data_400070_2026-02-12T05-50-44-037Z.json',
    'scraped_data_400070_2026-02-17T03-50-52-431Z.json',
    'scraped_data_400070_2026-02-17T05-18-51-117Z.json'
  ],
  '400703': [
    'scraped_data_400703_2026-02-12T05-59-31-880Z.json',
    'scraped_data_400703_2026-02-17T03-49-44-202Z.json',
    'scraped_data_400703_2026-02-17T04-49-30-796Z.json'
  ],
  '400706': [
    'scraped_data_400706_2026-02-12T05-56-02-254Z.json',
    'scraped_data_400706_2026-02-17T03-49-53-717Z.json',
    'scraped_data_400706_2026-02-17T04-47-29-038Z.json'
  ],
  '401101': [
    'scraped_data_401101_2026-02-12T05-59-47-588Z.json',
    'scraped_data_401101_2026-02-17T03-51-20-656Z.json',
    'scraped_data_401101_2026-02-17T05-41-21-189Z.json'
  ],
  '401202': [
    'scraped_data_401202_2026-02-12T06-27-53-677Z.json',
    'scraped_data_401202_2026-02-17T05-59-11-707Z.json'
  ]
};

const DATA_DIR = path.join(__dirname, 'scraped_data');

function log(msg, type = 'INFO') {
  const time = new Date().toLocaleTimeString();
  let icon = 'ℹ️';
  if (type === 'SUCCESS') icon = '✅';
  if (type === 'ERROR') icon = '❌';
  if (type === 'WARN') icon = '⚠️';
  console.log(`[${time}] ${icon} ${msg}`);
}

async function combineByPincode() {
  log('Starting pincode-based combination...');

  const results = {};
  let totalFiles = 0;
  let totalProducts = 0;

  for (const [pincode, files] of Object.entries(pincodeFiles)) {
    log(`Processing pincode ${pincode} (${files.length} files)...`);

    const combinedProducts = [];
    const sources = [];

    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        if (data.products && Array.isArray(data.products)) {
          combinedProducts.push(...data.products);
          sources.push({
            file: file,
            productCount: data.products.length,
            scrapedAt: data.meta?.scrapedAt || 'unknown'
          });
          totalFiles++;
        }
      } catch (err) {
        log(`Failed to read ${file}: ${err.message}`, 'ERROR');
      }
    }

    // Deduplicate products by product URL
    const uniqueProducts = [];
    const seenUrls = new Set();

    for (const product of combinedProducts) {
      if (product.productUrl && !seenUrls.has(product.productUrl)) {
        seenUrls.add(product.productUrl);
        uniqueProducts.push(product);
      }
    }

    // Create combined file for this pincode
    const combinedData = {
      status: 'success',
      pincode: pincode,
      totalProducts: uniqueProducts.length,
      products: uniqueProducts,
      meta: {
        combinedAt: new Date().toISOString(),
        sourcesCount: files.length,
        sources: sources,
        deduplicationApplied: true,
        originalProductsBeforeDedup: combinedProducts.length
      }
    };

    const outputFile = path.join(DATA_DIR, `jiomart_combined_${pincode}.json`);

    try {
      await fs.writeFile(outputFile, JSON.stringify(combinedData, null, 2));
      log(`✓ Created ${outputFile} with ${uniqueProducts.length} unique products`, 'SUCCESS');
      totalProducts += uniqueProducts.length;
      results[pincode] = {
        file: outputFile,
        uniqueProducts: uniqueProducts.length,
        totalBeforeDedup: combinedProducts.length
      };
    } catch (err) {
      log(`Failed to write ${outputFile}: ${err.message}`, 'ERROR');
    }
  }

  console.log('\n=========================================');
  log(`Combination Complete`, 'SUCCESS');
  log(`Total files combined: ${totalFiles}`);
  log(`Total unique products across all pincodes: ${totalProducts}`);
  log(`Output directory: ${DATA_DIR}`);
  console.log('Summary:');
  for (const [pincode, info] of Object.entries(results)) {
    console.log(`  ${pincode}: ${info.uniqueProducts} unique products (${info.totalBeforeDedup} before dedup)`);
  }
  console.log('=========================================\n');
}

combineByPincode().catch(console.error);
