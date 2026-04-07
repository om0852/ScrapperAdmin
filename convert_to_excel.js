#!/usr/bin/env node
/**
 * Convert categories_with_urls.json to Excel
 * Creates a workbook with one sheet per platform
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the JSON file
const jsonPath = path.join(__dirname, 'categories_with_urls.json');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Create a new workbook
const workbook = XLSX.utils.book_new();

// Process each platform
Object.entries(jsonData).forEach(([platform, categories]) => {
    console.log(`📊 Processing ${platform}: ${categories.length} categories`);
    
    // Transform data for Excel
    const tableData = categories.map((cat, index) => ({
        '#': index + 1,
        'Platform': platform,
        'Official Category': cat.officalCategory,
        'Official Sub-Category': cat.officalSubCategory,
        'Master Category': cat.masterCategory,
        'URL': cat.url
    }));
    
    // Create worksheet from data
    const worksheet = XLSX.utils.json_to_sheet(tableData);
    
    // Adjust column widths
    const colWidths = [
        { wch: 5 },   // #
        { wch: 15 },  // Platform
        { wch: 25 },  // Official Category
        { wch: 25 },  // Official Sub-Category
        { wch: 25 },  // Master Category
        { wch: 70 }   // URL
    ];
    worksheet['!cols'] = colWidths;
    
    // Add worksheet to workbook
    const sheetName = platform.substring(0, 31); // Excel sheet names limited to 31 chars
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
});

// Write Excel file
const outputPath = path.join(__dirname, 'categories_with_urls.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log(`\n✅ Excel file created: ${outputPath}`);
console.log(`📈 Total platforms: ${Object.keys(jsonData).length}`);
console.log(`📦 Total categories: ${Object.values(jsonData).flat().length}`);
