import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce";

// Specific file to parse
const filePath = process.argv[2] || 'scraped_data/Fruits _ Vegetables/Blinkit_201303_2026-03-10T14-01-38-270Z.json';
const dateOverrideStr = process.argv[3] || '2026-03-10T08:00';

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const rawData = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(rawData);

async function main() {
    try {
        console.log(`Connecting to MongoDB...`);
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        let updateCount = 0;
        let missingCount = 0;
        
        // Infer platform from file if not present in JSON root
        let platformName = data.platform;
        if (!platformName) {
            const fileName = path.basename(filePath);
            const fileParts = fileName.split('_');
            if (fileParts.length > 0) platformName = fileParts[0];
        }

        const PLATFORM_ENUM = ['zepto', 'blinkit', 'jiomart', 'dmart', 'instamart', 'flipkartMinutes', 'flipkart'];
        const normalizedPlatform = PLATFORM_ENUM.find(p => p.toLowerCase() === platformName.toLowerCase()) || platformName.toLowerCase();

        const pincode = String(data.pincode || 'Unknown').trim();
        const category = data.products.length > 0 ? data.products[0].category : 'Unknown';
        
        // Determine the timestamp to update.
        // It must exact match the scrapedAt created in DB during original ingestion.
        // In dataController, new Date(overrideStr) creates a local Date Object that represents midnight/or exact hours.
        // Since we provided '2026-03-10T08:00', the DB stored ISO String new Date('2026-03-10T08:00').
        const targetDate = new Date(dateOverrideStr);
        
        console.log(`Processing file for Platform: ${normalizedPlatform}, Pincode: ${pincode}, Date: ${targetDate.toISOString()}`);

        for (const prod of data.products) {
            if (!prod.productUrl && !prod.url) {
                missingCount++;
                continue; // No url available to update
            }
            
            const urlToSet = prod.productUrl || prod.url;
            
            // Reconstruct the suffixed productId to match dataController (what's actually saved in DB)
            let baseId = String(prod.productId || prod.id || '');
            baseId = baseId.replace(/__.*$/, '');
            
            const subCat = prod.officialSubCategory || prod.officalSubCategory || '';
            const suffix = subCat !== 'N/A' && subCat !== '' 
                ? '__' + subCat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                : '';
                
            const finalProductId = baseId + suffix;
            
            const res = await mongoose.connection.collection('productsnapshots').updateOne(
                {
                    productId: finalProductId,
                    platform: normalizedPlatform,
                    pincode: pincode,
                    scrapedAt: targetDate
                },
                {
                    $set: { productUrl: urlToSet }
                }
            );
            
            if (res.modifiedCount > 0) {
                updateCount++;
            }
        }
        
        console.log('\n--- SUMMARY ---');
        console.log(`Successfully updated ${updateCount} products with productUrl.`);
        console.log(`Products in JSON with no productUrl/url field: ${missingCount}`);
        
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
}

main();
