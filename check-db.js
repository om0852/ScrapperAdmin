import fs from 'fs';
const data = JSON.parse(fs.readFileSync('./categories_with_urls.json', 'utf-8'));
const instamartEntries = data.Instamart;
console.log('Total Instamart entries:', instamartEntries.length);
console.log('\nSearching for tea-coffee entries...');
const teaEntries = instamartEntries.filter(e => e.url.includes('tea-coffee'));
console.log('Found', teaEntries.length, 'tea-coffee entries');
if (teaEntries[0]) {
  console.log('\nFirst tea-coffee entry:');
  console.log('Category:', teaEntries[0].officalCategory);
  console.log('SubCategory:', teaEntries[0].officalSubCategory);
  console.log('URL sample:', teaEntries[0].url.substring(0, 200));
}
