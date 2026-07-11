// ═══════════════════════════════════════════════════════════
//  Bodhisatvvam -- Backend Server v4 (Cashfree Integration)
//  New in this version:
//    ✅ POST /api/create-order  -- creates Cashfree order, returns payment_session_id
//    ✅ POST /api/verify-payment -- fetches order status from Cashfree to confirm payment
//    ✅ GET  /api/payment-return -- handles redirect after Cashfree checkout
//    ✅ All previous hardening retained (CORS, rate limit, validation, sanitized logs)
// ═══════════════════════════════════════════════════════════

const express   = require('express');
const axios     = require('axios');
const path      = require('path');
const fs        = require('fs');
const cors      = require('cors');
const crypto    = require('crypto'); // Built-in Node.js -- no install needed
const rateLimit = require('express-rate-limit');
const { Cashfree } = require('cashfree-pg');
const multer    = require('multer');
const helmet    = require('helmet');
const sbSync    = require('./supabase-sync');

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
    'CASHFREE_APP_ID',
    'CASHFREE_SECRET_KEY',
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
const CASHFREE_APP_ID      = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY  = process.env.CASHFREE_SECRET_KEY;

// -- 2. CASHFREE CLIENT ----------------------------------------------
// Cashfree uses static class properties — no instance needed
let cashfreeConfigured = false;
if (CASHFREE_APP_ID && CASHFREE_SECRET_KEY) {
    Cashfree.XClientId     = CASHFREE_APP_ID;
    Cashfree.XClientSecret = CASHFREE_SECRET_KEY;
    // Use SANDBOX for testing, switch to PRODUCTION when live keys are ready
    Cashfree.XEnvironment  = (process.env.CASHFREE_ENV === 'PRODUCTION')
        ? Cashfree.Environment.PRODUCTION
        : Cashfree.Environment.SANDBOX;
    cashfreeConfigured = true;
}

// -- 3. MIDDLEWARE --------------------------------------------------------
// Supports single origin, comma-separated list, or * wildcard
const allowedOrigins = ALLOWED_ORIGIN === '*'
    ? ['*']
    : ALLOWED_ORIGIN.split(',').map(o => o.trim());

// Helmet — sets secure HTTP headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet({
    contentSecurityPolicy: false,  // Disabled because inline scripts are used in HTML
    crossOriginEmbedderPolicy: false, // Allow Cashfree & external embeds
}));

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes('*')) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, origin);
        callback(new Error('CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
    credentials: false,
}));
app.use(express.json({ limit: '100kb' }));
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

const customerAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { success: false, message: 'Too many attempts. Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminSessions = new Set();

// -- 5. HELPERS -----------------------------------------------------------
const PRODUCTS_FILE = path.join(__dirname, 'public', 'data', 'products.json');
const CATEGORIES_FILE = path.join(__dirname, 'public', 'data', 'categories.json');
const SITE_CONTENT_FILE = path.join(__dirname, 'public', 'data', 'site-content.json');
const CUSTOMERS_FILE = path.join(__dirname, 'data', 'customers.json');
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

// Converts "₹1,599.00" or 1599 → float (Cashfree uses rupees, not paise)
function toRupees(total) {
    return parseFloat(String(total).replace(/[^0-9.]/g, ''));
}

// In-memory map to store pending order data between create → verify
// Key: bodhiOrderId, Value: { name, phone, address, items, total, customerNotes, cfOrderId }
const pendingOrders = new Map();
// Auto-cleanup after 30 minutes
setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [key, val] of pendingOrders) {
        if (val._created < cutoff) pendingOrders.delete(key);
    }
}, 10 * 60 * 1000);

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
        let body =
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

// -- 6. ROUTE: CREATE CASHFREE ORDER -------------------------------
// Called when customer clicks "Pay Now" -- before payment happens.
// Creates a Cashfree order and returns payment_session_id to the frontend.
app.post('/api/create-order', orderLimiter, async (req, res) => {
    const { name, phone, address, items, total, customerNotes} = req.body;

    const errors = validateOrderInput({ name, phone, address, items, total });
    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    if (!cashfreeConfigured) {
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
    const sanitizedPhone = phone.replace(/\D/g, '');
    const returnUrl = `${ALLOWED_ORIGIN === '*' ? 'https://bodhisatvvam.onrender.com' : ALLOWED_ORIGIN}/api/payment-return?order_id=${bodhiOrderId}`;

    console.log(`💳 Creating Cashfree order | ${bodhiOrderId} | ₹${calculatedTotal} (Client total: ${total})`);

    try {
        const cfRequest = {
            order_amount:   calculatedTotal,
            order_currency: 'INR',
            order_id:       bodhiOrderId,
            customer_details: {
                customer_id:    sanitizedPhone,  // Use phone as unique customer ID
                customer_phone: sanitizedPhone,
                customer_name:  name,
            },
            order_meta: {
                return_url: returnUrl,
            },
            order_note: `Bodhisatvvam order ${bodhiOrderId}`,
        };

        const cfResponse = await Cashfree.PGCreateOrder(cfRequest);
        const cfOrder = cfResponse.data;

        console.log(`✅ Cashfree order created → ${cfOrder.cf_order_id}`);

        // Store order data so verify-payment can access it later
        pendingOrders.set(bodhiOrderId, {
            name, phone: sanitizedPhone, address, items, total,
            customerNotes: customerNotes || '',
            cfOrderId: cfOrder.cf_order_id,
            _created: Date.now(),
        });

        // Return everything the frontend Cashfree SDK needs
        return res.status(200).json({
            success:          true,
            paymentSessionId: cfOrder.payment_session_id,
            bodhiOrderId,
            cfOrderId:        cfOrder.cf_order_id,
            amount:           calculatedTotal,
            currency:         'INR',
        });

    } catch (err) {
        const errMsg = err?.response?.data?.message || err.message;
        console.error(`❌ Cashfree order creation failed: ${errMsg}`);
        return res.status(500).json({ success: false, message: 'Could not initiate payment. Please try again.' });
    }
});

// -- 7. ROUTE: VERIFY PAYMENT + FULFIL ORDER ------------------
// Called AFTER Cashfree payment completes (redirect or frontend poll).
// Fetches order status from Cashfree API to confirm payment is real.
app.post('/api/verify-payment', orderLimiter, async (req, res) => {
    const { bodhiOrderId } = req.body;

    if (!bodhiOrderId) {
        return res.status(400).json({ success: false, message: 'Missing order ID.' });
    }

    if (!cashfreeConfigured) {
        return res.status(503).json({ success: false, message: 'Payment system not configured.' });
    }

    try {
        // 7a. Fetch order status from Cashfree (server-to-server — cannot be faked)
        const cfResponse = await Cashfree.PGFetchOrder(bodhiOrderId);
        const cfOrder = cfResponse.data;

        if (cfOrder.order_status !== 'PAID') {
            console.error(`❌ Payment not completed for ${bodhiOrderId} — status: ${cfOrder.order_status}`);
            return res.status(400).json({ success: false, message: `Payment status: ${cfOrder.order_status}. Please try again.` });
        }

        // 7b. Get stored order data
        const orderData = pendingOrders.get(bodhiOrderId);
        if (!orderData) {
            console.warn(`⚠️ Order data not found in memory for ${bodhiOrderId} — payment was valid but data expired`);
            return res.status(200).json({ success: true, orderId: bodhiOrderId, message: 'Payment confirmed! Please WhatsApp us if you do not receive confirmation.' });
        }

        const { name, phone, address, items, total, customerNotes } = orderData;
        const paymentId = cfOrder.cf_order_id || bodhiOrderId;

        console.log(`✅ Payment verified → ${bodhiOrderId} | Cashfree: ${paymentId}`);

        // 7c. Log to Google Sheet (status = "Paid")
        await pushToSheet({
            orderId: bodhiOrderId, name, phone, address, items, total,
            status: 'Paid', paymentId, notes: customerNotes
        });

        // 7d. Send WhatsApp confirmation
        await sendWhatsApp(name, phone, bodhiOrderId, items, total, address, customerNotes);

        // 7e. Save order to Supabase (non-blocking)
        sbSync.saveOrder({
            order_id: bodhiOrderId, name, phone,
            address, items, total: parseFloat(String(total).replace(/[^0-9.]/g, '')),
            status: 'Paid', payment_id: paymentId,
            customer_notes: customerNotes
        });

        // Cleanup
        pendingOrders.delete(bodhiOrderId);

        // 7f. Return success to frontend
        return res.status(200).json({
            success: true,
            orderId: bodhiOrderId,
            message: 'Payment confirmed! Order placed successfully.',
        });

    } catch (err) {
        const errMsg = err?.response?.data?.message || err.message;
        console.error(`❌ Payment verification failed for ${bodhiOrderId}: ${errMsg}`);
        return res.status(500).json({ success: false, message: 'Payment verification failed. Please contact us.' });
    }
});

// -- 7b. ROUTE: PAYMENT RETURN URL (GET) ------------------
// Cashfree redirects here after checkout; we verify then redirect to success page
app.get('/api/payment-return', async (req, res) => {
    const orderId = req.query.order_id;
    if (!orderId || !cashfreeConfigured) {
        return res.redirect('/?payment=error');
    }
    try {
        const cfResponse = await Cashfree.PGFetchOrder(orderId);
        if (cfResponse.data.order_status === 'PAID') {
            return res.redirect(`/?payment=success&orderId=${encodeURIComponent(orderId)}`);
        }
        return res.redirect(`/?payment=failed&orderId=${encodeURIComponent(orderId)}`);
    } catch {
        return res.redirect(`/?payment=error&orderId=${encodeURIComponent(orderId)}`);
    }
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

// ── POST: Create Cashfree order for booking ───────────────
app.post('/api/create-booking', orderLimiter, async (req, res) => {
    const { name, phone, sessionName, sessionId, date, slot, price } = req.body;
    if (!name || !phone || !sessionId || !date || !slot || !price)
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    if (!cashfreeConfigured)
        return res.status(503).json({ success: false, message: 'Payment system not configured.' });

    const bookingId   = '#BDHB-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
    const sanitizedPhone = phone.replace(/\D/g, '');
    const returnUrl = `${ALLOWED_ORIGIN === '*' ? 'https://bodhisatvvam.onrender.com' : ALLOWED_ORIGIN}/booking.html?payment=success&bookingId=${encodeURIComponent(bookingId)}`;
    console.log(`📅 Creating booking | ${bookingId} | ${sessionName} | ${date} ${slot}`);

    try {
        const cfRequest = {
            order_amount:   price,
            order_currency: 'INR',
            order_id:       bookingId,
            customer_details: {
                customer_id:    sanitizedPhone,
                customer_phone: sanitizedPhone,
                customer_name:  name,
            },
            order_meta: {
                return_url: returnUrl,
            },
            order_note: `Booking: ${sessionName} on ${date} at ${slot}`,
        };

        const cfResponse = await Cashfree.PGCreateOrder(cfRequest);
        const cfOrder = cfResponse.data;

        // Store booking data for verification step
        pendingOrders.set(bookingId, {
            name, phone: sanitizedPhone, sessionId, sessionName,
            date, slot, price, email: req.body.email || '', notes: req.body.notes || '',
            _created: Date.now(),
        });

        return res.status(200).json({
            success: true, paymentSessionId: cfOrder.payment_session_id,
            bookingId, amount: price, currency: 'INR',
        });
    } catch (err) {
        const errMsg = err?.response?.data?.message || err.message;
        console.error('Booking Cashfree error:', errMsg);
        return res.status(500).json({ success: false, message: 'Could not initiate payment.' });
    }
});

// ── POST: Verify payment + confirm booking ────────────────
app.post('/api/verify-booking', orderLimiter, async (req, res) => {
    const { bookingId } = req.body;

    if (!bookingId || !cashfreeConfigured) {
        return res.status(400).json({ success: false, message: 'Missing booking ID or payment not configured.' });
    }

    try {
        // Fetch order status from Cashfree
        const cfResponse = await Cashfree.PGFetchOrder(bookingId);
        const cfOrder = cfResponse.data;

        if (cfOrder.order_status !== 'PAID') {
            console.error(`Booking payment not completed -- ${bookingId} — status: ${cfOrder.order_status}`);
            return res.status(400).json({ success: false, message: 'Payment verification failed.' });
        }

        // Get stored booking data
        const bookingData = pendingOrders.get(bookingId);
        if (!bookingData) {
            return res.status(200).json({ success: true, bookingId, message: 'Payment confirmed! Please WhatsApp us if you do not receive confirmation.' });
        }

        const { name, phone: sanitizedPhone, email, notes, sessionId, sessionName, date, slot, price } = bookingData;
        const paymentId = cfOrder.cf_order_id || bookingId;

        console.log(`✅ Booking verified --> ${bookingId}`);

        // Log to Google Sheet
        if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_SECRET) {
            try {
                await axios.post(GOOGLE_SCRIPT_URL, {
                    secret: GOOGLE_SCRIPT_SECRET, action: 'addBooking',
                    bookingId, name, phone: sanitizedPhone, email: email || '',
                    sessionId, sessionName, date, slot,
                    total: 'Rs.' + price, notes: notes || '',
                    paymentId, status: 'Confirmed',
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

        // Save booking to Supabase (non-blocking)
        sbSync.saveBooking({
            booking_id: bookingId, name, phone: sanitizedPhone,
            email: email || '', session_name: sessionName,
            date, time_slot: slot, price, payment_id: paymentId,
            notes: notes || ''
        });

        // Cleanup
        pendingOrders.delete(bookingId);

        return res.status(200).json({ success: true, bookingId, message: 'Booking confirmed!' });
    } catch (err) {
        const errMsg = err?.response?.data?.message || err.message;
        console.error(`Booking verification failed for ${bookingId}: ${errMsg}`);
        return res.status(500).json({ success: false, message: 'Payment verification failed. Please contact us.' });
    }
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

        // Trigger review request when order is delivered
        if (status === 'Delivered') {
            generateReviewTokens(orderId).catch(e => console.warn('Review generation failed:', e.message));
        }

        // Update Supabase order status too
        if (sbSync.supabase) {
            sbSync.supabase.from('orders').update({ status }).eq('order_id', orderId).then(() => {}).catch(() => {});
        }

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

// ── Category & Site Content helpers ────────────────────────
function readCategories() {
    try {
        if (!fs.existsSync(CATEGORIES_FILE)) return [];
        const raw = fs.readFileSync(CATEGORIES_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Could not read categories.json:', err.message);
        return [];
    }
}

function writeCategories(cats) {
    if (!fs.existsSync(path.dirname(CATEGORIES_FILE))) fs.mkdirSync(path.dirname(CATEGORIES_FILE), { recursive: true });
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(cats, null, 2), 'utf-8');
}

function readSiteContent() {
    try {
        if (!fs.existsSync(SITE_CONTENT_FILE)) return {};
        const raw = fs.readFileSync(SITE_CONTENT_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Could not read site-content.json:', err.message);
        return {};
    }
}

function writeSiteContent(content) {
    if (!fs.existsSync(path.dirname(SITE_CONTENT_FILE))) fs.mkdirSync(path.dirname(SITE_CONTENT_FILE), { recursive: true });
    fs.writeFileSync(SITE_CONTENT_FILE, JSON.stringify(content, null, 2), 'utf-8');
}

function readCustomers() {
    try {
        if (!fs.existsSync(CUSTOMERS_FILE)) return [];
        return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf-8'));
    } catch (e) { return []; }
}

function writeCustomers(customers) {
    if (!fs.existsSync(path.dirname(CUSTOMERS_FILE))) fs.mkdirSync(path.dirname(CUSTOMERS_FILE), { recursive: true });
    fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(customers, null, 2), 'utf-8');
}

// ── Customer Auth Helpers (Crypto) ───────────
const AUTH_SECRET = process.env.ADMIN_PASS || 'default-secret-change-me';

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    // Timing-safe comparison to prevent timing attacks on password hashes
    try {
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(key, 'hex'));
    } catch (e) {
        return false;
    }
}

function generateCustomerToken(phone) {
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    const payload = `${phone}.${expires}`;
    const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
    return `${payload}.${sig}`;
}

function verifyCustomerToken(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Missing token' });
    const token = auth.split(' ')[1];
    const [phone, expires, sig] = token.split('.');
    if (!phone || !expires || !sig) return res.status(401).json({ success: false, message: 'Invalid token' });
    if (Date.now() > parseInt(expires)) return res.status(401).json({ success: false, message: 'Token expired' });
    
    const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(`${phone}.${expires}`).digest('hex');
    if (sig !== expectedSig) return res.status(401).json({ success: false, message: 'Signature mismatch' });
    
    req.customerPhone = phone;
    next();
}

// Helper: generate next ID for a given category prefix (dynamic from categories.json)
function generateProductId(category) {
    const products = readProducts();
    const categories = readCategories();
    const cat = categories.find(c => c.id === category);
    const base = cat ? cat.idPrefix : 400;
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
    sbSync.syncProduct(newProduct); // Background sync to Supabase

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
    sbSync.syncProduct(products[idx]); // Background sync
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
    sbSync.syncProduct(parseInt(id), 'delete'); // Background sync

    console.log(`🗑️ Product deleted: ${product.name} (ID: ${id})`);
    res.status(200).json({ success: true, message: `"${product.name}" has been deleted.` });
});

// ── POST: Upload image(s) for a product (admin only) ──
app.post('/api/admin/products/:id/upload-image',
    requireAdmin,
    uploadProductImage.array('images', 5),
    async (req, res) => {
        const productId = parseInt(req.params.id);
        const products = readProducts();
        const product = products.find(p => p.id === productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

        // Upload to Supabase Storage if configured, otherwise use local paths
        let uploadedPaths = [];
        if (sbSync.isConfigured) {
            for (const f of req.files) {
                const url = await sbSync.uploadImageToStorage(productId, f.buffer || fs.readFileSync(f.path), f.originalname);
                if (url) uploadedPaths.push(url);
            }
        }
        // Fallback to local paths if Supabase not configured or upload failed
        if (uploadedPaths.length === 0) {
            uploadedPaths = req.files.map(f => `/images/products/${productId}/${f.filename}`);
        }
        product.images = [...(product.images || []), ...uploadedPaths];
        writeProducts(products);
        sbSync.syncProduct(product); // Sync updated images

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
    sbSync.syncProduct(product); // Sync updated images

    // Delete from Supabase Storage if it's a Supabase URL
    if (imagePath.includes('supabase.co')) {
        sbSync.deleteImageFromStorage(imagePath);
    } else if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }
    console.log(`🗑️ Image deleted: ${imagePath}`);

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
    sbSync.syncBulkProducts(products); // Sync all updated products

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

        // Save to Supabase
        sbSync.saveBooking({
            booking_id: bookingId, name, phone,
            email: '', session_name: sessionName || 'Free Consultation',
            date, time_slot: slot, price: 0, payment_id: '',
            notes: notes || ''
        });

        console.log(`✅ Free consultation booked: ${bookingId} for ${name} on ${date} at ${slot}`);
        return res.status(200).json({ success: true, bookingId, message: 'Free consultation confirmed!' });

    } catch (err) {
        console.error('book-free error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error. Please try WhatsApp.' });
    }
});


// ═══════════════════════════════════════════════════════════
//  CATEGORY MANAGEMENT SYSTEM
// ═══════════════════════════════════════════════════════════

// ── GET: Fetch all categories (public) ──
app.get('/api/categories', (req, res) => {
    const categories = readCategories();
    res.status(200).json({ success: true, categories });
});

// ── POST: Add a new category (admin only) ──
app.post('/api/admin/categories/add', requireAdmin, (req, res) => {
    const { id, name, emoji, desc, defaultProductDesc, idPrefix, displayOrder } = req.body;
    if (!id || !name) {
        return res.status(400).json({ success: false, message: 'Category ID and name are required.' });
    }

    const categories = readCategories();
    
    // Ensure no duplicate ID
    const cleanId = id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (categories.find(c => c.id === cleanId)) {
        return res.status(409).json({ success: false, message: `Category "${cleanId}" already exists.` });
    }
    
    // Auto-generate prefix if not provided
    const prefix = parseInt(idPrefix) || (Math.max(0, ...categories.map(c => c.idPrefix)) + 100);
    if (categories.find(c => c.idPrefix === prefix)) {
        return res.status(409).json({ success: false, message: `ID prefix ${prefix} is already in use.` });
    }

    const newCat = {
        id: cleanId,
        name: name.trim(),
        emoji: emoji || '📦',
        desc: (desc || '').trim(),
        defaultProductDesc: (defaultProductDesc || '').trim() || `${name.trim()} product.`,
        idPrefix: prefix,
        displayOrder: parseInt(displayOrder) || categories.length + 1
    };

    categories.push(newCat);
    categories.sort((a, b) => a.displayOrder - b.displayOrder);
    writeCategories(categories);
    sbSync.syncCategory(newCat); // Background sync

    console.log(`✅ Category added: ${newCat.name} (ID: ${newCat.id}, prefix: ${newCat.idPrefix})`);
    res.status(201).json({ success: true, category: newCat });
});

// ── POST: Edit a category (admin only) ──
app.post('/api/admin/categories/edit', requireAdmin, (req, res) => {
    const { id, name, emoji, desc, defaultProductDesc, displayOrder } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Category ID is required.' });

    const categories = readCategories();
    const idx = categories.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Category not found.' });

    if (name !== undefined) categories[idx].name = name.trim();
    if (emoji !== undefined) categories[idx].emoji = emoji;
    if (desc !== undefined) categories[idx].desc = desc.trim();
    if (defaultProductDesc !== undefined) categories[idx].defaultProductDesc = defaultProductDesc.trim();
    if (displayOrder !== undefined) categories[idx].displayOrder = parseInt(displayOrder);

    categories.sort((a, b) => a.displayOrder - b.displayOrder);
    writeCategories(categories);
    sbSync.syncCategory(categories[idx]); // Background sync

    console.log(`✅ Category updated: ${categories[idx].name} (ID: ${id})`);
    res.status(200).json({ success: true, category: categories[idx] });
});

// ── POST: Delete a category (admin only) ──
app.post('/api/admin/categories/delete', requireAdmin, (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'Category ID is required.' });

    // Prevent deleting categories that still have products
    const products = readProducts();
    const productsInCategory = products.filter(p => p.category === id);
    if (productsInCategory.length > 0) {
        return res.status(400).json({ 
            success: false, 
            message: `Cannot delete — ${productsInCategory.length} product(s) still in this category. Move or delete them first.` 
        });
    }

    let categories = readCategories();
    const cat = categories.find(c => c.id === id);
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found.' });

    categories = categories.filter(c => c.id !== id);
    writeCategories(categories);
    sbSync.syncCategory(id, 'delete'); // Background sync

    console.log(`🗑️ Category deleted: ${cat.name} (ID: ${id})`);
    res.status(200).json({ success: true, message: `Category "${cat.name}" has been deleted.` });
});


// ═══════════════════════════════════════════════════════════
//  SITE CONTENT MANAGEMENT (CMS)
// ═══════════════════════════════════════════════════════════

// ── GET: Fetch site content (public) ──
app.get('/api/site-content', (req, res) => {
    const content = readSiteContent();
    res.status(200).json({ success: true, content });
});

// ── POST: Update a single section of site content (admin only) ──
app.post('/api/admin/site-content/update', requireAdmin, (req, res) => {
    const { section, data } = req.body;
    if (!section || !data) {
        return res.status(400).json({ success: false, message: 'Section and data are required.' });
    }

    const content = readSiteContent();
    content[section] = data;
    writeSiteContent(content);
    sbSync.syncSiteContent(section, data); // Background sync

    console.log(`✅ Site content updated: section "${section}"`);
    res.status(200).json({ success: true, message: `Section "${section}" updated successfully.` });
});

// ── POST: Update full site content (admin only) ──
app.post('/api/admin/site-content/update-all', requireAdmin, (req, res) => {
    const { content } = req.body;
    if (!content || typeof content !== 'object') {
        return res.status(400).json({ success: false, message: 'Content object is required.' });
    }

    writeSiteContent(content);
    sbSync.syncAllSiteContent(content); // Background sync

    console.log(`✅ Full site content updated`);
    res.status(200).json({ success: true, message: 'All site content updated successfully.' });
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
            cashfree:    cashfreeConfigured,
            supabase:    sbSync.isConfigured,
            cors:        ALLOWED_ORIGIN,
        },
    });
});

// ── CUSTOMER AUTHENTICATION (public) ──
app.post('/api/customer/register', customerAuthLimiter, (req, res) => {
    const { phone, name, password, streetAddress, city, state, zipCode } = req.body;
    if (!phone || !name || !password || password.length < 6) {
        return res.status(400).json({ success: false, message: 'Valid phone, name, and password (min 6 chars) required.' });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    let customers = readCustomers();
    if (customers.find(c => c.phone === cleanPhone)) {
        return res.status(400).json({ success: false, message: 'An account with this phone number already exists.' });
    }
    const newCustomer = {
        phone: cleanPhone, name: name.trim(), password_hash: hashPassword(password),
        street_address: (streetAddress || '').trim(), city: (city || '').trim(),
        state: (state || '').trim(), zip_code: (zipCode || '').trim(),
        created_at: new Date().toISOString()
    };
    customers.push(newCustomer);
    writeCustomers(customers);
    sbSync.syncCustomer(newCustomer); // Save to Supabase
    
    res.status(201).json({ success: true, message: 'Account created successfully', token: generateCustomerToken(cleanPhone), name: newCustomer.name });
});

app.post('/api/customer/login', customerAuthLimiter, (req, res) => {
    const { phone, password } = req.body;
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const customers = readCustomers();
    const customer = customers.find(c => c.phone === cleanPhone);
    if (!customer || !verifyPassword(password, customer.password_hash)) {
        return res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
    }
    const { password_hash, ...safeProfile } = customer;
    res.status(200).json({ success: true, message: 'Login successful', token: generateCustomerToken(cleanPhone), profile: safeProfile });
});

// ── GET customer profile (protected) ──
app.get('/api/customer/profile', verifyCustomerToken, (req, res) => {
    const customers = readCustomers();
    const customer = customers.find(c => c.phone === req.customerPhone);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    const { password_hash, ...safeProfile } = customer;
    res.status(200).json({ success: true, profile: safeProfile });
});

// ── ORDER HISTORY (protected by customer token) ──
app.get('/api/orders/history', verifyCustomerToken, async (req, res) => {
    const digits = req.customerPhone; // Verified from JWT token
    if (!sbSync.supabase) return res.status(503).json({ success: false, message: 'Database not configured.' });
    try {
        const { data: orders } = await sbSync.supabase.from('orders').select('*').eq('phone', digits).order('created_at', { ascending: false });
        const { data: bookings } = await sbSync.supabase.from('bookings').select('*').eq('phone', digits).order('created_at', { ascending: false });
        return res.status(200).json({ success: true, orders: orders || [], bookings: bookings || [] });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Could not fetch history.' });
    }
});

// -- 9. START -------------------------------------------------------------
// ═══════════════════════════════════════════════════════════
//  NEW FEATURES: Order Tracking, Reviews, Journal,
//                Analytics, Abandoned Cart, Bundle
// ═══════════════════════════════════════════════════════════

// ── MOON PHASE HELPER (used by Journal) ──
function getMoonPhase() {
    const now = new Date();
    const cycle = 29.53058867;
    const knownNewMoon = new Date('2024-01-11');
    const diff = (now - knownNewMoon) / (1000 * 60 * 60 * 24);
    const phase = ((diff % cycle) + cycle) % cycle;
    if (phase < 1.85) return 'New Moon 🌑';
    if (phase < 7.38) return 'Waxing Crescent 🌒';
    if (phase < 9.22) return 'First Quarter 🌓';
    if (phase < 14.77) return 'Waxing Gibbous 🌔';
    if (phase < 16.61) return 'Full Moon 🌕';
    if (phase < 22.15) return 'Waning Gibbous 🌖';
    if (phase < 23.99) return 'Last Quarter 🌗';
    return 'Waning Crescent 🌘';
}

// ── ORDER TRACKING (public) ──────────────────────────────
app.get('/api/track', async (req, res) => {
    const { orderId, phone } = req.query;
    if (!orderId || !phone) return res.status(400).json({ success: false, message: 'Order ID and phone required.' });
    if (!sbSync.supabase) return res.status(503).json({ success: false, message: 'Database not configured.' });

    const cleanPhone = phone.replace(/\D/g, '');
    try {
        const { data, error } = await sbSync.supabase
            .from('orders').select('*')
            .eq('order_id', orderId.trim())
            .eq('phone', cleanPhone)
            .single();

        if (error || !data) return res.status(404).json({ success: false, message: 'Order not found. Please check your Order ID and phone number.' });
        return res.status(200).json({ success: true, order: data });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Could not look up order.' });
    }
});

// ── REVIEWS: Validate token ──────────────────────────────
app.get('/api/review/validate', async (req, res) => {
    const { token } = req.query;
    if (!token || !sbSync.supabase) return res.status(400).json({ success: false });
    try {
        const { data } = await sbSync.supabase
            .from('reviews').select('*').eq('review_token', token).single();
        if (!data) return res.status(400).json({ success: false, message: 'Invalid review token.' });
        if (data.comment && data.comment.length > 0) return res.status(400).json({ success: false, message: 'Review already submitted.' });

        const product = readProducts().find(p => p.id === data.product_id);
        return res.status(200).json({
            success: true, productName: product?.name || 'Product',
            productEmoji: product?.emoji || '🌿', orderId: data.order_id
        });
    } catch { return res.status(400).json({ success: false }); }
});

// ── REVIEWS: Submit review ───────────────────────────────
app.post('/api/review/submit', async (req, res) => {
    const { token, rating, comment } = req.body;
    if (!token || !rating || !sbSync.supabase) return res.status(400).json({ success: false, message: 'Missing data.' });
    if (rating < 1 || rating > 5) return res.status(400).json({ success: false, message: 'Rating must be 1-5.' });

    try {
        const { data: review } = await sbSync.supabase
            .from('reviews').select('id, comment').eq('review_token', token).single();
        if (!review) return res.status(400).json({ success: false, message: 'Invalid token.' });
        if (review.comment && review.comment.length > 0) return res.status(400).json({ success: false, message: 'Already reviewed.' });

        await sbSync.supabase.from('reviews').update({
            rating, comment: (comment || '').substring(0, 500), approved: false
        }).eq('review_token', token);

        console.log(`⭐ Review submitted via token ${token.substring(0, 8)}...`);
        return res.status(200).json({ success: true, message: 'Review submitted!' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Could not save review.' });
    }
});

// ── REVIEWS: Get approved reviews for a product (public) ──
app.get('/api/reviews/:productId', async (req, res) => {
    const productId = parseInt(req.params.productId);
    if (!sbSync.supabase) return res.status(200).json({ success: true, reviews: [] });
    try {
        const { data } = await sbSync.supabase
            .from('reviews').select('customer_name, rating, comment, created_at')
            .eq('product_id', productId).eq('approved', true)
            .order('created_at', { ascending: false }).limit(20);
        return res.status(200).json({ success: true, reviews: data || [] });
    } catch { return res.status(200).json({ success: true, reviews: [] }); }
});

// ── REVIEWS: Admin - list all pending reviews ─────────────
app.post('/api/admin/reviews', requireAdmin, async (req, res) => {
    if (!sbSync.supabase) return res.status(503).json({ success: false });
    try {
        const { data } = await sbSync.supabase
            .from('reviews').select('*').not('comment', 'is', null)
            .order('created_at', { ascending: false });
        return res.status(200).json({ success: true, reviews: data || [] });
    } catch { return res.status(500).json({ success: false }); }
});

// ── REVIEWS: Admin - approve/reject a review ──────────────
app.post('/api/admin/reviews/approve', requireAdmin, async (req, res) => {
    const { reviewId, approved } = req.body;
    if (!reviewId || !sbSync.supabase) return res.status(400).json({ success: false });
    try {
        await sbSync.supabase.from('reviews').update({ approved: !!approved }).eq('id', reviewId);
        console.log(`⭐ Review ${reviewId} ${approved ? 'approved' : 'rejected'}`);
        return res.status(200).json({ success: true });
    } catch { return res.status(500).json({ success: false }); }
});

// ── REVIEWS: Generate review tokens when order delivered ──
async function generateReviewTokens(orderId) {
    if (!sbSync.supabase) return;
    try {
        const { data: order } = await sbSync.supabase
            .from('orders').select('*').eq('order_id', orderId).single();
        if (!order || !Array.isArray(order.items)) return;

        const siteUrl = ALLOWED_ORIGIN !== '*' ? ALLOWED_ORIGIN.split(',')[0] : 'https://bodhisatvvam.onrender.com';
        const reviewLinks = [];

        for (const item of order.items) {
            if (!item.id) continue;
            const token = crypto.randomBytes(32).toString('hex');
            await sbSync.supabase.from('reviews').insert({
                product_id: item.id, order_id: orderId,
                customer_name: order.name.split(' ')[0],
                phone: order.phone, rating: 5,
                review_token: token
            });
            reviewLinks.push(`${item.name}: ${siteUrl}/review.html?token=${token}`);
        }

        // Send WhatsApp with review links
        if (WHATSAPP_TOKEN && PHONE_NUMBER_ID && reviewLinks.length > 0) {
            const msg = `*Namaste ${order.name.split(' ')[0]},* 🙏\n\n` +
                `Your order ${orderId} has been delivered! ✨\n\n` +
                `We'd love to hear about your experience:\n\n` +
                reviewLinks.join('\n') + `\n\n` +
                `_Thank you for choosing Bodhisatvvam_ 🌸`;
            try {
                await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
                    { messaging_product: 'whatsapp', to: '+' + order.phone, type: 'text', text: { body: msg } },
                    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
                );
                console.log(`📱 Review request sent → ${orderId}`);
            } catch (e) { console.warn('Review WA failed:', e.message); }
        }
    } catch (e) { console.error('Review token generation failed:', e.message); }
}

// ── HEALING JOURNAL (customer-authenticated) ──────────────
app.get('/api/journal', verifyCustomerToken, async (req, res) => {
    if (!sbSync.supabase) return res.status(503).json({ success: false, message: 'Database not configured.' });
    try {
        const { data } = await sbSync.supabase
            .from('journal_entries').select('*')
            .eq('phone', req.customerPhone)
            .order('created_at', { ascending: false }).limit(50);
        return res.status(200).json({ success: true, entries: data || [] });
    } catch { return res.status(500).json({ success: false }); }
});

app.post('/api/journal', verifyCustomerToken, async (req, res) => {
    const { title, content, mood } = req.body;
    if (!content || content.trim().length < 1) return res.status(400).json({ success: false, message: 'Content required.' });
    if (!sbSync.supabase) return res.status(503).json({ success: false, message: 'Database not configured.' });

    try {
        const entry = {
            phone: req.customerPhone,
            title: (title || '').substring(0, 200),
            content: content.substring(0, 5000),
            mood_emoji: mood || '🌿',
            moon_phase: getMoonPhase(),
        };
        const { data, error } = await sbSync.supabase.from('journal_entries').insert(entry).select().single();
        if (error) throw error;
        return res.status(201).json({ success: true, entry: data });
    } catch (err) { return res.status(500).json({ success: false, message: 'Could not save entry.' }); }
});

app.post('/api/journal/delete', verifyCustomerToken, async (req, res) => {
    const { entryId } = req.body;
    if (!entryId || !sbSync.supabase) return res.status(400).json({ success: false });
    try {
        await sbSync.supabase.from('journal_entries').delete()
            .eq('id', entryId).eq('phone', req.customerPhone);
        return res.status(200).json({ success: true });
    } catch { return res.status(500).json({ success: false }); }
});

// ── ADMIN ANALYTICS ──────────────────────────────────────
app.post('/api/admin/analytics', requireAdmin, async (req, res) => {
    if (!sbSync.supabase) return res.status(503).json({ success: false, message: 'Database not configured.' });
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: allOrders } = await sbSync.supabase.from('orders').select('*').order('created_at', { ascending: false });
        const { data: allBookings } = await sbSync.supabase.from('bookings').select('*').order('created_at', { ascending: false });
        const { data: allCustomers } = await sbSync.supabase.from('customers').select('phone, name, created_at');

        const orders = allOrders || [];
        const bookings = allBookings || [];
        const customers = allCustomers || [];

        const paidOrders = orders.filter(o => ['Paid', 'Dispatched', 'Delivered'].includes(o.status));
        const totalRevenue = paidOrders.reduce((s, o) => s + parseFloat(o.total || 0), 0);
        const bookingRevenue = bookings.filter(b => b.price > 0).reduce((s, b) => s + parseFloat(b.price || 0), 0);

        // Revenue by day (last 30 days)
        const revenueByDay = {};
        paidOrders.filter(o => o.created_at >= thirtyDaysAgo).forEach(o => {
            const day = o.created_at.substring(0, 10);
            revenueByDay[day] = (revenueByDay[day] || 0) + parseFloat(o.total || 0);
        });

        // Top 5 products
        const productCounts = {};
        orders.forEach(o => {
            if (!Array.isArray(o.items)) return;
            o.items.forEach(i => {
                const key = i.name || 'Unknown';
                productCounts[key] = (productCounts[key] || 0) + (i.qty || 1);
            });
        });
        const topProducts = Object.entries(productCounts)
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        const avgOrder = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
        const newCustomersThisWeek = customers.filter(c => c.created_at >= sevenDaysAgo).length;

        return res.status(200).json({
            success: true,
            analytics: {
                totalRevenue: totalRevenue + bookingRevenue,
                orderRevenue: totalRevenue,
                bookingRevenue,
                totalOrders: orders.length,
                totalBookings: bookings.length,
                totalCustomers: customers.length,
                avgOrderValue: Math.round(avgOrder),
                newCustomersThisWeek,
                topProducts,
                revenueByDay,
                paidOrderCount: paidOrders.length,
            }
        });
    } catch (err) {
        console.error('Analytics error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not generate analytics.' });
    }
});

// ── ABANDONED CART: Save cart (logged-in customers) ───────
app.post('/api/cart/save', verifyCustomerToken, async (req, res) => {
    const { items, total } = req.body;
    if (!sbSync.supabase || !items) return res.status(200).json({ success: true });

    const customers = readCustomers();
    const customer = customers.find(c => c.phone === req.customerPhone);
    try {
        await sbSync.supabase.from('saved_carts').upsert({
            phone: req.customerPhone,
            customer_name: customer?.name || 'Customer',
            items, total: parseFloat(total || 0),
            last_updated: new Date().toISOString(),
            reminder_sent: false
        }, { onConflict: 'phone' });
    } catch { /* silent */ }
    return res.status(200).json({ success: true });
});

// ── ABANDONED CART: Clear cart (after successful checkout) ──
app.post('/api/cart/clear', verifyCustomerToken, async (req, res) => {
    if (!sbSync.supabase) return res.status(200).json({ success: true });
    try { await sbSync.supabase.from('saved_carts').delete().eq('phone', req.customerPhone); } catch { /* ignore */ }
    return res.status(200).json({ success: true });
});

// ── ABANDONED CART: Recovery check (runs periodically) ────
async function checkAbandonedCarts() {
    if (!sbSync.supabase || !WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return;
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    try {
        const { data: carts } = await sbSync.supabase
            .from('saved_carts').select('*')
            .eq('reminder_sent', false)
            .lt('last_updated', cutoff);
        if (!carts || carts.length === 0) return;

        const siteUrl = ALLOWED_ORIGIN !== '*' ? ALLOWED_ORIGIN.split(',')[0] : 'https://bodhisatvvam.onrender.com';
        for (const cart of carts) {
            if (!Array.isArray(cart.items) || cart.items.length === 0) continue;
            const itemList = cart.items.map(i => `${i.emoji || '🌿'} ${i.name} × ${i.qty || 1} — ₹${i.price}`).join('\n');
            const msg = `*Namaste ${(cart.customer_name || '').split(' ')[0]},* 🙏\n\n` +
                `Your healing cart is waiting for you ✨\n\n` +
                `${itemList}\n─────────────────\n*Total: ₹${parseFloat(cart.total).toFixed(2)}*\n\n` +
                `Complete your order 👉 ${siteUrl}\n\n_Shree Bodhisatvvam_ 🌸`;
            try {
                await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
                    { messaging_product: 'whatsapp', to: '+' + cart.phone, type: 'text', text: { body: msg } },
                    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
                );
                await sbSync.supabase.from('saved_carts').update({ reminder_sent: true }).eq('phone', cart.phone);
                console.log(`📱 Abandoned cart reminder sent → ${cart.customer_name} (${cart.phone})`);
            } catch (e) { console.warn(`Cart reminder failed for ${cart.phone}:`, e.message); }
        }
    } catch (e) { console.error('Abandoned cart check error:', e.message); }
}

// -- 10. START ------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🌸 Bodhisatvvam server running on port ${PORT}`);
    console.log(`   Cashfree  : ${cashfreeConfigured ? '✅ configured' : '❌ not set'}`);
    console.log(`   WhatsApp  : ${WHATSAPP_TOKEN ? '✅ configured' : '❌ not set'}`);
    console.log(`   Sheet     : ${GOOGLE_SCRIPT_URL ? '✅ configured' : '❌ not set'}`);
    console.log(`   Supabase  : ${sbSync.isConfigured ? '✅ configured' : '❌ not set'}`);
    console.log(`   CORS      : ${ALLOWED_ORIGIN}`);

    // TEMPORARY FIX: Push new compliant data to Supabase to overwrite old db rows!
    if (sbSync.isConfigured) {
        console.log('🚀 Force pushing local JSON to Supabase to update live DB...');
        const content = readSiteContent();
        await sbSync.syncAllSiteContent(content);
        
        const products = readProducts();
        await sbSync.syncBulkProducts(products);
        
        const cats = readCategories();
        await sbSync.syncAllCategories(cats);
        
        // After pushing, we resume normal pulling behavior for future restarts
        await sbSync.pullFromSupabase();
    }

    // Check for abandoned carts every 30 minutes
    setInterval(checkAbandonedCarts, 30 * 60 * 1000);
    console.log(`   Cart Check: ✅ every 30 min`);
});
