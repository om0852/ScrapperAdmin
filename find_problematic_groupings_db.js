import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const groupSchema = new mongoose.Schema({}, { collection: 'productgroupings', strict: false });
const Group = mongoose.model('ProductGrouping', groupSchema);

// Helper to extract base ID
function getBaseId(productId) {
  if (!productId) return '';
  return String(productId).replace(/__.*$/, '');
}

async function findProblematicGroupings() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all groupings
    const allGroupings = await Group.find({}).lean();
    console.log(`Total groupings in database: ${allGroupings.length}\n`);

    const problematicGroupings = [];

    // Check each grouping
    for (const grouping of allGroupings) {
      if (!grouping.products || !Array.isArray(grouping.products) || grouping.products.length < 2) {
        continue;
      }

      // Group products by platform
      const byPlatform = {};
      for (const prod of grouping.products) {
        const platform = (prod.platform || 'unknown').toLowerCase();
        if (!byPlatform[platform]) {
          byPlatform[platform] = [];
        }
        byPlatform[platform].push(prod);
      }

      // Check if any platform has different base IDs
      let hasIssue = false;
      const issues = {};

      for (const [platform, platformProds] of Object.entries(byPlatform)) {
        const baseIds = new Set(platformProds.map(p => getBaseId(p.productId)));
        
        // If same platform has multiple base IDs = PROBLEM!
        if (baseIds.size > 1) {
          hasIssue = true;
          issues[platform] = {
            differentBaseIds: Array.from(baseIds),
            productCount: platformProds.length,
            products: platformProds.map(p => ({
              productId: p.productId,
              baseId: getBaseId(p.productId)
            }))
          };
        }
      }

      if (hasIssue) {
        problematicGroupings.push({
          _id: grouping._id,
          groupingId: grouping.groupingId,
          primaryName: grouping.primaryName,
          category: grouping.category,
          totalProducts: grouping.totalProducts,
          issues: issues
        });
      }
    }

    console.log(`\n⚠️  FOUND ${problematicGroupings.length} GROUPINGS WITH DIFFERENT BASE IDs FOR SAME PLATFORM\n`);

    // Save to JSON
    const outputPath = path.join(__dirname, 'problematic_groupings_db.json');
    fs.writeFileSync(outputPath, JSON.stringify(problematicGroupings, null, 2));

    console.log(`✅ Saved to: problematic_groupings_db.json\n`);

    // Display
    if (problematicGroupings.length > 0) {
      console.log('First 10 problematic groupings:\n');
      problematicGroupings.slice(0, 10).forEach((grouping, idx) => {
        console.log(`${idx + 1}. "${grouping.primaryName}"`);
        console.log(`   Grouping ID: ${grouping.groupingId}`);
        console.log(`   Category: ${grouping.category}`);
        console.log(`   Total Products: ${grouping.totalProducts}`);
        
        for (const [platform, issue] of Object.entries(grouping.issues)) {
          console.log(`   Platform: ${platform}`);
          console.log(`     Different Base IDs: ${issue.differentBaseIds.join(', ')}`);
          console.log(`     Products in grouping: ${issue.productCount}`);
          issue.products.forEach((prod, pidx) => {
            console.log(`       ${pidx + 1}. ${prod.productId} (base: ${prod.baseId})`);
          });
        }
        console.log();
      });
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Total problematic groupings: ${problematicGroupings.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findProblematicGroupings();
