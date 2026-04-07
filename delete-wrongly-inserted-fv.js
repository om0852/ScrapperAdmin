import mongoose from "mongoose";
import fs from "fs";

// Load categories to get all Fruits & Vegetables URLs
const categoriesData = JSON.parse(
  fs.readFileSync("./categories_with_urls.json", "utf-8")
);

const instamartMappings = categoriesData.Instamart || [];

// Extract all Fruits & Vegetables URLs
const fruitsVegUrls = instamartMappings
  .filter((m) => m.masterCategory === "Fruits & Vegetables")
  .map((m) => m.url);

console.log(`\n${'='.repeat(70)}`);
console.log(`🔍 FRUITS & VEGETABLES URL EXTRACTION`);
console.log(`${'='.repeat(70)}`);
console.log(`\n📊 Found ${fruitsVegUrls.length} Fruits & Vegetables URLs\n`);

fruitsVegUrls.slice(0, 5).forEach((url, i) => {
  console.log(`  ${i + 1}. ${url.substring(0, 80)}...`);
});

if (fruitsVegUrls.length > 5) {
  console.log(`  ... and ${fruitsVegUrls.length - 5} more URLs`);
}

async function deleteWronglyInsertedProducts() {
  try {
    await mongoose.connect(
      "mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce",
      
    );

    const db = mongoose.connection.db;
    const ProductSnapshot = db.collection("productsnapshots");

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🗑️  DELETING WRONGLY INSERTED PRODUCTS`);
    console.log(`${'='.repeat(70)}\n`);

    // Find products that:
    // 1. Have category: "Fruits & Vegetables"
    // 2. BUT categoryUrl does NOT match any Fruits & Vegetables URL
    // This means they were wrongly inserted (not from F&V URLs)

    const wronglyInserted = await ProductSnapshot.find({
      category: "Fruits & Vegetables",
      platform: "instamart",
      categoryUrl: {
        $exists: true,
        $not: {
          $in: fruitsVegUrls,
        },
      },
    })
      .limit(100)
      .toArray();

    console.log(`📊 Found ${wronglyInserted.length} wrongly inserted products\n`);

    if (wronglyInserted.length > 0) {
      console.log(`📋 Sample wrongly inserted products:`);
      wronglyInserted.slice(0, 5).forEach((p, i) => {
        console.log(`\n  ${i + 1}. "${p.productName.substring(0, 50)}..."`);
        console.log(`     Category: ${p.category}`);
        console.log(`     URL: ${p.categoryUrl.substring(0, 70)}...`);
      });

      // Delete them
      const deleteResult = await ProductSnapshot.deleteMany({
        category: "Fruits & Vegetables",
        platform: "instamart",
        categoryUrl: {
          $exists: true,
          $not: {
            $in: fruitsVegUrls,
          },
        },
      });

      console.log(`\n${'='.repeat(70)}`);
      console.log(`✅ DELETION COMPLETE`);
      console.log(`${'='.repeat(70)}`);
      console.log(`🗑️  Deleted: ${deleteResult.deletedCount} products`);
      console.log(`✅ All wrongly inserted products removed!\n`);
    } else {
      console.log(`✅ No wrongly inserted products found!\n`);
    }

    // Verify remaining F&V products have correct URLs
    const correctFVProducts = await ProductSnapshot.countDocuments({
      category: "Fruits & Vegetables",
      platform: "instamart",
      categoryUrl: {
        $in: fruitsVegUrls,
      },
    });

    console.log(`📊 Remaining correct Fruits & Vegetables products: ${correctFVProducts}`);

    await mongoose.connection.close();
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

deleteWronglyInsertedProducts();
