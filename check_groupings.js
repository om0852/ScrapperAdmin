import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductGrouping from './models/ProductGrouping.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRAPED_DATA_DIR = path.join(__dirname, 'scraped_data');

// Utility to normalize product names for grouping matching
function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special chars
        .replace(/\s+/g, ' ')        // Normalize spaces
        .trim();
}

// Utility to normalize weights for grouping matching
function normalizeWeight(weightStr) {
    if (!weightStr) return '';
    return weightStr.toLowerCase()
        .replace(/\s+/g, '') // remove spaces (200 g -> 200g)
        .trim();
}

async function checkGroupings() {
    let totalNewProductsChecked = 0;
    let productsWithExistingGroups = 0;
    let productsNeedingNewGroups = 0;

    const files = [];
    function scanDir(dirPath) {
        if (!fs.existsSync(dirPath)) return;
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            if (fs.statSync(fullPath).isDirectory()) scanDir(fullPath);
            else if (item.endsWith('.json')) files.push(fullPath);
        }
    }

    scanDir(SCRAPED_DATA_DIR);

    console.log(`Scanning ${files.length} scraped JSON files for new:true products...`);

    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!data.products || !Array.isArray(data.products)) continue;

            const newProducts = data.products.filter(p => p.new === true);
            if (newProducts.length === 0) continue;

            totalNewProductsChecked += newProducts.length;

            // Check each new product against DB
            for (const prod of newProducts) {
                const normName = normalizeName(prod.productName || prod.name);
                const normWeight = normalizeWeight(prod.productWeight || prod.weight || prod.quantity);
                const category = prod.category || 'Unknown';

                const existingGroup = await ProductGrouping.findOne({
                    "products.productId": prod.id || prod.productId,
                    category: category.trim()
                }).lean();

                if (existingGroup) {
                    productsWithExistingGroups++;
                } else {
                    productsNeedingNewGroups++;
                }
            }

        } catch (e) {
            console.error(`Error reading ${file}: ${e.message}`);
        }
    }

    console.log('\n--- Analysis Complete ---');
    console.log(`Total "new: true" products found: ${totalNewProductsChecked}`);
    console.log(`Products that match an EXISTING group: ${productsWithExistingGroups}`);
    console.log(`Products that would create a NEW group: ${productsNeedingNewGroups}`);
}


async function start() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        await checkGroupings();
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

start();
