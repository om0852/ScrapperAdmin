const fs = require('fs').promises;
const path = require('path');

async function mergeInstamartByPincode() {
  try {
    const directoryPath = __dirname;
    const files = await fs.readdir(directoryPath);

    // Filter files that match the pattern
    const dataFiles = files.filter(file => 
      file.startsWith('scraped_data_combined_') && 
      file.endsWith('.json')
    );

    console.log(`Found ${dataFiles.length} data files to merge`);

    // Group files by pincode
    const pincodeGroups = {};

    for (const file of dataFiles) {
      // Extract pincode from filename: scraped_data_combined_[PINCODE]_[TIMESTAMP].json
      const match = file.match(/scraped_data_combined_(\d+)_/);
      if (match) {
        const pincode = match[1];
        if (!pincodeGroups[pincode]) {
          pincodeGroups[pincode] = [];
        }
        pincodeGroups[pincode].push(file);
      }
    }

    console.log(`Grouped into ${Object.keys(pincodeGroups).length} unique pincodes`);

    // Merge files for each pincode
    for (const [pincode, fileList] of Object.entries(pincodeGroups)) {
      const mergedData = [];
      const productIds = new Set();
      let duplicateCount = 0;

      console.log(`\nProcessing pincode ${pincode} with ${fileList.length} files...`);

      for (const file of fileList) {
        try {
          const filePath = path.join(directoryPath, file);
          const fileContent = await fs.readFile(filePath, 'utf8');
          const data = JSON.parse(fileContent);

          if (Array.isArray(data)) {
            for (const product of data) {
              // Add pincode to each product if not already present
              if (!product.pincode) {
                product.pincode = pincode;
              }

              // Avoid duplicates based on productId
              if (!productIds.has(product.productId)) {
                mergedData.push(product);
                productIds.add(product.productId);
              } else {
                duplicateCount++;
              }
            }
          }
        } catch (error) {
          console.error(`Error reading file ${file}:`, error.message);
        }
      }

      // Write merged file
      const outputFile = path.join(directoryPath, `instamart_merged_pincode_${pincode}.json`);
      await fs.writeFile(outputFile, JSON.stringify(mergedData, null, 2));
      console.log(`✓ Created ${outputFile} with ${mergedData.length} unique products (${duplicateCount} duplicates removed)`);
    }

    // Create a master file with all data
    console.log(`\nCreating master file...`);
    const masterData = [];
    const masterProductIds = new Set();

    for (const [pincode, fileList] of Object.entries(pincodeGroups)) {
      for (const file of fileList) {
        try {
          const filePath = path.join(directoryPath, file);
          const fileContent = await fs.readFile(filePath, 'utf8');
          const data = JSON.parse(fileContent);

          if (Array.isArray(data)) {
            for (const product of data) {
              if (!product.pincode) {
                product.pincode = pincode;
              }

              // Create a unique key combining pincode and productId for master file
              const uniqueKey = `${pincode}_${product.productId}`;
              if (!masterProductIds.has(uniqueKey)) {
                masterData.push(product);
                masterProductIds.add(uniqueKey);
              }
            }
          }
        } catch (error) {
          // Skip on error
        }
      }
    }

    const masterFile = path.join(directoryPath, 'instamart_merged_all_pincodes.json');
    await fs.writeFile(masterFile, JSON.stringify(masterData, null, 2));
    console.log(`✓ Created master file: ${masterFile} with ${masterData.length} products`);

    // Print summary
    console.log('\n=== MERGE SUMMARY ===');
    console.log(`Total pincodes: ${Object.keys(pincodeGroups).length}`);
    console.log(`Total products in master file: ${masterData.length}`);
    console.log('\nPincode breakdown:');
    for (const [pincode, fileList] of Object.entries(pincodeGroups)) {
      console.log(`  ${pincode}: ${fileList.length} source files`);
    }

  } catch (error) {
    console.error('Error during merge:', error.message);
  }
}

mergeInstamartByPincode();
