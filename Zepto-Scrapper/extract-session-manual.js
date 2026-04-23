import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function extractSessionManually() {
    try {
        console.log('\n🚀 Zepto Session Extraction Tool\n');
        console.log('=' .repeat(60));
        
        console.log('\n📍 STEP-BY-STEP INSTRUCTIONS:\n');
        
        console.log('1️⃣  OPEN FIREFOX AND CHANGE PINCODE');
        console.log('   • Go to https://www.zepto.com');
        console.log('   • Click on the location/pincode button at the top');
        console.log('   • Change it to your desired location');
        console.log('   • Confirm the change');
        console.log('   • Keep the Firefox window OPEN\n');
        
        console.log('2️⃣  OPEN DEVELOPER TOOLS');
        console.log('   • Press F12 to open Firefox Developer Tools');
        console.log('   • Go to "Storage" tab at the top');
        console.log('   • Click "Local Storage" on the left');
        console.log('   • Select "https://www.zepto.com"\n');
        
        console.log('3️⃣  COPY LOCAL STORAGE DATA');
        console.log('   • Right-click on the table');
        console.log('   • Select "Copy All" or manually select all rows (Ctrl+A)');
        console.log('   • Copy the data (Ctrl+C)\n');
        
        console.log('4️⃣  PASTE HERE');
        console.log('   • Paste the localStorage data below');
        console.log('   • Press Enter twice when done\n');
        
        console.log('=' .repeat(60));
        console.log('\n📋 Paste your localStorage data here:\n');
        
        let localStorageData = '';
        let emptyLineCount = 0;
        
        while (emptyLineCount < 2) {
            const line = await question('');
            if (line === '') {
                emptyLineCount++;
            } else {
                emptyLineCount = 0;
                localStorageData += line + '\n';
            }
        }
        
        if (!localStorageData.trim()) {
            console.log('\n❌ No data was entered. Exiting.');
            process.exit(1);
        }

        console.log('\n✓ Processing your localStorage data...\n');

        // Parse localStorage data
        let localStorage = {};
        const lines = localStorageData.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('\t').trim();
                localStorage[key] = value;
            }
        }

        console.log(`✅ Extracted ${Object.keys(localStorage).length} localStorage items`);
        console.log('\nSample keys:');
        Object.keys(localStorage).slice(0, 5).forEach(key => {
            console.log(`  • ${key}`);
        });

        // Now ask for cookies
        console.log('\n' + '=' .repeat(60));
        console.log('\n5️⃣  EXTRACT COOKIES (Optional but recommended)\n');
        
        console.log('In the same Firefox DevTools:');
        console.log('   • Click "Cookies" on the left');
        console.log('   • Select "https://www.zepto.com"');
        console.log('   • Right-click → Copy All');
        console.log('   • Or manually note important cookies like: auth, session, token, etc.\n');
        
        console.log('Important cookies to copy (if visible):');
        console.log('   • _zap_* (Zepto specific)');
        console.log('   • auth* (Authentication)');
        console.log('   • session* (Session)\n');
        
        console.log('Paste cookie data below (or press Enter to skip):\n');
        
        let cookieData = '';
        emptyLineCount = 0;
        
        while (emptyLineCount < 2) {
            const line = await question('');
            if (line === '') {
                emptyLineCount++;
            } else {
                emptyLineCount = 0;
                cookieData += line + '\n';
            }
        }

        // Parse cookies if provided
        let cookies = [];
        if (cookieData.trim()) {
            console.log('\n✓ Processing cookies...\n');
            
            const cookieLines = cookieData.split('\n').filter(l => l.trim());
            for (const line of cookieLines) {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    cookies.push({
                        name: parts[0].trim(),
                        value: parts[1].trim(),
                        domain: 'www.zepto.com',
                        path: '/',
                        httpOnly: true,
                        secure: true,
                        sameSite: 'Lax'
                    });
                }
            }
            
            console.log(`✅ Extracted ${cookies.length} cookies`);
        } else {
            console.log('\n⏭️  Skipping cookies (will use localStorage only)\n');
        }

        // Create storage state
        const storageState = {
            cookies: cookies,
            origins: [{
                origin: 'https://www.zepto.com',
                localStorage: Object.entries(localStorage).map(([key, value]) => ({
                    name: key,
                    value: value
                }))
            }]
        };

        fs.writeFileSync('zepto_storage_state.json', JSON.stringify(storageState, null, 2));
        
        console.log('\n' + '=' .repeat(60));
        console.log('\n✅ SUCCESS! Storage state saved to: zepto_storage_state.json\n');
        
        console.log('📊 Summary:');
        console.log(`   • Cookies: ${cookies.length}`);
        console.log(`   • LocalStorage items: ${Object.keys(localStorage).length}`);
        console.log(`   • File size: ${fs.statSync('zepto_storage_state.json').size} bytes\n`);

        // Ask if they want to add this to pincodes_storage_map
        const pincode = process.argv[2] || '411001';
        console.log('💾 Creating pincode mapping...\n');
        
        let pincodeMap = {};
        if (fs.existsSync('pincodes_storage_map.json')) {
            pincodeMap = JSON.parse(fs.readFileSync('pincodes_storage_map.json', 'utf8'));
        }
        
        pincodeMap[pincode] = './zepto_storage_state.json';
        fs.writeFileSync('pincodes_storage_map.json', JSON.stringify(pincodeMap, null, 2));
        
        console.log(`✅ Added pincode ${pincode} to pincodes_storage_map.json\n`);
        
        console.log('🎉 Session extraction complete!\n');
        console.log('Your scraper will now:');
        console.log('   1. Load this authenticated session');
        console.log('   2. Skip the login process');
        console.log('   3. Avoid showing ads for authenticated users\n');

        rl.close();

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        rl.close();
        process.exit(1);
    }
}

// Run extraction
await extractSessionManually();
