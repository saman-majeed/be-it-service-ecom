const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    name: String,
    email: String,
    message: String,
    date: {
        type: Date,
        default: Date.now // Automatically sets the current time
    }
});

module.exports = mongoose.model('Contact', contactSchema);