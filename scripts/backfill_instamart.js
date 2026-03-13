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
const filePath = 'scraped_data/Fruits _ Vegetables/Instamart_201303_2026-03-11T02-44-45-513Z.json';
const dateOverrideStr = '2026-03-10T08:00';

const rawData = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(rawData);

async function main() {
    try {
        console.log(`Connecting to MongoDB...`);
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        let updateCount = 0;
        let missingCount = 0;
        
        const targetDate = new Date(dateOverrideStr);
        console.log(`Processing Instamart products for Date: ${targetDate.toISOString()}`);

        for (const prod of data.products) {
            if (!prod.productUrl && !prod.url) {
                missingCount++;
                continue; // No url available to update
            }
            
            const urlToSet = prod.productUrl || prod.url;
            
            let baseId = String(prod.productId || prod.id || '');
            baseId = baseId.replace(/__.*$/, '');
            
            const subCat = prod.officialSubCategory || prod.officalSubCategory || '';
            const suffix = subCat !== 'N/A' && subCat !== '' 
                ? '__' + subCat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                : '';
                
            const finalProductId = baseId + suffix;
            
            // Note: $set updates for ANY pincode as long as the productId, platform, and date match.
            const res = await mongoose.connection.collection('productsnapshots').updateMany(
                {
                    productId: finalProductId,
                    platform: 'instamart',
                    scrapedAt: targetDate
                },
                {
                    $set: { productUrl: urlToSet }
                }
            );
            
            if (res.modifiedCount > 0) {
                updateCount += res.modifiedCount;
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
