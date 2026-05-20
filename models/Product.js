const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    category: {
        type: String, // e.g., 'Software', 'Hardware', 'Service'
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    stock: {
        type: Number,
        default: 50,
        min: 0
    },
    costPrice: {
        type: Number,
        default: 0
    },
    reorderLevel: {
        type: Number,
        default: 10,
        min: 0
    },
    priceHistory: [{
        price: { type: Number, required: true },
        recordedAt: { type: Date, default: Date.now }
    }],
    description: String,
    iconClass: String, // Stores FontAwesome classes (e.g., "fa-solid fa-gear")

    // ============================================
    // SEO & META TAGS (Requirement iii)
    // ============================================
    metaTitle: {
        type: String,
        default: '' // The title that appears in Google search results
    },
    metaDescription: {
        type: String,
        default: '' // The short summary shown in search engines
    },
    keywords: {
        type: String,
        default: '' // Comma-separated keywords (e.g., "laptop repair, virus removal")
    }
}, { timestamps: true }); // Optional: adds createdAt and updatedAt fields

const Product = mongoose.model('Product', productSchema);

module.exports = Product;