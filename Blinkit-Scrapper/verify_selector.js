import fs from 'fs';
const path = 'C:/Users/hp/Downloads/Blinkit-Scrapper/debug_personal_care___body_moisturizers___more.html';

try {
    const content = fs.readFileSync(path, 'utf8');
    const index = content.indexOf('right: 6px'); // Note space might differ, but previous script found it

    if (index === -1) {
        // Try without space
        const index2 = content.indexOf('right:6px');
        if (index2 !== -1) {
            console.log('Found "right:6px"');
            console.log(content.substring(index2 - 200, index2 + 200));
        } else {
            console.log('Not found');
        }
    } else {
        console.log('Found "right: 6px"');
        console.log(content.substring(index - 200, index + 200));
    }

} catch (e) {
    console.error('Error:', e);
}
