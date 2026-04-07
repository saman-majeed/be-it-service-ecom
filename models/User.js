const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // For password hashing

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' }, // Distinguishes between customers and admin
    wishlist: { type: Array, default: [] } // ADDED: Matches the structure seen in your database screenshot
}, {
    collection: 'users' // FORCED: This ensures it uses the 'users' collection in MongoDB Atlas
});

// Auto-hash password before saving to MongoDB
// FIXED: Removed 'next' parameter to align with modern async middleware patterns
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.model('User', userSchema);