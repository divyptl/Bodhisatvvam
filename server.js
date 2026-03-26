// ═══════════════════════════════════════════════════════════
//  Bodhisatvvam -- Backend Server v4 (All Fixes Applied)
//
//  Changes from v3:
//    ✅ helmet.js for security headers (CSP, X-Frame-Options, etc.)
//    ✅ Phone normalization — ensures 91 prefix for WhatsApp API
//    ✅ Custom candle notes preserved in order items
//    ✅ Fallback order logging — if Sheet + WhatsApp both fail, stdout captures full payload
//    ✅ Improved error messages and edge-case handling
//    ✅ All previous hardening retained
// ═══════════════════════════════════════════════════════════

const express   = require('express');
const axios     = require('axios');
const path      = require('path');
const cors      = require('cors');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet    = require('helmet');
const Razorpay  = require('razorpay');

const app = express();

// Trust Render's proxy
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
// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:    ["'self'"],
            scriptSrc:     ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://cdn.razorpay.com", "https://fonts.googleapis.com"],
            // helmet defaults script-src-attr to 'none', which blocks ALL onclick= / onevent= HTML attributes.
            // Must be explicitly set to 'unsafe-inline' to allow inline event handlers.
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc:       ["'self'", "https://fonts.gstatic.com"],
            imgSrc:        ["'self'", "data:", "https:"],
            connectSrc:    ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com", "https://cdn.razorpay.com"],
            frameSrc:      ["https://api.razorpay.com", "https://checkout.razorpay.com"],
        },
    },
    crossOriginEmbedderPolicy: false, // Needed for Razorpay iframe
}));

// CORS
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
    max: 10,
    message: { success: false, message: 'Too many requests. Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// -- 5. PRODUCT CATALOG (server-side source of truth for pricing) ─────────
// SECURITY: The frontend sends item IDs and quantities. The backend ALWAYS
// recalculates the total from this catalog. Client-supplied totals/prices are ignored.
const PRODUCT_CATALOG = {
  // ─ Salts (all ₹599) ──────────────────────────────────────────────────────
  101:599,102:599,103:599,104:599,105:599,106:599,107:599,108:599,109:599,110:599,
  111:599,112:599,113:599,114:599,115:599,116:599,117:599,118:599,119:599,120:599,
  121:599,122:599,123:599,124:599,125:599,126:599,127:599,128:599,129:599,130:599,
  131:599,132:599,133:599,134:599,135:599,136:599,137:599,138:599,139:599,140:599,
  141:599,142:599,143:599,144:599,145:599,146:599,147:599,
  // ─ Healing Sessions (all ₹2499) ──────────────────────────────────────────
  201:2499,202:2499,203:2499,204:2499,205:2499,
  206:2499,207:2499,208:2499,209:2499,210:2499,
  // ─ Candles (mixed pricing) ───────────────────────────────────────────────
  301:999, 302:1499,303:1499,304:1499,305:999, 306:1499,307:999, 308:999, 309:999, 310:999,
  311:1499,312:1499,313:1499,314:1499,315:1499,316:1499,317:1499,318:999, 319:1499,320:1499,
  321:1499,322:1499,323:4499,324:999, 325:999, 326:1499,327:1499,328:999, 329:1499,330:1499,
  331:1499,332:1499,333:1499,334:1499,335:1499,336:1499,337:999, 338:999, 339:1499,
  1000:1799, // Custom Made Candle
};

// -- 6. HELPERS -----------------------------------------------------------
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

/**
 * Normalizes an Indian phone number to include the 91 country code.
 * "9737171090"   → "919737171090"
 * "919737171090" → "919737171090"
 * "+919737171090"→ "919737171090"
 */
function normalizeIndianPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return '91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length === 13 && digits.startsWith('091')) return digits.slice(1);
    // Fallback: return as-is (the WhatsApp API will reject if invalid)
    return digits;
}

function validateOrderInput({ name, phone, address, items, total }) {
    const errors = [];
    if (!name || typeof name !== 'string' || name.trim().length < 2)
        errors.push('Name must be at least 2 characters.');
    if (!validatePhone(phone))
        errors.push('Please provide a valid 10-digit phone number.');
    if (!address || typeof address !== 'string' || address.trim().length < 5)
        errors.push('Address must be at least 5 characters.');
    if (!items || (Array.isArray(items) && items.length === 0))
        errors.push('Order must contain at least one item.');
    const parsedTotal = parseFloat(String(total).replace(/[^0-9.]/g, ''));
    if (isNaN(parsedTotal) || parsedTotal <= 0)
        errors.push('Order total is invalid.');
    return errors;
}

function formatItemsForWhatsApp(items) {
    if (Array.isArray(items)) {
        return items.map(i => {
            let line = `- ${i.name} x${i.qty} @ Rs.${i.price}`;
            if (i.notes) line += `\n  _Note: ${i.notes}_`;
            return line;
        }).join('\n');
    }
    return String(items);
}

function formatItemsForSheet(items) {
    if (Array.isArray(items)) {
        return items.map(i => {
            let str = `${i.name} (x${i.qty})`;
            if (i.notes) str += ` [${i.notes}]`;
            return str;
        }).join(', ');
    }
    return String(items);
}

function toPaise(total) {
    const num = parseFloat(String(total).replace(/[^0-9.]/g, ''));
    return Math.round(num * 100);
}

async function pushToSheet(payload, attempt = 1) {
    if (!GOOGLE_SCRIPT_URL || !GOOGLE_SCRIPT_SECRET) return false;
    try {
        // Format items as string for the sheet
        const sheetPayload = {
            ...payload,
            items: formatItemsForSheet(payload.items),
        };
        await axios.post(
            GOOGLE_SCRIPT_URL,
            { secret: GOOGLE_SCRIPT_SECRET, ...sheetPayload },
            { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
        );
        console.log(`✅ Sheet updated → ${payload.orderId}`);
        return true;
    } catch (err) {
        const status = err?.response?.status || 'no-response';
        console.error(`❌ Sheet error (attempt ${attempt}) → HTTP ${status}: ${err.message}`);
        if (attempt === 1 && err.code === 'ECONNABORTED') {
            console.log(`   Retrying sheet update in 3s...`);
            await new Promise(r => setTimeout(r, 3000));
            return pushToSheet(payload, 2);
        }
        return false;
    }
}

async function sendWhatsApp(name, phone, orderId, items, total, address) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return false;
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
        console.log(`✅ WhatsApp sent → ${orderId} (to: ${phone})`);
        console.log(`   Meta response: ${waResponse.status} ${JSON.stringify(waResponse.data)}`);
        return true;
    } catch (err) {
        const code = err?.response?.data?.error?.code    || 'unknown';
        const type = err?.response?.data?.error?.type    || 'unknown';
        const msg  = err?.response?.data?.error?.message || err.message;
        console.error(`❌ WhatsApp error → Code ${code} [${type}]: ${msg}`);
        console.error(`   Attempted to send to: ${phone}`);
        return false;
    }
}

// -- 7. ROUTE: CREATE RAZORPAY ORDER -------------------------------
app.post('/api/create-order', orderLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        const { name, phone, address, items } = body;

        // Basic field validation
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Name must be at least 2 characters.' });
        }
        if (!phone || typeof phone !== 'string') {
            return res.status(400).json({ success: false, message: 'Please provide a valid phone number.' });
        }
        const phoneDigits = phone.replace(/\D/g, '');
        if (phoneDigits.length < 10 || phoneDigits.length > 13) {
            return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit phone number.' });
        }
        if (!address || typeof address !== 'string' || address.trim().length < 5) {
            return res.status(400).json({ success: false, message: 'Address must be at least 5 characters.' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Order must contain at least one item.' });
        }

        // SECURITY: Recalculate total server-side from catalog — never trust client price
        let calculatedTotal = 0;
        for (const item of items) {
            const catalogPrice = PRODUCT_CATALOG[item.id];
            if (!catalogPrice) {
                return res.status(400).json({ success: false, message: `Unknown product ID: ${item.id}. Please refresh and try again.` });
            }
            const qty = parseInt(item.qty, 10);
            if (!qty || qty < 1 || qty > 50) {
                return res.status(400).json({ success: false, message: `Invalid quantity for item ${item.id}.` });
            }
            calculatedTotal += catalogPrice * qty;
        }
        const amountPaise = Math.round(calculatedTotal * 100);

        if (!razorpay) {
            return res.status(503).json({ success: false, message: 'Payment system not configured. Please contact us on WhatsApp.' });
        }

        const bodhiOrderId  = generateOrderId();
        const sanitizedPhone = normalizeIndianPhone(phone);

        console.log(`💳 Creating Razorpay order | ${bodhiOrderId} | ₹${calculatedTotal} (server-calculated)`);

        const rzpOrder = await razorpay.orders.create({
            amount:   amountPaise,
            currency: 'INR',
            receipt:  bodhiOrderId,
            notes: {
                customer_name:    name.trim(),
                customer_phone:   sanitizedPhone,
                delivery_address: address.trim(),
                bdh_order_id:     bodhiOrderId,
            },
        });

        console.log(`✅ Razorpay order created → ${rzpOrder.id}`);

        return res.status(200).json({
            success:         true,
            razorpayOrderId: rzpOrder.id,
            bodhiOrderId,
            amount:          amountPaise,
            currency:        'INR',
            keyId:           RAZORPAY_KEY_ID,
            prefill: {
                name:    name.trim(),
                contact: sanitizedPhone,
            },
        });

    } catch (err) {
        console.error(`❌ /api/create-order error: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Could not initiate payment. Please try again or contact us on WhatsApp.' });
    }
});

// -- 8. ROUTE: VERIFY PAYMENT + FULFIL ORDER ------------------
app.post('/api/verify-payment', orderLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            bodhiOrderId,
            name,
            phone,
            address,
            items,
            total,
        } = body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing payment verification fields.' });
        }

        // Verify Razorpay HMAC signature
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            console.error(`❌ Signature mismatch for ${bodhiOrderId} -- possible fraud attempt`);
            return res.status(400).json({ success: false, message: 'Payment verification failed.' });
        }

        console.log(`✅ Payment verified → ${bodhiOrderId} | Razorpay: ${razorpay_payment_id}`);

        const sanitizedPhone = normalizeIndianPhone(phone || '');

        // Log to Google Sheet
        const sheetOk = await pushToSheet({
            orderId: bodhiOrderId,
            name,
            phone:   sanitizedPhone,
            address,
            items,
            total,
            status:  'Paid',
            paymentId: razorpay_payment_id,
        });

        // Send WhatsApp confirmation
        const waOk = await sendWhatsApp(name, sanitizedPhone, bodhiOrderId, items, total, address);

        // SAFETY NET — if both failed, log full payload to stdout
        if (!sheetOk && !waOk) {
            console.error(`🚨 CRITICAL: Both Sheet and WhatsApp failed for order ${bodhiOrderId}`);
            console.error(`🚨 FULL ORDER DATA (backup): ${JSON.stringify({
                orderId: bodhiOrderId,
                paymentId: razorpay_payment_id,
                name, phone: sanitizedPhone, address, items, total,
                timestamp: new Date().toISOString(),
            })}`);
        }

        // Return success regardless of notification status — payment IS confirmed
        return res.status(200).json({
            success: true,
            orderId: bodhiOrderId,
            message: 'Payment confirmed! Order placed successfully.',
        });

    } catch (err) {
        console.error(`❌ /api/verify-payment error: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Payment received but confirmation failed. Please WhatsApp us with your payment reference.' });
    }
});

// -- 9. GLOBAL ERROR HANDLERS ─────────────────────────────────────────────
// Catches body-parse errors (malformed JSON in request) — returns JSON not HTML
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'Invalid request body.' });
    }
    next(err);
});

// Catch-all error handler — ensures ALL unhandled errors return JSON, never HTML
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(`❌ Unhandled error on ${req.method} ${req.path}: ${err.message}`);
    return res.status(500).json({ success: false, message: 'An unexpected server error occurred. Please try again.' });
});

// -- 10. HEALTH CHECK ------------------------------------------------------
app.get('/health', (req, res) => {
    res.status(200).json({
        status:    'ok',
        service:   'Bodhisatvvam Backend v5',
        timestamp: new Date().toISOString(),
        env: {
            whatsapp:    !!WHATSAPP_TOKEN,
            googleSheet: !!GOOGLE_SCRIPT_URL,
            razorpay:    !!razorpay,
            cors:        ALLOWED_ORIGIN,
        },
    });
});

// -- 10. START -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌸 Bodhisatvvam server v4 running on port ${PORT}`);
    console.log(`   Razorpay  : ${razorpay    ? '✅ configured' : '❌ not set'}`);
    console.log(`   WhatsApp  : ${WHATSAPP_TOKEN ? '✅ configured' : '❌ not set'}`);
    console.log(`   Sheet     : ${GOOGLE_SCRIPT_URL ? '✅ configured' : '❌ not set'}`);
    console.log(`   Helmet    : ✅ enabled`);
    console.log(`   CORS      : ${ALLOWED_ORIGIN}`);
});
