/**
 * Manual Ingestion Utility
 * Handles file-based ingestion with proper category mapping
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { categoryMapper } from '../utils/categoryMapper.js';
import processScrapedDataOptimized from '../controllers/dataControllerOptimized.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Process a single JSON file for ingestion
 * Properly maps categories before sending to optimizer
 */
export async function ingestJsonFile(filePath, pincode, platform, skipCategoryMapping = false, dateOverride = null) {
  try {
    console.log(`📂 Reading file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);

    if (!data.products || !Array.isArray(data.products)) {
      throw new Error('Invalid format: No products array found in file');
    }

    console.log(`📦 Found ${data.products.length} products in file`);

    // ═══════════════════════════════════════════════════════════════════
    // Extract pincode from filename if not provided
    // ═══════════════════════════════════════════════════════════════════
    if (!pincode && filePath.includes('_')) {
      const matches = filePath.match(/_(\d+)_/);
      if (matches && matches[1]) {
        pincode = matches[1];
        console.log(`📍 Extracted pincode from filename: ${pincode}`);
      }
    }

    if (!pincode) {
      throw new Error('Pincode not provided and could not be extracted from filename');
    }

    // ═══════════════════════════════════════════════════════════════════
    // Extract platform from filename if not provided
    // ═══════════════════════════════════════════════════════════════════
    if (!platform) {
      const platformMatch = filePath.match(/\/([^/]+)_\d+_/);
      if (platformMatch && platformMatch[1]) {
        platform = platformMatch[1].replace(/_/, '');
        console.log(`🏪 Extracted platform from filename: ${platform}`);
      }
    }

    if (!platform) {
      throw new Error('Platform not provided and could not be extracted from filename');
    }

    // ═══════════════════════════════════════════════════════════════════
    // Extract category from file path
    // ═══════════════════════════════════════════════════════════════════
    let category = data.category || data.scraped_category || 'Unknown';
    const dirName = path.basename(path.dirname(filePath));
    if (dirName !== 'scraped_data') {
      category = dirName.replace(/ _ /g, ' & ');
      console.log(`📚 Extracted category from directory: ${category}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Map products before ingestion
    // ═══════════════════════════════════════════════════════════════════
    let productsToIngest = data.products;

    if (!skipCategoryMapping) {
      console.log(`🔄 Mapping categories for ${productsToIngest.length} products...`);
      productsToIngest = categoryMapper.batchMapProductCategories(productsToIngest, platform);
      
      // Log sample of mapped categories
      const sample = productsToIngest.slice(0, 3);
      sample.forEach((p, i) => {
        console.log(`  [${i + 1}] ${p.productName || 'Unknown'}`);
        console.log(`      Category: ${p.category}`);
        console.log(`      Official: ${p.officialCategory} > ${p.officialSubCategory}`);
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // Ingest using optimized controller
    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n🚀 Starting optimized ingestion...`);
    const result = await processScrapedDataOptimized({
      pincode,
      platform,
      category,
      products: productsToIngest,
      dateOverride
    });

    return {
      success: true,
      file: filePath,
      pincode,
      platform,
      category,
      result
    };

  } catch (err) {
    console.error(`❌ Ingestion failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
      file: filePath
    };
  }
}

/**
 * Batch ingest all JSON files in a directory
 */
export async function ingestDirectory(dirPath, skipCategoryMapping = false, dateOverride = null) {
  try {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
      throw new Error(`No JSON files found in ${dirPath}`);
    }

    console.log(`\n📂 Found ${files.length} JSON files to process`);

    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(dirPath, file);
      
      console.log(`\n[${i + 1}/${files.length}] Processing: ${file}`);
      console.log(`${'─'.repeat(60)}`);
      
      const result = await ingestJsonFile(filePath, null, null, skipCategoryMapping, dateOverride);
      results.push(result);

      // Small delay between files to avoid overload
      if (i < files.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Summary
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log('📊 BATCH INGESTION SUMMARY');
    console.log(`${'═'.repeat(60)}`);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Successful: ${successful.length}/${files.length}`);
    console.log(`❌ Failed: ${failed.length}/${files.length}`);

    if (failed.length > 0) {
      console.log(`\nFailed files:`);
      failed.forEach(f => console.log(`  • ${path.basename(f.file)}: ${f.error}`));
    }

    let totalStats = {
      totalProducts: 0,
      newProducts: 0,
      updatedProducts: 0,
      newGroups: 0
    };

    successful.forEach(r => {
      if (r.result && r.result.stats) {
        totalStats.totalProducts += r.result.stats.new + r.result.stats.updated;
        totalStats.newProducts += r.result.stats.new;
        totalStats.updatedProducts += r.result.stats.updated;
        totalStats.newGroups += r.result.stats.newGroups;
      }
    });

    console.log(`\n📈 Total Statistics:`);
    console.log(`  Total Products: ${totalStats.totalProducts}`);
    console.log(`  New Products: ${totalStats.newProducts}`);
    console.log(`  Updated Products: ${totalStats.updatedProducts}`);
    console.log(`  New Groups: ${totalStats.newGroups}`);

    return {
      success: failed.length === 0,
      summary: {
        total: files.length,
        successful: successful.length,
        failed: failed.length,
        stats: totalStats
      },
      results
    };

  } catch (err) {
    console.error(`❌ Batch ingestion failed: ${err.message}`);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Get list of files ready for ingestion from a directory
 */
export function getReadyFiles(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: `Directory not found: ${dirPath}` };
    }

    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(dirPath, f);
        const stat = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          size: stat.size,
          modified: stat.mtime
        };
      });

    return {
      success: true,
      count: files.length,
      files
    };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default {
  ingestJsonFile,
  ingestDirectory,
  getReadyFiles
};
