import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

const productSnapshotSchema = new mongoose.Schema({}, { collection: 'productsnapshots' });
const ProductSnapshot = mongoose.model('ProductSnapshot', productSnapshotSchema);

async function inspectDatabase() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB\n');

        const targetDate = new Date('2026-03-10T02:30:00.000Z');

        // Get 10 sample records from the target date and pincode
        const samples = await ProductSnapshot.find({
            scrapedAt: targetDate,
            pincode: '201303',
            platform: 'blinkit'
        }).limit(10).lean();

        console.log(`Found ${samples.length} sample records\n`);
        console.log('Sample records:');
        samples.forEach((doc, idx) => {
            console.log(`\n${idx + 1}. ${doc.productName || 'N/A'}`);
            console.log(`   productId: ${doc.productId}`);
            console.log(`   platform: ${doc.platform}`);
            console.log(`   pincode: ${doc.pincode}`);
            console.log(`   category: ${doc.category}`);
            console.log(`   officialSubCategory: ${doc.officialSubCategory}`);
            console.log(`   ranking: ${doc.ranking}`);
            console.log(`   scrapedAt: ${doc.scrapedAt}`);
        });

        // Also list unique officialSubCategory values
        const subCats = await ProductSnapshot.distinct('officialSubCategory', {
            scrapedAt: targetDate,
            pincode: '201303',
            platform: 'blinkit'
        });
        console.log(`\n\nUnique officialSubCategory values (${subCats.length}):`);
        subCats.forEach(cat => console.log(`  - ${cat}`));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

inspectDatabase();
