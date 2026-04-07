const express = require('express');
const router = express.Router();
const User = require('../models/user');
const bcrypt = require('bcryptjs');

// SIGNUP Logic
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.send("Email already registered.");

        const newUser = new User({ name, email, password });
        await newUser.save(); // Saves to MongoDB

        res.redirect('/login');
    } catch (err) {
        res.status(500).send("Error creating account");
    }
});

// LOGIN Logic
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = user; // Store user in session
        res.redirect('/');
    } else {
        res.send("Invalid email or password");
    }
});

module.exports = router;