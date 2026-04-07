/**
 * Update scrapedAt time for all Instamart products
 * from 2026-03-22T08:00:00.000Z to 2026-03-22T02:30:00.000Z
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductSnapshot from './models/ProductSnapshot.js';

dotenv.config();

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quick_commerce');
    console.log('✅ Connected to MongoDB\n');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

async function updateScrapeTime() {
  const oldDate = new Date('2026-03-22T08:00:00.000Z');
  const newDate = new Date('2026-03-22T02:30:00.000Z');

  const matchQuery = {
    platform: 'instamart',
    scrapedAt: oldDate
  };

  const count = await ProductSnapshot.countDocuments(matchQuery);
  if (count === 0) {
    console.log('✅ No products to update.');
    return;
  }

  const result = await ProductSnapshot.updateMany(matchQuery, { $set: { scrapedAt: newDate } });
  console.log(`🕒 Updated ${result.modifiedCount} products from ${oldDate.toISOString()} to ${newDate.toISOString()}`);
}

async function main() {
  await connectDB();
  await updateScrapeTime();
  await mongoose.disconnect();
}

main();
