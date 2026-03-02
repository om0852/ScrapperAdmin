
import fs from 'fs';

try {
    const rawData = fs.readFileSync('jiomart_api_dump.json', 'utf8');
    const data = JSON.parse(rawData);

    if (data.results && data.results.length > 0) {
        const item = data.results[0];
        fs.writeFileSync('first_item.json', JSON.stringify(item, null, 2));
        console.log('Written first item to first_item.json');
    } else {
        console.log('No results found');
    }
} catch (e) {
    console.error('Error:', e.message);
}
