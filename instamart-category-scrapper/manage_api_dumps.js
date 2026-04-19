#!/usr/bin/env node
/**
 * API Dump Management Utility
 * Consolidates, analyzes, and cleans up Instamart API dumps
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_DUMPS_DIR = path.join(__dirname, 'api_dumps');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m'
};

function log(color, message) {
    console.log(`${colors[color] || ''}${message}${colors.reset}`);
}

// List all pincodes with dumps
function listPincodes() {
    log('blue', '📍 Pincodes with API Dumps:');
    
    if (!fs.existsSync(API_DUMPS_DIR)) {
        log('yellow', 'No dumps directory found');
        return;
    }

    const items = fs.readdirSync(API_DUMPS_DIR);
    const pincodes = items.filter(f => f.startsWith('pincode_'));
    
    if (pincodes.length === 0) {
        log('yellow', 'No pincodes found');
        return;
    }

    pincodes.forEach(pincodeDir => {
        const pincode = pincodeDir.replace('pincode_', '');
        const fullPath = path.join(API_DUMPS_DIR, pincodeDir);
        const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.json'));
        const totalSize = files.reduce((sum, f) => {
            try {
                return sum + fs.statSync(path.join(fullPath, f)).size;
            } catch (e) {
                return sum;
            }
        }, 0);

        const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
        log('green', `  ✓ ${pincode}: ${files.length} dumps (${sizeMB}MB)`);
        
        // Show dump types
        const types = new Set();
        files.forEach(f => {
            const match = f.match(/_([a-z_]+)_/);
            if (match) types.add(match[1]);
        });
        if (types.size > 0) {
            log('blue', `    Types: ${Array.from(types).join(', ')}`);
        }
    });
}

// Show detailed stats
function showStats() {
    log('blue', '📊 API Dumps Statistics:');
    
    const metadataPath = path.join(API_DUMPS_DIR, 'api_dumps_metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
        log('yellow', 'No metadata found');
        return;
    }

    try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        const stats = {
            total: metadata.dumps.length,
            totalBytes: 0,
            byType: {},
            byPincode: {}
        };

        metadata.dumps.forEach(dump => {
            stats.totalBytes += dump.byteSize || 0;
            stats.byType[dump.dumpType] = (stats.byType[dump.dumpType] || 0) + 1;
            stats.byPincode[dump.pincode] = (stats.byPincode[dump.pincode] || 0) + 1;
        });

        log('green', `Total Dumps: ${stats.total}`);
        log('green', `Total Size: ${(stats.totalBytes / 1024 / 1024).toFixed(2)}MB`);
        
        log('blue', '\nBy Type:');
        Object.entries(stats.byType).forEach(([type, count]) => {
            log('green', `  ${type}: ${count}`);
        });

        log('blue', '\nBy Pincode:');
        Object.entries(stats.byPincode).forEach(([pincode, count]) => {
            log('green', `  ${pincode}: ${count}`);
        });
    } catch (err) {
        log('red', `Error: ${err.message}`);
    }
}

// Consolidate all dumps for a pincode
function consolidate(pincode) {
    log('blue', `🔄 Consolidating dumps for pincode: ${pincode}`);
    
    const pincodeDir = path.join(API_DUMPS_DIR, `pincode_${pincode}`);
    
    if (!fs.existsSync(pincodeDir)) {
        log('red', `No dumps found for pincode ${pincode}`);
        return;
    }

    const files = fs.readdirSync(pincodeDir)
        .filter(f => f.endsWith('.json') && f.startsWith('dump_'));

    if (files.length === 0) {
        log('yellow', 'No dump files found');
        return;
    }

    const consolidated = {
        pincode,
        consolidatedAt: new Date().toISOString(),
        totalDumps: files.length,
        dumpSources: [],
        allData: []
    };

    let totalProducts = 0;

    files.forEach(filename => {
        try {
            const filepath = path.join(pincodeDir, filename);
            const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
            const stats = fs.statSync(filepath);

            consolidated.dumpSources.push({
                file: filename,
                size: stats.size,
                dataPoints: Array.isArray(data) ? data.length : 1
            });

            if (Array.isArray(data)) {
                consolidated.allData.push(...data);
                totalProducts += data.length;
            } else {
                consolidated.allData.push(data);
                totalProducts += 1;
            }
        } catch (e) {
            log('yellow', `⚠️  Failed to read ${filename}: ${e.message}`);
        }
    });

    // Save consolidated file
    const consolidatedFilename = `consolidated_${pincode}_${Date.now()}.json`;
    const consolidatedPath = path.join(API_DUMPS_DIR, consolidatedFilename);
    fs.writeFileSync(consolidatedPath, JSON.stringify(consolidated, null, 2));

    const fileSize = (fs.statSync(consolidatedPath).size / 1024 / 1024).toFixed(2);
    log('green', `✓ Consolidated ${files.length} dumps`);
    log('green', `✓ Total data points: ${totalProducts}`);
    log('green', `✓ Output: ${consolidatedFilename} (${fileSize}MB)`);
}

// Clean up old dumps (keep only last N)
function cleanup(keep = 50) {
    log('blue', `🧹 Cleaning up old dumps (keeping last ${keep})...`);
    
    if (!fs.existsSync(API_DUMPS_DIR)) {
        log('yellow', 'No dumps directory found');
        return;
    }

    const metadataPath = path.join(API_DUMPS_DIR, 'api_dumps_metadata.json');
    let deleted = 0;

    try {
        // Clean metadata
        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            if (metadata.dumps.length > keep) {
                const toDelete = metadata.dumps.slice(0, metadata.dumps.length - keep);
                metadata.dumps = metadata.dumps.slice(-keep);
                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                log('green', `✓ Cleaned metadata (removed ${toDelete.length} entries)`);
            }
        }

        // Clean actual files
        const items = fs.readdirSync(API_DUMPS_DIR);
        items.forEach(item => {
            const fullPath = path.join(API_DUMPS_DIR, item);
            if (fs.statSync(fullPath).isDirectory() && item.startsWith('pincode_')) {
                const files = fs.readdirSync(fullPath)
                    .filter(f => f.endsWith('.json') && f.startsWith('dump_'))
                    .sort()
                    .slice(0, -keep); // Keep last 'keep' files

                files.forEach(f => {
                    try {
                        fs.unlinkSync(path.join(fullPath, f));
                        deleted++;
                    } catch (e) {
                        log('yellow', `Failed to delete ${f}`);
                    }
                });
            }
        });

        log('green', `✓ Deleted ${deleted} old dump files`);
    } catch (err) {
        log('red', `Error: ${err.message}`);
    }
}

// Export consolidated data
function exportData(pincode, outputFile) {
    log('blue', `📤 Exporting dumps for pincode: ${pincode}`);
    
    const pincodeDir = path.join(API_DUMPS_DIR, `pincode_${pincode}`);
    
    if (!fs.existsSync(pincodeDir)) {
        log('red', `No dumps found for pincode ${pincode}`);
        return;
    }

    const files = fs.readdirSync(pincodeDir)
        .filter(f => f.endsWith('.json') && f.startsWith('dump_'));

    const exportData = {
        pincode,
        exportedAt: new Date().toISOString(),
        totalDumps: files.length,
        dumps: []
    };

    files.forEach(filename => {
        try {
            const filepath = path.join(pincodeDir, filename);
            const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
            exportData.dumps.push({
                source: filename,
                data: data
            });
        } catch (e) {
            log('yellow', `⚠️  Failed to read ${filename}`);
        }
    });

    const outputPath = outputFile || path.join(__dirname, `export_${pincode}_${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

    const fileSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
    log('green', `✓ Exported to: ${outputPath} (${fileSize}MB)`);
}

// Main CLI
function main() {
    const cmd = process.argv[2];
    const arg1 = process.argv[3];

    switch (cmd) {
        case 'list':
            listPincodes();
            break;
        case 'stats':
            showStats();
            break;
        case 'consolidate':
            if (!arg1) {
                log('red', 'Usage: node manage_api_dumps.js consolidate <pincode>');
                return;
            }
            consolidate(arg1);
            break;
        case 'cleanup':
            const keep = parseInt(arg1) || 50;
            cleanup(keep);
            break;
        case 'export':
            if (!arg1) {
                log('red', 'Usage: node manage_api_dumps.js export <pincode> [output_file]');
                return;
            }
            exportData(arg1, process.argv[4]);
            break;
        default:
            log('blue', '📦 API Dump Management Utility\n');
            log('green', 'Usage:');
            log('green', '  node manage_api_dumps.js list              - List all pincodes and dumps');
            log('green', '  node manage_api_dumps.js stats             - Show statistics');
            log('green', '  node manage_api_dumps.js consolidate <pin> - Consolidate dumps for pincode');
            log('green', '  node manage_api_dumps.js cleanup [keep]    - Clean old dumps (default: keep 50)');
            log('green', '  node manage_api_dumps.js export <pin>      - Export all dumps for pincode');
    }
}

main();
