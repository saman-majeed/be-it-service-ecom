const express = require('express');
const helmet = require('helmet');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Models
const Product = require('./models/Product');
const Contact = require('./models/Contact');
const Order = require('./models/Order');
const User = require('./models/user');
// ADDED: Import the Admin model for the separate collection
const Admin = require('./models/Admin');

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true
})
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.log('❌ MongoDB Connection Error:', err));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// HELMET CONFIGURATION
app.use(helmet({
    contentSecurityPolicy: false,
}));

// MIDDLEWARE FOR JSON AND FORM DATA
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'my secret key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Global middleware
app.use((req, res, next) => {
    res.locals.cart = req.session.cart || [];
    res.locals.user = req.session.user || null;
    res.locals.seoTitle = 'Be IT:Service - IT Solutions';
    res.locals.seoDesc = 'Professional IT services and e-commerce solutions.';
    res.locals.seoKeywords = 'IT, software, hardware, services';
    next();
});

// ================= AUTH MIDDLEWARE =================
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.redirect('/login?error=Admin Access Required');
};

// ================= AUTH ROUTES =================
app.get('/login', (req, res) => {
    const isAdminPage = req.query.error === 'Admin Access Required' || req.query.admin === 'true';
    res.render('login', {
        error: req.query.error,
        success: req.query.success,
        isAdminPage: isAdminPage
    });
});

app.get('/signup', (req, res) => res.render('signup', { error: null }));

// FIXED: Improved signup logic with explicit logging and error handling
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        console.log(`Attempting signup for: ${email}`);

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('signup', { error: 'Email already in use' });
        }

        const newUser = new User({
            name,
            email,
            password,
            role: 'user'
        });

        await newUser.save();
        console.log("User saved successfully to 'users' collection.");

        // Ensure this redirect is hit
        return res.redirect('/login?success=Account created successfully! Please login.');
    } catch (err) {
        console.error("Signup Database Error:", err);
        res.render('signup', { error: "Error creating account. Please check console." });
    }
});

// UPDATED: Login logic to check both 'users' and 'admin' collections separately
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // 1. Search the regular users collection first
        let user = await User.findOne({ email });
        let isFromAdminCollection = false;

        // 2. If not found in users, search the separate admin collection
        if (!user) {
            user = await Admin.findOne({ email });
            if (user) isFromAdminCollection = true;
        }

        // 3. Verify credentials if a match was found in either collection
        if (user && await bcrypt.compare(password, user.password)) {
            // CRITICAL: Set the role explicitly based on the source collection 
            // This prevents redirect loops back to login
            req.session.user = {
                _id: user._id,
                name: user.name,
                role: isFromAdminCollection ? 'admin' : user.role,
                email: user.email
            };

            // 4. Determine final redirect
            const finalRole = isFromAdminCollection ? 'admin' : user.role;
            return res.redirect(finalRole === 'admin' ? '/admin' : '/');
        }
        res.redirect('/login?error=Invalid Credentials');
    } catch (err) {
        console.error("Login Error:", err);
        res.redirect('/login?error=Server Error');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ================= CONTACT FORM SUBMISSION =================
app.post('/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        const newContact = new Contact({
            name,
            email,
            message,
            date: new Date()
        });
        await newContact.save();
        res.send('<script>alert("Message sent successfully!"); window.location.href="/#contact";</script>');
    } catch (err) {
        console.error("Contact Form Error:", err);
        res.status(500).send("Error sending message. Please try again later.");
    }
});

// ================= ADMIN PRODUCT MANAGEMENT (CRUD) =================

app.get('/admin', isAdmin, async (req, res) => {
    const products = await Product.find();
    res.render('admin/dashboard', { products });
});

app.get('/admin/users', isAdmin, async (req, res) => {
    try {
        const allUsers = await User.find();
        res.render('admin/users', { allUsers });
    } catch (err) {
        res.status(500).send("Error fetching users");
    }
});

app.get('/admin/product/new', isAdmin, (req, res) => {
    res.render('admin/edit-product', { editing: false, product: {} });
});

app.post('/admin/product/new', isAdmin, async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send("Error adding product: " + err.message);
    }
});

app.get('/admin/product/edit/:id', isAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.redirect('/admin');
        res.render('admin/edit-product', { product, editing: true });
    } catch (err) {
        res.redirect('/admin');
    }
});

app.post('/admin/product/edit/:id', isAdmin, async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.params.id, req.body);
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send("Error updating product: " + err.message);
    }
});

app.post('/admin/product/delete/:id', isAdmin, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (err) {
        res.status(500).send("Error deleting product.");
    }
});

// ================= ADMIN ORDER MANAGEMENT =================
app.get('/admin/orders', isAdmin, async (req, res) => {
    const orders = await Order.find().sort({ date: -1 });
    res.render('admin/orders', { orders });
});

app.post('/admin/order/update-status/:id', isAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).send("Order not found");

        if (order.status === 'Placed') {
            order.status = 'Processing';
        } else if (order.status === 'Processing') {
            order.status = 'Delivered';
        }

        await order.save();
        res.redirect('/admin/orders');
    } catch (err) {
        res.status(500).send("Error updating status");
    }
});

// ================= CUSTOMER ROUTES =================
app.get('/', async (req, res) => {
    let query = {};
    if (req.query.category) query.category = req.query.category;
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const products = await Product.find(query).limit(limit).skip(skip);
    const totalProducts = await Product.countDocuments(query);
    res.render('index', {
        products,
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        category: req.query.category || '',
        user: req.session.user || null
    });
});

app.get('/product/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        res.render('product-details', {
            product,
            seoTitle: product.metaTitle || product.name,
            seoDesc: product.metaDescription || product.description.substring(0, 160),
            seoKeywords: product.keywords || ''
        });
    } catch (err) {
        res.redirect('/');
    }
});

app.post('/add-to-cart/:id', async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!req.session.cart) req.session.cart = [];
    req.session.cart.push(product);
    res.redirect('/checkout');
});

app.get('/clear-cart', (req, res) => {
    req.session.cart = [];
    res.redirect('/checkout');
});

app.get('/checkout', (req, res) => {
    const cart = req.session.cart || [];
    let total = 0;
    cart.forEach(item => total += Number(item.price));
    res.render('checkout', { cart, total });
});

// ================= ORDER FLOW =================

app.post('/prepare-payment', (req, res) => {
    const { address, phone, email, total } = req.body;
    return res.render('payment', { email, address, phone, total });
});

app.post('/order/preview', (req, res) => {
    const { address, phone, email, paymentMethod, coupon } = req.body;
    const cart = req.session.cart || [];
    if (cart.length === 0) return res.redirect('/');

    let subtotal = 0;
    cart.forEach(item => subtotal += Number(item.price));
    let discount = (coupon === 'SAVE10') ? (subtotal * 0.10) : 0;
    const grandTotal = subtotal - discount + 10;

    const orderInfo = {
        address,
        contact: phone,
        email,
        paymentMethod,
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        total: grandTotal.toFixed(2)
    };

    req.session.pendingOrder = orderInfo;
    return res.render('order-preview', { cart, orderInfo });
});

app.post('/order/confirm', async (req, res) => {
    try {
        const orderInfo = req.session.pendingOrder;
        const cart = req.session.cart || [];
        if (!orderInfo || cart.length === 0) return res.redirect('/checkout');

        if (orderInfo.paymentMethod === 'online') {
            return res.render('payment', {
                email: orderInfo.email,
                address: orderInfo.address,
                phone: orderInfo.contact,
                total: orderInfo.total
            });
        }

        const newOrder = new Order({
            email: orderInfo.email,
            address: orderInfo.address,
            contact: orderInfo.contact,
            paymentMethod: 'Cash on Delivery',
            items: cart,
            total: parseFloat(orderInfo.total),
            status: 'Placed'
        });

        await newOrder.save();
        req.session.cart = [];
        delete req.session.pendingOrder;
        return res.render('order-success', { order: newOrder });
    } catch (err) {
        res.status(500).send("Confirmation Error: " + err.message);
    }
});

app.post('/confirm-payment', async (req, res) => {
    try {
        const { email, address, phone, total } = req.body;
        const cart = req.session.cart || [];
        const newOrder = new Order({
            email,
            address,
            contact: phone,
            paymentMethod: 'Online Card',
            items: cart,
            total: parseFloat(total),
            status: 'Placed'
        });
        await newOrder.save();
        req.session.cart = [];
        delete req.session.pendingOrder;
        return res.render('order-success', { order: newOrder });
    } catch (err) {
        res.status(500).send("Payment Error: " + err.message);
    }
});

// ================= MY ORDERS =================
app.get('/my-orders', (req, res) => {
    res.render('my-orders', { orders: null, error: null });
});

app.post('/my-orders', async (req, res) => {
    const orders = await Order.find({ email: req.body.email }).sort({ date: -1 });
    res.render('my-orders', { orders, error: orders.length ? null : "No orders found." });
});

// ================= AI CHATBOT AGENT API =================
app.post('/api/chat', async (req, res) => {
    try {
        const message = req.body.message ? req.body.message.toLowerCase() : "";
        let reply = "I'm your AI assistant! Ask me about your orders, our services, or policies.";

        if (message.includes("order") || message.includes("status") || message.includes("track")) {
            const userEmail = req.session.user ? req.session.user.email : null;
            if (userEmail) {
                const latestOrder = await Order.findOne({ email: userEmail }).sort({ date: -1 });
                if (latestOrder) {
                    reply = `Your latest order (ID: ...${latestOrder._id.toString().slice(-6)}) is currently **${latestOrder.status}**.`;
                } else {
                    reply = "I couldn't find any orders linked to your account.";
                }
            } else {
                reply = "Please log in first so I can find your order details!";
            }
        }

        else if (message.includes("show") || message.includes("product") || message.includes("service") || message.includes("find")) {
            const products = await Product.find().limit(2);
            if (products.length > 0) {
                const names = products.map(p => p.name).join(" and ");
                reply = `We offer great services like ${names}. Check our 'Offer' section for more!`;
            } else {
                reply = "We have many hardware and software solutions available. What are you looking for specifically?";
            }
        }

        else if (message.includes("return") || message.includes("refund")) {
            reply = "We offer a 30-day return policy on most hardware repairs and software services.";
        }
        else if (message.includes("shipping") || message.includes("delivery") || message.includes("time")) {
            reply = "Most repairs are completed and returned within 4 business days!";
        }
        else if (message.includes("payment") || message.includes("pay")) {
            reply = "We accept Cash on Delivery (COD) and Online Card payments.";
        }

        res.json({ reply });
    } catch (err) {
        console.error("Chat API Error:", err);
        res.json({ reply: "Oops! I encountered an error. Please try again later." });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));