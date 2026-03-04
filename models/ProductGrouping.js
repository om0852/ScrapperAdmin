import mongoose from 'mongoose';

const ProductGroupingSchema = new mongoose.Schema({
    // Unique ID for the group (UUID or similar)
    groupingId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // List of products in this group
    products: [{
        platform: {
            type: String,
            required: true,
            enum: ['zepto', 'blinkit', 'jiomart', 'dmart', 'instamart', 'flipkartMinutes', 'flipkart'] // Added flipkartMinutes
        },
        productId: {
            type: String,
            required: true
        }
    }],

    // Category for this group (Enforce constraint)
    category: {
        type: String,
        required: true,
        index: true
    },

    // Metadata (snapshot from the first/primary product for easy display)
    primaryName: String,
    primaryImage: String,
    primaryWeight: String,

    // To track manual overrides
    isManuallyVerified: {
        type: Boolean,
        default: false
    },

    // Count of products in this group (for sorting)
    totalProducts: {
        type: Number,
        default: 0,
        index: true
    },

    // Linked Brand ID
    brandId: {
        type: String,
        default: 'N/A',
        index: true
    },

    // Brand Name (Free text for display/editing)
    brand: {
        type: String,
        default: '',
        index: true
    }

}, {
    timestamps: true
});

// Index for fast lookup of a specific product to find its group
ProductGroupingSchema.index({ 'products.platform': 1, 'products.productId': 1 });
ProductGroupingSchema.index({ primaryName: 'text' }); // Text index for candidate search
ProductGroupingSchema.index({ totalProducts: -1 }); // Index for sorting by popularity/count

export default mongoose.models.ProductGrouping || mongoose.model('ProductGrouping', ProductGroupingSchema);
