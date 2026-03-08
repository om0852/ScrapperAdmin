const fs = require('fs').promises;
const path = require('path');

const PINCODES = ["122010","201303","201014","122008","122016","400070","400706","400703","401202","401101"];
const SOURCE_DIR = __dirname; // Current directory where files are located

function log(msg, type = 'INFO') {
    const time = new Date().toLocaleTimeString();
    let icon = 'ℹ️';
    if (type === 'SUCCESS') icon = '✅';
    if (type === 'ERROR') icon = '❌';
    if (type === 'WARN') icon = '⚠️';
    console.log(`[${time}] ${icon} ${msg}`);
}

// Find all files for a specific pincode
async function findFilesForPincode(pincode) {
    const files = await fs.readdir(SOURCE_DIR);
    const pattern = `scraped_data_combined_${pincode}_`;
    const matchedFiles = files.filter(f => f.includes(pattern) && f.endsWith('.json'));
    return matchedFiles;
}

// Merge multiple files into one, avoiding duplicates
async function mergeFilesForPincode(pincode, filesToMerge) {
    if (filesToMerge.length === 0) {
        log(`No files found for pincode ${pincode}`, 'WARN');
        return null;
    }

    log(`Merging ${filesToMerge.length} file(s) for pincode ${pincode}`);

    const productMap = new Map(); // Use map to avoid duplicates by productId
    let totalProcessed = 0;

    for (const file of filesToMerge) {
        try {
            const filePath = path.join(SOURCE_DIR, file);
            const fileData = await fs.readFile(filePath, 'utf8');
            const products = JSON.parse(fileData);

            if (Array.isArray(products)) {
                for (const product of products) {
                    if (product.productId) {
                        // Use productId as unique key
                        productMap.set(product.productId, product);
                    }
                }
                log(`  Loaded ${products.length} products from ${file}`);
                totalProcessed += products.length;
            }
        } catch (err) {
            log(`  Error reading ${file}: ${err.message}`, 'ERROR');
        }
    }

    const uniqueProducts = Array.from(productMap.values());
    log(`Merged to ${uniqueProducts.length} unique products (removed ${totalProcessed - uniqueProducts.length} duplicates)`, 'SUCCESS');

    return uniqueProducts;
}

// Save merged data to single file per pincode
async function saveMergedData(pincode, products) {
    const outputFile = path.join(SOURCE_DIR, `scraped_data_instamart_${pincode}.json`);
    
    try {
        await fs.writeFile(outputFile, JSON.stringify(products, null, 2));
        log(`Saved to ${outputFile}`, 'SUCCESS');
        return outputFile;
    } catch (err) {
        log(`Failed to save ${outputFile}: ${err.message}`, 'ERROR');
        return null;
    }
}

// Archive old files (optional)
async function archiveOldFiles(filesToArchive, pincode) {
    const archiveDir = path.join(SOURCE_DIR, 'archived_multiple_files');
    
    try {
        // Create archive directory if it doesn't exist
        await fs.mkdir(archiveDir, { recursive: true });

        for (const file of filesToArchive) {
            const oldPath = path.join(SOURCE_DIR, file);
            const newPath = path.join(archiveDir, file);
            await fs.rename(oldPath, newPath);
        }

        log(`Archived ${filesToArchive.length} old files to archived_multiple_files/`, 'SUCCESS');
        return true;
    } catch (err) {
        log(`Warning: Could not archive files: ${err.message}`, 'WARN');
        return false;
    }
}

async function main() {
    const start = Date.now();
    const summary = {
        timestamp: new Date().toISOString(),
        pincodes: [],
        totalProductsBefore: 0,
        totalProductsAfter: 0,
        totalDuplicatesRemoved: 0,
        filesCreated: [],
        filesArchived: 0
    };

    log(`Starting consolidation for ${PINCODES.length} pincodes`);
    log(`Source directory: ${SOURCE_DIR}`);

    for (const pincode of PINCODES) {
        log(`\n--- Processing Pincode: ${pincode} ---`);

        try {
            // Find existing files for this pincode
            const filesToMerge = await findFilesForPincode(pincode);

            if (filesToMerge.length === 0) {
                log(`No files found for pincode ${pincode}`, 'WARN');
                continue;
            }

            log(`Found ${filesToMerge.length} file(s) for pincode ${pincode}`);

            // Merge files
            const mergedProducts = await mergeFilesForPincode(pincode, filesToMerge);

            if (!mergedProducts || mergedProducts.length === 0) {
                log(`No valid data for pincode ${pincode}`, 'WARN');
                continue;
            }

            // Save merged data
            const outputFile = await saveMergedData(pincode, mergedProducts);

            if (outputFile) {
                const duplicatesRemoved = filesToMerge.reduce((sum, file) => {
                    const filePath = path.join(SOURCE_DIR, file);
                    try {
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        return sum + (Array.isArray(data) ? data.length : 0);
                    } catch {
                        return sum;
                    }
                }, 0) - mergedProducts.length;

                // Archive old files
                await archiveOldFiles(filesToMerge, pincode);

                summary.pincodes.push({
                    pincode,
                    filesConsolidated: filesToMerge.length,
                    uniqueProducts: mergedProducts.length,
                    duplicatesRemoved,
                    outputFile: path.basename(outputFile)
                });

                summary.totalProductsBefore += filesToMerge.reduce((sum, file) => {
                    const filePath = path.join(SOURCE_DIR, file);
                    try {
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        return sum + (Array.isArray(data) ? data.length : 0);
                    } catch {
                        return sum;
                    }
                }, 0);

                summary.totalProductsAfter += mergedProducts.length;
                summary.totalDuplicatesRemoved += duplicatesRemoved;
                summary.filesCreated.push(path.basename(outputFile));
                summary.filesArchived += filesToMerge.length;
            }
        } catch (err) {
            log(`Error processing pincode ${pincode}: ${err.message}`, 'ERROR');
        }
    }

    const duration = ((Date.now() - start) / 1000 / 60).toFixed(2);

    console.log('\n=========================================');
    log(`Consolidation Complete in ${duration} minutes`, 'SUCCESS');
    log(`Pincodes Processed: ${summary.pincodes.length}`);
    log(`Total Products Before: ${summary.totalProductsBefore}`);
    log(`Total Products After: ${summary.totalProductsAfter}`);
    log(`Total Duplicates Removed: ${summary.totalDuplicatesRemoved}`);
    log(`Files Consolidated Into Single File: ${summary.filesCreated.length}`);
    log(`Old Files Archived: ${summary.filesArchived}`);
    
    console.log('\nConsolidated Files Created:');
    summary.filesCreated.forEach(f => log(`  - ${f}`));

    console.log('=========================================\n');

    // Save summary
    const summaryFile = path.join(SOURCE_DIR, 'consolidation_summary.json');
    await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
    log(`Summary saved to: ${path.basename(summaryFile)}`, 'SUCCESS');
}

main().catch(console.error);
