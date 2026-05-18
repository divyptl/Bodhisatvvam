// ═══════════════════════════════════════════════════════════
//  Bodhisatvvam -- Backend Server v3 (Razorpay Integration)
//  New in this version:
//    ✅ POST /api/create-order  -- creates Razorpay order, returns order_id + key
//    ✅ POST /api/verify-payment -- verifies signature, then logs to Sheet + WhatsApp
//    ✅ Razorpay signature verification (HMAC-SHA256) -- prevents fake payment claims
//    ✅ All previous hardening retained (CORS, rate limit, validation, sanitized logs)
// ═══════════════════════════════════════════════════════════

const express   = require('express');
const axios     = require('axios');
const path      = require('path');
const fs        = require('fs');
const cors      = require('cors');
const crypto    = require('crypto'); // Built-in Node.js -- no install needed
const rateLimit = require('express-rate-limit');
const Razorpay  = require('razorpay');
const multer    = require('multer');

const app = express();

// Trust Render's proxy — required for express-rate-limit to work correctly
// Render sits behind a load balancer that sets X-Forwarded-For
app.set('trust proxy', 1);

// -- 1. ENV SAFETY CHECK -------------------------------------------
const REQUIRED_ENV = [
    'WHATSAPP_TOKEN',
    'PHONE_NUMBER_ID',
    'GOOGLE_SCRIPT_URL',
    'GOOGLE_SCRIPT_SECRET',
    'ALLOWED_ORIGIN',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
];

const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
    console.warn(`⚠️  Missing env vars: [${missingEnv.join(', ')}]. Related features disabled.`);
}

const WHATSAPP_TOKEN       = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID      = process.env.PHONE_NUMBER_ID;
const GOOGLE_SCRIPT_URL    = process.env.GOOGLE_SCRIPT_URL;
const GOOGLE_SCRIPT_SECRET = process.env.GOOGLE_SCRIPT_SECRET;
const ALLOWED_ORIGIN       = process.env.ALLOWED_ORIGIN || '*';
const RAZORPAY_KEY_ID      = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET  = process.env.RAZORPAY_KEY_SECRET;

// -- 2. RAZORPAY CLIENT ---------------------------------------------
const razorpay = (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET)
    ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
    : null;

// -- 3. MIDDLEWARE --------------------------------------------------------
// Supports single origin, comma-separated list, or * wildcard
const allowedOrigins = ALLOWED_ORIGIN === '*'
    ? ['*']
    : ALLOWED_ORIGIN.split(',').map(o => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes('*')) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, origin);
        callback(new Error('CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// -- 4. RATE LIMITERS -----------------------------------------------------
const orderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // slightly higher since create + verify = 2 calls per order
    message: { success: false, message: 'Too many requests. Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many login attempts. Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminSessions = new Set();

// -- 5. HELPERS -----------------------------------------------------------
const PRODUCTS_FILE = path.join(__dirname, 'public', 'data', 'products.json');
const PRODUCT_IMAGES_DIR = path.join(__dirname, 'public', 'images', 'products');

function readProducts() {
    try {
        if (!fs.existsSync(PRODUCTS_FILE)) return [];
        const raw = fs.readFileSync(PRODUCTS_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Could not read products.json:', err.message);
        return [];
    }
}

function writeProducts(products) {
    if (!fs.existsSync(path.dirname(PRODUCTS_FILE))) fs.mkdirSync(path.dirname(PRODUCTS_FILE), { recursive: true });
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
}

function generateOrderId() {
    const ts  = Date.now().toString(36).toUpperCase();
    const rnd = Math.floor(1000 + Math.random() * 9000);
    return `#BDH-${ts}-${rnd}`;
}

function validatePhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13;
}

function validateOrderInput({ name, phone, address, items, total }) {
    const errors = [];
    if (!name || typeof name !== 'string' || name.trim().length < 2)
        errors.push('Name must be at least 2 characters.');
    if (!validatePhone(phone))
        errors.push('Please provide a valid 10-digit phone number.');
    if (!address || typeof address !== 'string' || address.trim().length < 10)
        errors.push('Address must be at least 10 characters.');
    if (!items || (Array.isArray(items) && items.length === 0))
        errors.push('Order must contain at least one item.');
    const parsedTotal = parseFloat(String(total).replace(/[^0-9.]/g, ''));
    if (isNaN(parsedTotal) || parsedTotal <= 0)
        errors.push('Order total is invalid.');
    return errors;
}

function formatItemsForWhatsApp(items) {
    if (Array.isArray(items)) {
        return items.map(i => `- ${i.name} x${i.qty} @ Rs.${i.price}`).join('\n');
    }
    return String(items);
}

// Converts "₹1,599.00" or 1599 → integer paise (Razorpay uses paise)
function toPaise(total) {
    const num = parseFloat(String(total).replace(/[^0-9.]/g, ''));
    return Math.round(num * 100); // ₹599.00 → 59900 paise
}

async function pushToSheet(payload, attempt = 1) {
    if (!GOOGLE_SCRIPT_URL || !GOOGLE_SCRIPT_SECRET) return false;
    try {
        await axios.post(
            GOOGLE_SCRIPT_URL,
            { secret: GOOGLE_SCRIPT_SECRET, ...payload },
            { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
        );
        console.log(`✅ Sheet updated → ${payload.orderId}`);
        return true;
    } catch (err) {
        const status = err?.response?.status || 'no-response';
        console.error(`❌ Sheet error (attempt ${attempt}) → HTTP ${status}: ${err.message}`);
        // Retry once after 3 seconds if it timed out
        if (attempt === 1 && err.code === 'ECONNABORTED') {
            console.log(`   Retrying sheet update in 3s...`);
            await new Promise(r => setTimeout(r, 3000));
            return pushToSheet(payload, 2);
        }
        return false;
    }
}

async function sendWhatsApp(name, phone, orderId, items, total, address, customerNotes) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return;
    try {
        const body =
            `*Namaste ${name},* 🙏\n\n` +
            `Your payment was successful! ✨\n\n` +
            `*Order Confirmed (${orderId})*\n` +
            `--------------------------\n` +
            `${formatItemsForWhatsApp(items)}\n` +
            `--------------------------\n` +
            `*Total Paid:* ${total}\n` +
            `*Delivery to:* ${address}\n\n`; 

            if (customerNotes && customerNotes.trim() !== '') {
                    body += `*Notes:* ${customerNotes.split(' | ').join('\n')}\n\n`;
            }

        body += `We will dispatch your order shortly and keep you updated here.\n\n` +
            `_Empower Your Life_ 🌸\n` +
            `-- Shree Bodhisatvvam Team`;

        const waResponse = await axios.post(
            `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
            { messaging_product: 'whatsapp', to: phone.startsWith('+') ? phone : '+' + phone, type: 'text', text: { body } },
            { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        // Log the full Meta response so we can see exactly what happened
        console.log(`✅ WhatsApp sent → ${orderId}`);
        console.log(`   Meta response status : ${waResponse.status}`);
        console.log(`   Meta response data   : ${JSON.stringify(waResponse.data)}`);
        console.log(`   Sent to number       : ${phone}`);
        console.log(`   Phone Number ID used : ${PHONE_NUMBER_ID}`);
    } catch (err) {
        const code = err?.response?.data?.error?.code    || 'unknown';
        const type = err?.response?.data?.error?.type    || 'unknown';
        const msg  = err?.response?.data?.error?.message || err.message;
        console.error(`❌ WhatsApp error → Code ${code} [${type}]: ${msg}`);
        console.error(`   Full error response: ${JSON.stringify(err?.response?.data)}`);
        console.error(`   Attempted to send to: ${phone}`);
        console.error(`   Phone Number ID: ${PHONE_NUMBER_ID}`);
    }
}

// -- 6. ROUTE: CREATE RAZORPAY ORDER -------------------------------
// Called when customer clicks "Pay Now" -- before payment happens.
// Creates a Razorpay order and returns the order_id to the frontend.
app.post('/api/create-order', orderLimiter, async (req, res) => {
    const { name, phone, address, items, total, customerNotes} = req.body;

    const errors = validateOrderInput({ name, phone, address, items, total });
    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    if (!razorpay) {
        return res.status(503).json({ success: false, message: 'Payment system not configured. Please contact us on WhatsApp.' });
    }

    // Securely calculate total from server-side database
    const products = readProducts();
    let calculatedTotal = 0;
    if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Invalid items format.' });
    }
    
    for (const item of items) {
        const product = products.find(p => p.id === item.id);
        if (product) {
            calculatedTotal += product.price * (item.qty || 1);
            item.price = product.price; // Update client's payload with authoritative price
            item.name = product.name;   // Sanitize name
        } else {
            return res.status(400).json({ success: false, message: `Invalid product in cart: ${item.id}` });
        }
    }

    const bodhiOrderId = generateOrderId(); // Our internal ID
    const amountPaise  = Math.round(calculatedTotal * 100);

    console.log(`💳 Creating Razorpay order | ${bodhiOrderId} | ₹${amountPaise / 100} (Client total: ${total})`);

    try {
        const rzpOrder = await razorpay.orders.create({
            amount:   amountPaise,
            currency: 'INR',
            receipt:  bodhiOrderId, // Links Razorpay order to our ID
            notes: {
                customer_name:    name,
                customer_phone:   phone.replace(/\D/g, ''),
                delivery_address: address,
                bdh_order_id:     bodhiOrderId,
            },
        });

        console.log(`✅ Razorpay order created → ${rzpOrder.id}`);

        // Return everything the frontend Razorpay SDK needs
        return res.status(200).json({
            success:       true,
            razorpayOrderId: rzpOrder.id,     // rzp_order_xxx -- used by the JS SDK
            bodhiOrderId,                      // #BDH-xxx -- shown to customer
            amount:        amountPaise,
            currency:      'INR',
            keyId:         RAZORPAY_KEY_ID,   // Public key -- safe to send to frontend
            prefill: {
                name,
                contact: phone.replace(/\D/g, ''),
            },
        });

    } catch (err) {
        console.error(`❌ Razorpay order creation failed: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Could not initiate payment. Please try again.' });
    }
});

// -- 7. ROUTE: VERIFY PAYMENT + FULFIL ORDER ------------------
// Called AFTER Razorpay payment succeeds on the frontend.
// Verifies the HMAC signature (proves payment is real), then logs + notifies.
app.post('/api/verify-payment', orderLimiter, async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        // Order details (sent again so we can log them)
        bodhiOrderId,
        name,
        phone,
        address,
        items,
        total,
        customerNotes
    } = req.body;

    // 7a. Verify Razorpay HMAC signature
    // This is the critical security step -- without it anyone could fake a payment
    const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

    if (expectedSignature !== razorpay_signature) {
        console.error(`❌ Signature mismatch for ${bodhiOrderId} -- possible fraud attempt`);
        return res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }

    console.log(`✅ Payment verified → ${bodhiOrderId} | Razorpay: ${razorpay_payment_id}`);

    const sanitizedPhone = phone.replace(/\D/g, '');

    // 7b. Log to Google Sheet (status = "Paid")
    await pushToSheet({
        orderId: bodhiOrderId,
        name,
        phone:   sanitizedPhone,
        address,
        items,
        total,
        status:  'Paid', // Override default "New Order" since payment is confirmed
        paymentId: razorpay_payment_id,
        notes: customerNotes || ''
    });

    // 7c. Send WhatsApp confirmation
    await sendWhatsApp(name, sanitizedPhone, bodhiOrderId, items, total, address, customerNotes);

    // 7d. Return success to frontend
    return res.status(200).json({
        success: true,
        orderId: bodhiOrderId,
        message: 'Payment confirmed! Order placed successfully.',
    });
});


// ═══════════════════════════════════════════════════════════
//  BOOKING SYSTEM ROUTES
// ═══════════════════════════════════════════════════════════

// ── GET: Fetch booked slots ───────────────────────────────
app.get('/api/bookings/slots', async (req, res) => {
    if (!GOOGLE_SCRIPT_URL || !GOOGLE_SCRIPT_SECRET) {
        return res.status(200).json({ success: true, slots: {} });
    }
    try {
        const response = await axios.get(
            `${GOOGLE_SCRIPT_URL}?action=getBookedSlots`,
            { timeout: 15000 }
        );
        return res.status(200).json({ success: true, slots: response.data.slots || {} });
    } catch (err) {
        console.error('Fetch slots error:', err.message);
        return res.status(200).json({ success: true, slots: {} });
    }
});

// ── POST: Create Razorpay order for booking ───────────────
app.post('/api/create-booking', orderLimiter, async (req, res) => {
    const { name, phone, sessionName, sessionId, date, slot, price } = req.body;
    if (!name || !phone || !sessionId || !date || !slot || !price)
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    if (!razorpay)
        return res.status(503).json({ success: false, message: 'Payment system not configured.' });

    const bookingId   = '#BDHB-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
    const amountPaise = Math.round(price * 100);
    console.log(`📅 Creating booking | ${bookingId} | ${sessionName} | ${date} ${slot}`);

    try {
        const rzpOrder = await razorpay.orders.create({
            amount: amountPaise, currency: 'INR', receipt: bookingId,
            notes: { customer_name: name, session: sessionName, date, slot },
        });
        return res.status(200).json({
            success: true, razorpayOrderId: rzpOrder.id,
            bookingId, amount: amountPaise, currency: 'INR', keyId: RAZORPAY_KEY_ID,
        });
    } catch (err) {
        console.error('Booking Razorpay error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not initiate payment.' });
    }
});

// ── POST: Verify payment + confirm booking ────────────────
app.post('/api/verify-booking', orderLimiter, async (req, res) => {
    const {
        razorpay_order_id, razorpay_payment_id, razorpay_signature,
        bookingId, name, phone, email, notes,
        sessionId, sessionName, date, slot, price,
    } = req.body;

    const expectedSig = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

    if (expectedSig !== razorpay_signature) {
        console.error(`Booking signature mismatch -- ${bookingId}`);
        return res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }

    console.log(`✅ Booking verified --> ${bookingId}`);
    const sanitizedPhone = phone.replace(/\D/g, '');

    // Log to Google Sheet
    if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_SECRET) {
        try {
            await axios.post(GOOGLE_SCRIPT_URL, {
                secret: GOOGLE_SCRIPT_SECRET, action: 'addBooking',
                bookingId, name, phone: sanitizedPhone, email: email || '',
                sessionId, sessionName, date, slot,
                total: 'Rs.' + price, notes: notes || '',
                paymentId: razorpay_payment_id, status: 'Confirmed',
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 });
            console.log(`✅ Booking logged --> ${bookingId}`);
        } catch (err) {
            console.error(`Booking sheet error: ${err.message}`);
        }
    }

    // WhatsApp to customer
    if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
        const toNum = '+' + sanitizedPhone;
        try {
            const customerMsg =
                `*Namaste ${name},* 🙏\n\n` +
                `Your healing session is confirmed! ✨\n\n` +
                `*Booking ID:* ${bookingId}\n` +
                `*Session:* ${sessionName}\n` +
                `*Date:* ${date}\n` +
                `*Time:* ${slot} IST\n` +
                `*Mode:* Online Video Call\n` +
                `*Paid:* Rs.${price}\n\n` +
                `Neepa will send you the video call link at least 15 minutes before your session.\n\n` +
                `_Empower Your Life_ 🌸\n-- Shree Bodhisatvvam`;
            await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
                { messaging_product: 'whatsapp', to: toNum, type: 'text', text: { body: customerMsg } },
                { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
            );
            console.log(`✅ Customer WA sent --> ${bookingId}`);
        } catch (err) { console.error(`Customer WA error: ${err.message}`); }

        // WhatsApp to Neepa
        try {
            const neepaPhone = '+' + (process.env.NEEPA_WHATSAPP || '919737171090').replace(/\D/g, '');
            const neepaMsg =
                `*New Booking!* 📅\n\n` +
                `*ID:* ${bookingId}\n` +
                `*Session:* ${sessionName}\n` +
                `*Customer:* ${name} (+${sanitizedPhone})\n` +
                `*Date:* ${date} at ${slot} IST\n` +
                `*Paid:* Rs.${price}\n` +
                (notes ? `*Notes:* ${notes}` : '') +
                `\n\nPlease send the video call link to the customer before the session.`;
            await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
                { messaging_product: 'whatsapp', to: neepaPhone, type: 'text', text: { body: neepaMsg } },
                { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
            );
            console.log(`✅ Neepa WA sent --> ${bookingId}`);
        } catch (err) { console.error(`Neepa WA error: ${err.message}`); }
    }

    return res.status(200).json({ success: true, bookingId, message: 'Booking confirmed!' });
});


// ── ADMIN: Login validation ────────────────────────────────
app.post('/api/admin/login', adminLimiter, (req, res) => {
    const { password } = req.body;
    const ADMIN_PASS = process.env.ADMIN_PASS;
    
    if (!ADMIN_PASS || !password) {
        return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    // Prevent timing attacks
    const expectedBuf = crypto.createHash('sha256').update(ADMIN_PASS).digest();
    const providedBuf = crypto.createHash('sha256').update(password).digest();
    
    if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }
    
    // Generate secure session token
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.add(token);

    return res.status(200).json({ success: true, message: 'Login successful.', token });
});

// Middleware for Admin routes
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else {
        token = req.body.token || req.headers['x-admin-token'];
    }
    
    if (!token || !adminSessions.has(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized session.' });
    }
    next();
}

// ── ADMIN: Fetch orders (proxies Google Sheet) ────────────
app.post('/api/admin/orders', requireAdmin, async (req, res) => {
    if (!GOOGLE_SCRIPT_URL) {
        return res.status(503).json({ success: false, message: 'Google Script not configured.' });
    }

    try {
        const response = await axios.get(
            `${GOOGLE_SCRIPT_URL}?action=getOrders`,
            { timeout: 25000 }
        );
        return res.status(200).json(response.data);
    } catch (err) {
        console.error('Admin orders fetch error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not fetch orders.' });
    }
});
// ── ADMIN: Fetch bookings (proxies Google Sheet) ────────────
app.post('/api/admin/bookings', requireAdmin, async (req, res) => {
    if (!GOOGLE_SCRIPT_URL) {
        return res.status(503).json({ success: false, message: 'Google Script not configured.' });
    }

    try {
        const response = await axios.get(
            `${GOOGLE_SCRIPT_URL}?action=getBookings`,
            { timeout: 25000 }
        );
        return res.status(200).json(response.data);
    } catch (err) {
        console.error('Admin bookings fetch error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not fetch bookings.' });
    }
});

// ── ADMIN: Update order status ────────────────────────────
app.post('/api/admin/update-status', requireAdmin, async (req, res) => {
    const { orderId, status } = req.body;

    const validStatuses = ['New Order', 'Paid', 'Dispatched', 'Delivered', 'Cancelled'];
    if (!orderId || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid order ID or status.' });
    }

    if (!GOOGLE_SCRIPT_URL || !GOOGLE_SCRIPT_SECRET) {
        return res.status(503).json({ success: false, message: 'Google Script not configured.' });
    }

    try {
        const response = await axios.post(
            GOOGLE_SCRIPT_URL,
            { secret: GOOGLE_SCRIPT_SECRET, action: 'updateStatus', orderId, status },
            { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
        );
        console.log(`✅ Status updated → ${orderId} : ${status}`);
        return res.status(200).json(response.data);
    } catch (err) {
        console.error('Status update error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not update status.' });
    }
});

// ═══════════════════════════════════════════════════════════
//  PRODUCT MANAGEMENT SYSTEM
//  All product data lives in public/data/products.json
//  Admin can Add / Edit / Delete products + upload images
// ═══════════════════════════════════════════════════════════

// Ensure directories exist
if (!fs.existsSync(path.dirname(PRODUCTS_FILE))) fs.mkdirSync(path.dirname(PRODUCTS_FILE), { recursive: true });
if (!fs.existsSync(PRODUCT_IMAGES_DIR)) fs.mkdirSync(PRODUCT_IMAGES_DIR, { recursive: true });

// Helper: generate next ID for a given category prefix
function generateProductId(category) {
    const products = readProducts();
    const prefixes = { salts: 100, healing: 200, candles: 300 };
    const base = prefixes[category] || 400;
    const categoryProducts = products.filter(p => p.id >= base && p.id < base + 100 && p.id !== 1000);
    if (categoryProducts.length === 0) return base + 1;
    const maxId = Math.max(...categoryProducts.map(p => p.id));
    return maxId + 1;
}

// ── Multer setup for product image uploads ──
const productImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const productId = req.params.id || req.body.productId;
        const dir = path.join(PRODUCT_IMAGES_DIR, String(productId));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeName = Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000) + ext;
        cb(null, safeName);
    },
});
const uploadProductImage = multer({
    storage: productImageStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Only image files (jpg, png, webp, gif) are allowed.'));
    },
});

// ── GET: Fetch all products (public — used by storefront) ──
app.get('/api/products', (req, res) => {
    const products = readProducts();
    res.status(200).json({ success: true, products });
});

// ── POST: Add a new product (admin only) ──
app.post('/api/admin/products/add', requireAdmin, (req, res) => {
    const { name, category, desc, price, rating, emoji, badge } = req.body;
    if (!name || !category || price === undefined) {
        return res.status(400).json({ success: false, message: 'Name, category, and price are required.' });
    }

    const products = readProducts();
    const newProduct = {
        id: req.body.id || generateProductId(category),
        name: name.trim(),
        emoji: emoji || (category === 'salts' ? '🧂' : category === 'candles' ? '🕯️' : '✨'),
        category: category.toLowerCase(),
        desc: (desc || '').trim() || `Energy-infused ${category === 'salts' ? 'salt' : category === 'candles' ? 'candle' : 'session'}.`,
        price: parseFloat(price),
        rating: parseInt(rating) || 5,
        badge: badge || '',
        images: [],
    };

    // Ensure no duplicate ID
    if (products.find(p => p.id === newProduct.id)) {
        return res.status(409).json({ success: false, message: `Product with ID ${newProduct.id} already exists.` });
    }

    products.push(newProduct);
    writeProducts(products);

    // Create image directory
    const imgDir = path.join(PRODUCT_IMAGES_DIR, String(newProduct.id));
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    console.log(`✅ Product added: ${newProduct.name} (ID: ${newProduct.id})`);
    res.status(201).json({ success: true, product: newProduct });
});

// ── POST: Edit an existing product (admin only) ──
app.post('/api/admin/products/edit', requireAdmin, (req, res) => {
    const { id, name, category, desc, price, rating, emoji, badge } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Product ID is required.' });

    const products = readProducts();
    const idx = products.findIndex(p => p.id === parseInt(id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Product not found.' });

    // Only update fields that are provided
    if (name !== undefined)     products[idx].name     = name.trim();
    if (category !== undefined) products[idx].category = category.toLowerCase();
    if (desc !== undefined)     products[idx].desc     = desc.trim();
    if (price !== undefined)    products[idx].price    = parseFloat(price);
    if (rating !== undefined)   products[idx].rating   = parseInt(rating);
    if (emoji !== undefined)    products[idx].emoji    = emoji;
    if (badge !== undefined)    products[idx].badge    = badge;

    writeProducts(products);
    console.log(`✅ Product updated: ${products[idx].name} (ID: ${id})`);
    res.status(200).json({ success: true, product: products[idx] });
});

// ── POST: Delete a product (admin only) ──
app.post('/api/admin/products/delete', requireAdmin, (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Product ID is required.' });

    let products = readProducts();
    const product = products.find(p => p.id === parseInt(id));
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    products = products.filter(p => p.id !== parseInt(id));
    writeProducts(products);

    console.log(`🗑️ Product deleted: ${product.name} (ID: ${id})`);
    res.status(200).json({ success: true, message: `"${product.name}" has been deleted.` });
});

// ── POST: Upload image(s) for a product (admin only) ──
app.post('/api/admin/products/:id/upload-image',
    requireAdmin,
    uploadProductImage.array('images', 5),
    (req, res) => {
        const productId = parseInt(req.params.id);
        const products = readProducts();
        const product = products.find(p => p.id === productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

        const uploadedPaths = req.files.map(f => `/images/products/${productId}/${f.filename}`);
        product.images = [...(product.images || []), ...uploadedPaths];
        writeProducts(products);

        console.log(`📸 ${uploadedPaths.length} image(s) uploaded for product ${productId}`);
        res.status(200).json({ success: true, images: product.images });
    }
);

// ── POST: Delete a specific image from a product (admin only) ──
app.post('/api/admin/products/:id/delete-image', requireAdmin, (req, res) => {
    const productId = parseInt(req.params.id);
    const { imagePath } = req.body;
    if (!imagePath) return res.status(400).json({ success: false, message: 'Image path is required.' });

    const products = readProducts();
    const product = products.find(p => p.id === productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    // Path traversal fix
    const fullPath = path.resolve(path.join(__dirname, 'public', imagePath));
    const expectedDir = path.resolve(PRODUCT_IMAGES_DIR);
    if (!fullPath.startsWith(expectedDir)) {
        return res.status(403).json({ success: false, message: 'Invalid path.' });
    }

    // Remove from product images array
    product.images = (product.images || []).filter(img => img !== imagePath);
    writeProducts(products);

    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`🗑️ Image deleted: ${imagePath}`);
    }

    res.status(200).json({ success: true, images: product.images });
});

// ── POST: Bulk update prices (admin only) ──
app.post('/api/admin/products/bulk-update-price', requireAdmin, (req, res) => {
    const { updates } = req.body; // Array of { id, price }
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ success: false, message: 'Updates array is required.' });
    }

    const products = readProducts();
    let updatedCount = 0;
    updates.forEach(({ id, price }) => {
        const product = products.find(p => p.id === parseInt(id));
        if (product && price !== undefined) {
            product.price = parseFloat(price);
            updatedCount++;
        }
    });
    writeProducts(products);

    console.log(`✅ Bulk price update: ${updatedCount} products updated`);
    res.status(200).json({ success: true, message: `${updatedCount} product(s) updated.` });
});



// -- FREE CONSULTATION BOOKING (no payment needed) ------------------
app.post('/api/book-free', orderLimiter, async (req, res) => {
    const { sessionId, sessionName, date, slot, name, phone, email, notes } = req.body;

    if (!sessionId || !date || !slot || !name || !phone) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const bookingId = 'BDH-FREE-' + Date.now().toString(36).toUpperCase();
    const timestamp = new Date().toISOString();

    try {
        // Log to Google Sheet
        if (GOOGLE_SCRIPT_URL) {
            await axios.post(GOOGLE_SCRIPT_URL, {
                secret: GOOGLE_SCRIPT_SECRET,
                type: 'booking',
                bookingId, sessionName, date, slot,
                name, phone, email, notes,
                price: '0 (Free Consultation)', timestamp,
            }).catch(e => console.warn('Sheet log failed:', e.message));
        }

        // WhatsApp notification to admin
        if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
            const msg = `🎁 *New Free Consultation Request*\n\n📋 *ID:* ${bookingId}\n👤 *Name:* ${name}\n📱 *Phone:* +${phone}\n📅 *Date:* ${date}\n⏰ *Time:* ${slot}\n📝 *Notes:* ${notes || 'None'}`;
            await axios.post(
                `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
                { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: msg } },
                { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
            ).catch(e => console.warn('WhatsApp notification failed:', e.message));
        }

        console.log(`✅ Free consultation booked: ${bookingId} for ${name} on ${date} at ${slot}`);
        return res.status(200).json({ success: true, bookingId, message: 'Free consultation confirmed!' });

    } catch (err) {
        console.error('book-free error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error. Please try WhatsApp.' });
    }
});


// -- 8. HEALTH CHECK ------------------------------------------------------

app.get('/health', (req, res) => {
    res.status(200).json({
        status:    'ok',
        service:   'Bodhisatvvam Backend',
        timestamp: new Date().toISOString(),
        env: {
            whatsapp:    !!WHATSAPP_TOKEN,
            googleSheet: !!GOOGLE_SCRIPT_URL,
            razorpay:    !!razorpay,
            cors:        ALLOWED_ORIGIN,
        },
    });
});

// -- 9. START -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌸 Bodhisatvvam server running on port ${PORT}`);
    console.log(`   Razorpay  : ${razorpay    ? '✅ configured' : '❌ not set'}`);
    console.log(`   WhatsApp  : ${WHATSAPP_TOKEN ? '✅ configured' : '❌ not set'}`);
    console.log(`   Sheet     : ${GOOGLE_SCRIPT_URL ? '✅ configured' : '❌ not set'}`);
    console.log(`   CORS      : ${ALLOWED_ORIGIN}`);
});
