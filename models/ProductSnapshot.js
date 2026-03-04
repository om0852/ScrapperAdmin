import mongoose from 'mongoose';

const ProductSnapshotSchema = new mongoose.Schema({
  // Category and location
  category: {
    type: String,
    required: true,
    index: true
  },
  categoryUrl: {
    type: String,
    required: true
  },
  officialCategory: String,
  officialSubCategory: String,
  pincode: {
    type: String,
    required: true,
    index: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['zepto', 'blinkit', 'jiomart', 'dmart', 'instamart', 'flipkartMinutes', "flipkart"],
    index: true
  },
  scrapedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },

  // Product details
  productId: {
    type: String,
    required: true
  },
  // DMart-specific fields
  skuId: String,
  brand: String,
  savings: Number,

  productName: {
    type: String,
    required: true
  },
  productImage: String,
  productWeight: String,
  quantity: String,
  combo: String,
  deliveryTime: String,
  isAd: {
    type: Boolean,
    default: false
  },
  rating: Number,

  // Pricing information
  currentPrice: {
    type: Number,
    required: true
  },
  originalPrice: Number,
  discountPercentage: Number,

  // Ranking
  ranking: {
    type: Number,
    required: true
  },

  // Comparison with previous snapshot
  priceChange: {
    type: Number,
    default: 0
  },
  discountChange: {
    type: Number,
    default: 0
  },
  rankingChange: {
    type: Number,
    default: 0
  },

  // Stock availability
  isOutOfStock: {
    type: Boolean,
    default: false
  },

  // New product indicator (compared to previous scrape)
  new: {
    type: Boolean,
    default: false
  },

  // Metadata
  productUrl: String,
  lastComparedWith: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductSnapshot'
  }
}, {
  timestamps: true
});

// Compound index for efficient querying
ProductSnapshotSchema.index({ category: 1, pincode: 1, platform: 1, scrapedAt: -1 });
ProductSnapshotSchema.index({ category: 1, pincode: 1, scrapedAt: -1 });
ProductSnapshotSchema.index({ productId: 1, platform: 1, scrapedAt: -1 });

// UNIQUE compound index to prevent duplicates
// Same product cannot exist twice for the same scraping session
ProductSnapshotSchema.index(
  { scrapedAt: 1, category: 1, platform: 1, pincode: 1, productId: 1 },
  { unique: true }
);

export default mongoose.models.ProductSnapshot || mongoose.model('ProductSnapshot', ProductSnapshotSchema);
