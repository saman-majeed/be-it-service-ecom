const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    address: String,
    contact: String,
    email: String,
    paymentMethod: String,
    items: Array,
    total: Number,
    status: { type: String, default: 'Placed' },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);