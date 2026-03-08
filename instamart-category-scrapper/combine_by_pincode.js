import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map of pincodes to their file patterns
const pincodePatterns = {
  '201014': 'scraped_data_combined_201014_',
  '201303': 'scraped_data_combined_201303_',
  '400070': 'scraped_data_combined_400070_',
  '400703': 'scraped_data_combined_400703_',
  '400706': 'scraped_data_combined_400706_',
  '401101': 'scraped_data_combined_401101_',
  '401202': 'scraped_data_combined_401202_'
};

const DATA_DIR = __dirname;

function log(msg, type = 'INFO') {
  const time = new Date().toLocaleTimeString();
  let icon = 'ℹ️';
  if (type === 'SUCCESS') icon = '✅';
  if (type === 'ERROR') icon = '❌';
  if (type === 'WARN') icon = '⚠️';
  console.log(`[${time}] ${icon} ${msg}`);
}

async function findFilesByPincode() {
  const files = await fs.readdir(DATA_DIR);
  const groupedByPincode = {};

  for (const [pincode, pattern] of Object.entries(pincodePatterns)) {
    groupedByPincode[pincode] = files.filter(f => f.startsWith(pattern) && f.endsWith('.json'));
  }

  return groupedByPincode;
}

async function combineByPincode() {
  log('Starting Instamart pincode-based combination...');

  const pincodeFiles = await findFilesByPincode();
  const results = {};
  let totalFiles = 0;
  let totalProducts = 0;

  for (const [pincode, files] of Object.entries(pincodeFiles)) {
    if (files.length === 0) {
      log(`No files found for pincode ${pincode}`, 'WARN');
      continue;
    }

    log(`Processing pincode ${pincode} (${files.length} files)...`);

    const combinedProducts = [];
    const sources = [];

    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        // Handle both array format and object format
        let products = [];
        if (Array.isArray(data)) {
          products = data;
        } else if (data.products && Array.isArray(data.products)) {
          products = data.products;
        }

        if (products.length > 0) {
          combinedProducts.push(...products);
          sources.push({
            file: file,
            productCount: products.length,
            scrapedAt: data.meta?.scrapedAt || data.scrapedAt || 'unknown'
          });
          totalFiles++;
        }
      } catch (err) {
        log(`Failed to read ${file}: ${err.message}`, 'ERROR');
      }
    }

    // Deduplicate products by productUrl
    const uniqueProducts = [];
    const seenUrls = new Set();

    for (const product of combinedProducts) {
      if (product.productUrl && !seenUrls.has(product.productUrl)) {
        seenUrls.add(product.productUrl);
        uniqueProducts.push(product);
      }
    }

    // Create combined file for this pincode
    const combinedData = Array.isArray(combinedProducts[0])
      ? uniqueProducts
      : {
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

    const outputFile = path.join(DATA_DIR, `instamart_combined_${pincode}.json`);

    try {
      await fs.writeFile(outputFile, JSON.stringify(combinedData, null, 2));
      log(`✓ Created ${path.basename(outputFile)} with ${uniqueProducts.length} unique products`, 'SUCCESS');
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
