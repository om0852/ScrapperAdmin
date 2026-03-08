const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'debug_delivery_page.html');

try {
    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        process.exit(1);
    }
    const html = fs.readFileSync(filePath, 'utf8');
    console.log(`Loaded HTML: ${html.length} chars`);

    // 1. Search for "min" or "mins" with context
    const minRegex = /(\d+)\s*(?:min|mins|minutes)/gi;
    let match;
    let foundMin = false;
    let countMin = 0;

    console.log('--- MIN MATCHES ---');
    while ((match = minRegex.exec(html)) !== null) {
        foundMin = true;
        countMin++;
        const start = Math.max(0, match.index - 40);
        const end = Math.min(html.length, match.index + 40);
        const context = html.substring(start, end).replace(/\s+/g, ' ').trim();
        console.log(`Match ${countMin}: "${match[0]}" Context: [${context}]`);
        if (countMin >= 10) break;
    }
    if (!foundMin) console.log('No "X min" patterns found.');

    // 2. Search for "Delivery" keyword
    const delRegex = /delivery/gi;
    let dMatch;
    let countDel = 0;

    console.log('--- DELIVERY MATCHES ---');
    while ((dMatch = delRegex.exec(html)) !== null) {
        countDel++;
        const start = Math.max(0, dMatch.index - 40);
        const end = Math.min(html.length, dMatch.index + 40);
        const context = html.substring(start, end).replace(/\s+/g, ' ').trim();
        console.log(`Delivery ${countDel}: [${context}]`);
        if (countDel >= 10) break;
    }
    if (countDel === 0) console.log('No "Delivery" keyword found.');

} catch (e) {
    console.error(`Error: ${e.message}`);
}
