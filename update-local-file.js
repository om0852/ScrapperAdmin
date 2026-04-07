import fs from "fs";

const filePath = "./scraped_data/Tea_ Coffee _ More/Instamart_400706_2026-03-25T16-54-58-801Z.json";

const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

console.log(`� Folder: Tea_ Coffee _ More → Should be category: "Tea, Coffee & More"`);
console.log(`📊 Original Total Products: ${data.totalProducts}`);
console.log(`📋 Products in array: ${data.products.length}\n`);

let updatedCount = 0;

// Update all products - category from FOLDER NAME, productId suffix from officialSubCategory
data.products = data.products.map((product) => {
  if (
    product.categoryUrl &&
    (product.categoryUrl.includes("Hot+Beverages") ||
      product.categoryUrl.includes("Hot%20Beverages"))
  ) {
    // Fix category
    product.category = "Tea, Coffee & More"; // From folder name
    product.officialCategory = "Cereals & Breakfast"; // From URL mapping
    product.officialSubCategory = "Hot beverages"; // From URL mapping
    
    // Fix productId - replace the category suffix with officialSubCategory
    // "G7126YK69Y__fresh-vegetables" → "G7126YK69Y__hot-beverages"
    if (product.productId && product.productId.includes("__")) {
      const productBase = product.productId.split("__")[0];
      const suffix = product.officialSubCategory
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "and");
      product.productId = `${productBase}__${suffix}`;
    }
    
    updatedCount++;
  }
  return product;
});

// Save the updated file
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

console.log(`✅ File Updated Successfully!`);
console.log(`✨ Updated ${updatedCount} products`);
console.log(`📍 File: ${filePath}`);

// Show sample with CORRECT folder-based mapping
if (updatedCount > 0) {
  console.log(`\n📋 Sample Updated Product:`);
  const sample = data.products[0];
  console.log(`  Name: ${sample.productName}`);
  console.log(`  ProductID: ${sample.productId}`);
  console.log(`  Category (from folder): ${sample.category}`);
  console.log(`  Official Category: ${sample.officialCategory}`);
  console.log(`  SubCategory: ${sample.officialSubCategory}`);
  console.log(`\n✔️  Final Mapping (Folder-Based):`);
  console.log(`  category → "${sample.category}" ✅`);
  console.log(`  productId → "${sample.productId}" (fixed suffix) ✅`);
  console.log(`  officialCategory → "${sample.officialCategory}"`);
  console.log(`  officialSubCategory → "${sample.officialSubCategory}"`);
}
