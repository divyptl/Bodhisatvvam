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
const cors      = require('cors');
const crypto    = require('crypto'); // Built-in Node.js -- no install needed
const rateLimit = require('express-rate-limit');
const Razorpay  = require('razorpay');

const app = express();

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

// -- 5. HELPERS -----------------------------------------------------------
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

async function sendWhatsApp(name, phone, orderId, items, total, address) {
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
            `*Delivery to:* ${address}\n\n` +
            `We will dispatch your order shortly and keep you updated here.\n\n` +
            `_Empower Your Life_ 🌸\n` +
            `-- Shree Bodhisatvvam Team`;

        const waResponse = await axios.post(
            `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
            { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body } },
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
    const { name, phone, address, items, total } = req.body;

    const errors = validateOrderInput({ name, phone, address, items, total });
    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors.join(' ') });
    }

    if (!razorpay) {
        return res.status(503).json({ success: false, message: 'Payment system not configured. Please contact us on WhatsApp.' });
    }

    const bodhiOrderId = generateOrderId(); // Our internal ID
    const amountPaise  = toPaise(total);

    console.log(`💳 Creating Razorpay order | ${bodhiOrderId} | ₹${amountPaise / 100}`);

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
    });

    // 7c. Send WhatsApp confirmation
    await sendWhatsApp(name, sanitizedPhone, bodhiOrderId, items, total, address);

    // 7d. Return success to frontend
    return res.status(200).json({
        success: true,
        orderId: bodhiOrderId,
        message: 'Payment confirmed! Order placed successfully.',
    });
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
