import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const groupSchema = new mongoose.Schema({}, { collection: 'productgroups', strict: false });
const Group = mongoose.model('ProductGroup', groupSchema);

async function findProblematicGroups() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all groups
    const allGroups = await Group.find({}).lean();
    console.log(`Total groups in database: ${allGroups.length}\n`);

    const problematicGroups = [];

    // Helper to extract base ID
    function getBaseId(productId) {
      if (!productId) return '';
      return String(productId).replace(/__.*$/, '');
    }

    // Check each group
    for (const group of allGroups) {
      if (!group.products || !Array.isArray(group.products) || group.products.length < 2) {
        continue;
      }

      // Group products by platform
      const byPlatform = {};
      for (const prod of group.products) {
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
        problematicGroups.push({
          _id: group._id,
          groupingId: group.groupingId,
          primaryName: group.primaryName,
          category: group.category,
          totalProducts: group.totalProducts,
          issues: issues
        });
      }
    }

    console.log(`\n⚠️  FOUND ${problematicGroups.length} GROUPS WITH DIFFERENT BASE IDs FOR SAME PLATFORM\n`);

    // Save to JSON
    const outputPath = path.join(__dirname, 'problematic_groups_db.json');
    fs.writeFileSync(outputPath, JSON.stringify(problematicGroups, null, 2));

    console.log(`✅ Saved to: problematic_groups_db.json\n`);

    // Display first 10
    console.log('First 10 problematic groups:\n');
    problematicGroups.slice(0, 10).forEach((group, idx) => {
      console.log(`${idx + 1}. "${group.primaryName}"`);
      console.log(`   Group ID: ${group.groupingId}`);
      console.log(`   Category: ${group.category}`);
      console.log(`   Total Products: ${group.totalProducts}`);
      
      for (const [platform, issue] of Object.entries(group.issues)) {
        console.log(`   Platform: ${platform}`);
        console.log(`     Different Base IDs: ${issue.differentBaseIds.join(', ')}`);
        console.log(`     Products in group: ${issue.productCount}`);
        issue.products.forEach((prod, pidx) => {
          console.log(`       ${pidx + 1}. ${prod.productId} (base: ${prod.baseId})`);
        });
      }
      console.log();
    });

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Total problematic groups: ${problematicGroups.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findProblematicGroups();
