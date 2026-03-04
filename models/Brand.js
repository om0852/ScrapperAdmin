import mongoose from 'mongoose';

const BrandSchema = new mongoose.Schema({
    brandName: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    brandId: {
        type: String,
        required: true,
        unique: true
    },
    enabled: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

export default mongoose.models.Brand || mongoose.model('Brand', BrandSchema);
