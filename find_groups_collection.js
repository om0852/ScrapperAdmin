import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce';

async function findGroups() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Try different collection names
    const possibleCollections = [
      'productgroups',
      'productgroupings', 
      'groups',
      'groupings',
      'product_groups',
      'productGroupings'
    ];

    const db = mongoose.connection.db;
    const allCollections = await db.listCollections().toArray();
    const collectionNames = allCollections.map(c => c.name);

    console.log('All collections in database:');
    collectionNames.forEach(name => console.log(`  - ${name}`));

    console.log('\n\nSearching for groups collection...\n');

    for (const collName of possibleCollections) {
      if (collectionNames.includes(collName)) {
        const count = await db.collection(collName).countDocuments();
        console.log(`✅ FOUND: ${collName} (${count} documents)`);

        if (count > 0) {
          const sample = await db.collection(collName).findOne({});
          console.log('\nSample document:');
          console.log(JSON.stringify(sample, null, 2).substring(0, 500));
        }
        break;
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findGroups();
