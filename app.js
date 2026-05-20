const express = require('express');
const helmet = require('helmet');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { getMongoUri } = require('./lib/mongoUri');
require('dotenv').config();

// Models
const Product = require('./models/Product');
const Contact = require('./models/Contact');
const Order = require('./models/Order');
const User = require('./models/User');
// ADDED: Import the Admin model for the separate collection
const Admin = require('./models/Admin');
const { buildInventoryDashboard } = require('./services/inventoryAnalytics');
const { getAIInventoryRecommendations, getGroqChatReply } = require('./services/inventoryAI');
const { handleChatMessage, getAutocomplete } = require('./services/chatAgent');
const {
    loadSeoGlobals,
    getSiteSettings,
    getBaseUrl,
    buildSitemapXml,
    buildRobotsTxt,
    buildProductJsonLd,
    slugify,
    Backlink,
    ParasiteCampaign,
} = require('./services/seoService');

try {
    const compression = require('compression');
    app.use(compression());
} catch {
    console.log('Tip: run npm install compression for gzip page optimization');
}

const PORT = process.env.PORT || 3000;

function parseProductFields(body) {
    return {
        name: body.name,
        category: body.category,
        price: Number(body.price),
        description: body.description,
        iconClass: body.iconClass,
        metaTitle: body.metaTitle,
        metaDescription: body.metaDescription,
        keywords: body.keywords,
        stock: Number(body.stock) >= 0 ? Number(body.stock) : 50,
        costPrice: Number(body.costPrice) >= 0 ? Number(body.costPrice) : Number(body.price) * 0.65,
        reorderLevel: Number(body.reorderLevel) >= 0 ? Number(body.reorderLevel) : 10,
    };
}

// Connect to MongoDB (direct URI fallback when SRV DNS fails)
mongoose.connect(getMongoUri(), {
    serverSelectionTimeoutMS: 15000,
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

// Global middleware (cart, user, SEO)
app.use((req, res, next) => {
    res.locals.cart = req.session.cart || [];
    res.locals.user = req.session.user || null;
    next();
});
app.use(loadSeoGlobals);

// ================= AUTH MIDDLEWARE =================
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    if (req.session.user) {
        return res.redirect('/login?admin=true&error=You are logged in as a regular user. Log out first, then use Admin Login.');
    }
    res.redirect('/login?admin=true&error=Admin Access Required');
};

const isAdminApi = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.status(403).json({ success: false, error: 'Admin access required' });
};

// ================= AUTH ROUTES =================
app.get('/login', (req, res) => {
    const isAdminPage = req.query.admin === 'true' || String(req.query.error || '').includes('Admin');
    if (req.session.user?.role === 'admin' && isAdminPage) {
        return res.redirect('/admin');
    }
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

// Login: admin page checks admin collection first (same email can exist in both)
app.post('/login', async (req, res) => {
    const { email, password, loginType } = req.body;
    const wantAdmin = loginType === 'admin';

    const fail = (msg) =>
        res.redirect(wantAdmin ? `/login?admin=true&error=${encodeURIComponent(msg)}` : `/login?error=${encodeURIComponent(msg)}`);

    try {
        let account = null;
        let role = 'user';

        if (wantAdmin) {
            const adminDoc = await Admin.findOne({ email });
            if (adminDoc) {
                account = adminDoc;
                role = 'admin';
            } else {
                const userAdmin = await User.findOne({ email, role: 'admin' });
                if (userAdmin) {
                    account = userAdmin;
                    role = 'admin';
                }
            }
        } else {
            account = await User.findOne({ email });
            if (account) role = account.role || 'user';
        }

        if (!account || !(await bcrypt.compare(password, account.password))) {
            return fail('Invalid Credentials');
        }

        if (wantAdmin && role !== 'admin') {
            return fail('This account is not an admin. Use the regular login page.');
        }

        req.session.user = {
            _id: account._id,
            name: account.name,
            role,
            email: account.email
        };

        if (wantAdmin || role === 'admin') {
            return res.redirect('/admin');
        }
        return res.redirect('/');
    } catch (err) {
        console.error('Login Error:', err);
        return fail('Server Error');
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
    res.render('admin/dashboard', { products, user: req.session.user });
});

// ================= AI INVENTORY CONTROL DASHBOARD =================
app.get('/admin/inventory', isAdmin, async (req, res) => {
    try {
        const analytics = await buildInventoryDashboard();
        let aiInsights = null;
        try {
            aiInsights = await getAIInventoryRecommendations(analytics);
        } catch (aiErr) {
            console.error('Groq inventory insights:', aiErr.message);
        }
        res.render('admin/inventory', {
            analytics,
            aiInsights,
            user: req.session.user
        });
    } catch (err) {
        console.error('Inventory dashboard error:', err);
        res.status(500).send('Could not load inventory dashboard.');
    }
});

app.post('/api/admin/inventory/ai-insights', isAdminApi, async (req, res) => {
    try {
        const analytics = await buildInventoryDashboard();
        const insights = await getAIInventoryRecommendations(analytics);
        res.json({ success: true, insights });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
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
    res.render('admin/edit-product', { editing: false, product: {}, user: req.session.user });
});

app.post('/admin/product/new', isAdmin, async (req, res) => {
    try {
        const fields = parseProductFields(req.body);
        const newProduct = new Product(fields);
        newProduct.priceHistory = [{ price: fields.price, recordedAt: new Date() }];
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
        res.render('admin/edit-product', { product, editing: true, user: req.session.user });
    } catch (err) {
        res.redirect('/admin');
    }
});

app.post('/admin/product/edit/:id', isAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.redirect('/admin');
        const fields = parseProductFields(req.body);
        const update = { ...fields };
        if (fields.price !== product.price) {
            await Product.findByIdAndUpdate(req.params.id, {
                ...update,
                $push: { priceHistory: { price: product.price, recordedAt: new Date() } }
            });
        } else {
            await Product.findByIdAndUpdate(req.params.id, update);
        }
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
    res.render('admin/orders', { orders, user: req.session.user });
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

// ================= SEO ADMIN =================
app.get('/admin/seo', isAdmin, async (req, res) => {
    try {
        const settings = await getSiteSettings();
        const backlinks = await Backlink.find().sort({ createdAt: -1 }).lean();
        const campaigns = await ParasiteCampaign.find().sort({ createdAt: -1 }).lean();
        const activeBacklinks = backlinks.filter((b) => b.status === 'active').length;
        const publishedParasite = campaigns.filter((c) => c.status === 'published').length;
        const totalClicks =
            backlinks.reduce((s, b) => s + (b.clickCount || 0), 0) +
            campaigns.reduce((s, c) => s + (c.clickCount || 0), 0);
        res.render('admin/seo', {
            settings,
            backlinks,
            campaigns,
            stats: { activeBacklinks, publishedParasite, totalClicks },
            success: req.query.success,
            user: req.session.user,
        });
    } catch (err) {
        res.status(500).send('SEO admin error: ' + err.message);
    }
});

app.post('/admin/seo/settings', isAdmin, async (req, res) => {
    try {
        const settings = await getSiteSettings();
        const b = req.body;
        settings.siteName = b.siteName || settings.siteName;
        settings.defaultTitle = b.defaultTitle || settings.defaultTitle;
        settings.defaultDescription = b.defaultDescription || settings.defaultDescription;
        settings.defaultKeywords = b.defaultKeywords || settings.defaultKeywords;
        settings.homeTitle = b.homeTitle || '';
        settings.homeDescription = b.homeDescription || '';
        settings.canonicalBaseUrl = (b.canonicalBaseUrl || '').trim();
        settings.ogImage = b.ogImage || settings.ogImage;
        settings.twitterHandle = b.twitterHandle || settings.twitterHandle;
        settings.googleSiteVerification = b.googleSiteVerification || '';
        settings.bingSiteVerification = b.bingSiteVerification || '';
        settings.allowIndexing = b.allowIndexing === '1';
        settings.enableJsonLd = b.enableJsonLd === '1';
        settings.updatedAt = new Date();
        await settings.save();
        res.redirect('/admin/seo?success=On-page+SEO+settings+saved');
    } catch (err) {
        res.status(500).send('Save error: ' + err.message);
    }
});

app.post('/admin/seo/offpage', isAdmin, async (req, res) => {
    try {
        const settings = await getSiteSettings();
        settings.offPageChecklist = req.body.offPageChecklist || settings.offPageChecklist;
        settings.parasiteStrategy = req.body.parasiteStrategy || settings.parasiteStrategy;
        await settings.save();
        res.redirect('/admin/seo?success=Off-page+checklist+saved#offpage');
    } catch (err) {
        res.status(500).send('Save error: ' + err.message);
    }
});

app.post('/admin/seo/backlinks', isAdmin, async (req, res) => {
    try {
        const b = req.body;
        let slug = slugify(b.partnerName);
        const exists = await Backlink.findOne({ slug });
        if (exists) slug = `${slug}-${Date.now().toString(36)}`;
        await Backlink.create({
            partnerName: b.partnerName,
            targetUrl: b.targetUrl,
            anchorText: b.anchorText || b.partnerName,
            linkType: b.linkType || 'nofollow',
            direction: b.direction || 'outbound',
            status: b.status || 'pending',
            domainAuthority: Number(b.domainAuthority) || 0,
            notes: b.notes || '',
            showOnFooter: b.showOnFooter === '1',
            showOnResources: b.showOnResources === '1',
            slug,
        });
        res.redirect('/admin/seo?success=Backlink+added#backlinks');
    } catch (err) {
        res.status(500).send('Backlink error: ' + err.message);
    }
});

app.post('/admin/seo/backlinks/delete/:id', isAdmin, async (req, res) => {
    await Backlink.findByIdAndDelete(req.params.id);
    res.redirect('/admin/seo?success=Backlink+removed#backlinks');
});

app.post('/admin/seo/parasite', isAdmin, async (req, res) => {
    try {
        const b = req.body;
        await ParasiteCampaign.create({
            platform: b.platform,
            title: b.title,
            externalUrl: b.externalUrl || '',
            targetPage: b.targetPage || '/',
            anchorText: b.anchorText || '',
            utmSource: b.utmSource || '',
            utmMedium: 'parasite',
            utmCampaign: b.utmCampaign || slugify(b.title),
            status: b.status || 'draft',
            publishedAt: b.status === 'published' ? new Date() : undefined,
        });
        res.redirect('/admin/seo?success=Parasite+campaign+added#parasite');
    } catch (err) {
        res.status(500).send('Campaign error: ' + err.message);
    }
});

app.post('/admin/seo/parasite/delete/:id', isAdmin, async (req, res) => {
    await ParasiteCampaign.findByIdAndDelete(req.params.id);
    res.redirect('/admin/seo?success=Campaign+removed#parasite');
});

// ================= PUBLIC SEO =================
app.get('/robots.txt', async (req, res) => {
    const settings = await getSiteSettings();
    const baseUrl = getBaseUrl(req, settings);
    res.type('text/plain');
    res.send(buildRobotsTxt(baseUrl, settings.allowIndexing));
});

app.get('/sitemap.xml', async (req, res) => {
    const settings = await getSiteSettings();
    const baseUrl = getBaseUrl(req, settings);
    res.type('application/xml');
    res.send(await buildSitemapXml(baseUrl));
});

app.get('/resources', async (req, res) => {
    const backlinks = await Backlink.find({ status: 'active', showOnResources: true })
        .sort({ partnerName: 1 })
        .lean();
    res.render('resources', { backlinks, user: req.session.user || null });
});

app.get('/out/:slug', async (req, res) => {
    try {
        const bl = await Backlink.findOne({ slug: req.params.slug });
        if (!bl) return res.redirect('/');
        if (bl.trackClicks) {
            bl.clickCount = (bl.clickCount || 0) + 1;
            bl.lastCheckedAt = new Date();
            await bl.save();
        }
        res.redirect(302, bl.targetUrl);
    } catch {
        res.redirect('/');
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
        if (product) {
            req.session.lastViewedProduct = product.toObject();
            if (!req.session.viewedProductIds) req.session.viewedProductIds = [];
            const pid = product._id.toString();
            if (!req.session.viewedProductIds.includes(pid)) {
                req.session.viewedProductIds.push(pid);
            }
        }
        const settings = await getSiteSettings();
        const baseUrl = getBaseUrl(req, settings);
        const desc = product.metaDescription || (product.description || '').substring(0, 160);
        res.render('product-details', {
            product,
            seoTitle: product.metaTitle || `${product.name} | ${settings.siteName}`,
            seoDesc: desc,
            seoKeywords: product.keywords || settings.defaultKeywords,
            seoCanonical: `${baseUrl}/product/${product._id}`,
            seoOgType: 'product',
            seoJsonLd: settings.enableJsonLd
                ? buildProductJsonLd(product, baseUrl)
                : null,
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

// ================= AI SHOPPING AGENT =================
app.post('/api/chat', async (req, res) => {
    try {
        const message = (req.body.message || '').trim();
        if (!message) {
            return res.json({ type: 'text', reply: 'Please type a message.' });
        }
        const response = await handleChatMessage(message, req.session);
        return res.json(response);
    } catch (err) {
        console.error('Chat API Error:', err);
        res.json({ type: 'text', reply: 'Oops! I encountered an error. Please try again later.' });
    }
});

app.get('/api/chat/suggest', async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const suggestions = await getAutocomplete(q);
        res.json({ suggestions });
    } catch (err) {
        res.json({ suggestions: [] });
    }
});

app.post('/api/chat/cart/add/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.json({ success: false, message: 'Product not found' });
        if (!req.session.cart) req.session.cart = [];
        const doc = product.toObject();
        req.session.cart.push(doc);
        req.session.lastViewedProduct = doc;
        req.session.lastChatAt = new Date();
        res.json({
            success: true,
            message: `Added "${product.name}" to cart`,
            cartCount: req.session.cart.length,
        });
    } catch (err) {
        res.json({ success: false, message: 'Could not add to cart' });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));