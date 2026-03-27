// ═══════════════════════════════════════════════════════════
//  Bodhisatvvam — Backend Server v5 (Final Patch)
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
app.set('trust proxy', 1);

// ── 1. ENV SAFETY CHECK ──────────────────────────────────────
const REQUIRED_ENV = [
    'WHATSAPP_TOKEN','PHONE_NUMBER_ID','GOOGLE_SCRIPT_URL',
    'GOOGLE_SCRIPT_SECRET','ALLOWED_ORIGIN','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET',
];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
    console.warn(`⚠️ Missing env vars: [${missingEnv.join(', ')}]. Related features disabled.`);
}

const WHATSAPP_TOKEN       = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID      = process.env.PHONE_NUMBER_ID;
const GOOGLE_SCRIPT_URL    = process.env.GOOGLE_SCRIPT_URL;
const GOOGLE_SCRIPT_SECRET = process.env.GOOGLE_SCRIPT_SECRET;
const ALLOWED_ORIGIN       = process.env.ALLOWED_ORIGIN || '*';
const RAZORPAY_KEY_ID      = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET  = process.env.RAZORPAY_KEY_SECRET;

// ── 2. RAZORPAY CLIENT ───────────────────────────────────────
const razorpay = (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET)
    ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
    : null;

// ── 3. MIDDLEWARE ────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:    ["'self'"],
            scriptSrc:     ["'self'", "'unsafe-inline'", "https://*.razorpay.com", "https://fonts.googleapis.com"],
            scriptSrcAttr: ["'unsafe-inline'"], 
            styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://*.razorpay.com"],
            fontSrc:       ["'self'", "https://fonts.gstatic.com", "https://*.razorpay.com"],
            imgSrc:        ["'self'", "data:", "https:"],
            connectSrc:    ["'self'", "https://*.razorpay.com", "https://bodhisatvvam.onrender.com"],
            frameSrc:      ["'self'", "https://*.razorpay.com", "https:"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
}));

const allowedOrigins = ALLOWED_ORIGIN === '*' ? ['*'] : ALLOWED_ORIGIN.split(',').map(o => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn(`⚠️ CORS rejected origin: ${origin}`);
        return callback(null, false);
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── 4. RATE LIMITERS ─────────────────────────────────────────
const orderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many requests. Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ── 5. PRODUCT CATALOG ───────────────────────────────────────
const PRODUCT_CATALOG = {
    101:599, 102:599, 103:599, 104:599, 105:599, 106:599, 107:599, 108:599, 109:599, 110:599,
    111:599, 112:599, 113:599, 114:599, 115:599, 116:599, 117:599, 118:599, 119:599, 120:599,
    121:599, 122:599, 123:599, 124:599, 125:599, 126:599, 127:599, 128:599, 129:599, 130:599,
    131:599, 132:599, 133:599, 134:599, 135:599, 136:599, 137:599, 138:599, 139:599, 140:599,
    141:599, 142:599, 143:599, 144:599, 145:599, 146:599, 147:599,
    201:2499, 202:2499, 203:2499, 204:2499, 205:2499, 206:2499, 207:2499, 208:2499, 209:2499, 210:2499,
    301:999,  302:1499, 303:1499, 304:1499, 305:999,  306:1499, 307:999,  308:999,  309:999,  310:999,
    311:1499, 312:1499, 313:1499, 314:1499, 315:1499, 316:1499, 317:1499, 318:999,  319:1499, 320:1499,
    321:1499, 322:1499, 323:4499, 324:999,  325:999,  326:1499, 327:1499, 328:999,  329:1499, 330:1499,
    331:1499, 332:1499, 333:1499, 334:1499, 335:1499, 336:1499, 337:999,  338:999,  339:1499,
    1000:1799,
};

// ── 6. HELPERS ───────────────────────────────────────────────
function generateOrderId() {
    const ts  = Date.now().toString(36).toUpperCase();
    const rnd = Math.floor(1000 + Math.random() * 9000);
    return `#BDH-${ts}-${rnd}`;
}

function normalizeIndianPhone(phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return '91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length === 13 && digits.startsWith('091')) return digits.slice(1);
    return digits;
}

function formatItemsForSheet(items) {
    if (!Array.isArray(items)) return String(items);
    return items.map(i => {
        let str = `${i.name} (x${i.qty})`;
        if (i.notes) str += ` [${i.notes}]`;
        return str;
    }).join(', ');
}

// 🚨 Added missing WhatsApp formatter
function formatItemsForWhatsApp(items) {
    if (!Array.isArray(items)) return String(items);
    return items.map(i => {
        let str = `- ${i.name} x${i.qty}`;
        if (i.notes) str += `\n  _Note: ${i.notes}_`;
        return str;
    }).join('\n');
}

async function pushToSheet(payload, attempt = 1) {
    if (!GOOGLE_SCRIPT_URL || !GOOGLE_SCRIPT_SECRET) return false;
    try {
        const sheetPayload = { ...payload, items: formatItemsForSheet(payload.items) };
        await axios.post(
            GOOGLE_SCRIPT_URL,
            { secret: GOOGLE_SCRIPT_SECRET, ...sheetPayload },
            { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
        );
        return true;
    } catch (err) {
        if (attempt === 1 && err.code === 'ECONNABORTED') {
            await new Promise(r => setTimeout(r, 3000));
            return pushToSheet(payload, 2);
        }
        return false;
    }
}

async function sendWhatsApp(name, phone, orderId, items, total) {
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return false;
    try {
        const formattedItems = formatItemsForWhatsApp(items);
        const payload = {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
                name: 'order_confirmation', 
                language: { code: 'en' },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: name },                 // {{1}}
                            { type: 'text', text: orderId },              // {{2}}
                            { type: 'text', text: formattedItems },       // {{3}} The items list
                            { type: 'text', text: total }                 // {{4}} The total price
                        ]
                    }
                ]
            }
        };

        const waResponse = await axios.post(
            `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
            payload,
            { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        console.log(`✅ WhatsApp sent → ${orderId} (to: ${phone})`);
        return true;
    } catch (err) {
        const msg = err?.response?.data?.error?.message || err.message;
        console.error(`❌ WhatsApp error: ${msg}`);
        return false;
    }
}

// ── 7. ROUTE: CREATE RAZORPAY ORDER ──────────────────────────
app.post('/api/create-order', orderLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        const { name, phone, address, items } = body;

        if (!name || name.trim().length < 2) return res.status(400).json({ success: false, message: 'Name must be at least 2 characters.' });
        
        const phoneDigits = (phone || '').replace(/\D/g, '');
        if (phoneDigits.length < 10 || phoneDigits.length > 13) return res.status(400).json({ success: false, message: 'Valid 10-digit phone required.' });
        if (!address || address.trim().length < 5) return res.status(400).json({ success: false, message: 'Valid address required.' });
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: 'Order must contain items.' });

        let calculatedTotal = 0;
        for (const item of items) {
            const catalogPrice = PRODUCT_CATALOG[item.id];
            if (!catalogPrice) return res.status(400).json({ success: false, message: `Unknown product ID: ${item.id}.` });
            calculatedTotal += catalogPrice * (parseInt(item.qty, 10) || 1);
        }
        
        const amountPaise = Math.round(calculatedTotal * 100);
        if (!razorpay) return res.status(503).json({ success: false, message: 'Payment not configured.' });

        const bodhiOrderId = generateOrderId();
        const sanitizedPhone = normalizeIndianPhone(phone);

        const rzpOrder = await razorpay.orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt: bodhiOrderId,
            notes: { customer_name: name.trim(), customer_phone: sanitizedPhone, bdh_order_id: bodhiOrderId },
        });

        return res.status(200).json({
            success: true,
            razorpayOrderId: rzpOrder.id,
            bodhiOrderId,
            amount: amountPaise,
            currency: 'INR',
            keyId: RAZORPAY_KEY_ID,
            prefill: { name: name.trim(), contact: sanitizedPhone },
        });

    } catch (err) {
        console.error(`❌ Create order error: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Could not initiate payment.' });
    }
});

// ── 8. ROUTE: VERIFY PAYMENT + FULFIL ORDER ──────────────────
app.post('/api/verify-payment', orderLimiter, async (req, res) => {
    try {
        const body = req.body || {};
        const {
            razorpay_order_id, razorpay_payment_id, razorpay_signature,
            bodhiOrderId, name, phone, address, items
        } = body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing verification fields.' });
        }

        const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Payment verification failed.' });
        }

        let secureTotal = 0;
        if (Array.isArray(items)) {
            for (const item of items) {
                const catalogPrice = PRODUCT_CATALOG[item.id] || 0;
                secureTotal += catalogPrice * (parseInt(item.qty, 10) || 0);
            }
        }
        const secureTotalFormatted = '₹' + secureTotal.toFixed(2);
        const sanitizedPhone = normalizeIndianPhone(phone || '');

        const sheetOk = await pushToSheet({
            orderId: bodhiOrderId, name, phone: sanitizedPhone,
            address, items, total: secureTotalFormatted, status: 'Paid', paymentId: razorpay_payment_id,
        });

        // 🚨 Passed the items array properly
        const waOk = await sendWhatsApp(name, sanitizedPhone, bodhiOrderId, items, secureTotalFormatted);

        if (!sheetOk && !waOk) {
            console.error(`🚨 Backup: ${bodhiOrderId} | ${razorpay_payment_id} | ${secureTotalFormatted}`);
        }

        return res.status(200).json({ success: true, orderId: bodhiOrderId, message: 'Payment confirmed!' });

    } catch (err) {
        return res.status(500).json({ success: false, message: 'Confirmation failed. Send us your payment ID via WhatsApp.' });
    }
});

// ── 9. GLOBAL ERROR HANDLERS ─────────────────────────────────
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid body.' });
    next(err);
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(`❌ Unhandled error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Unexpected error occurred.' });
});

app.get('/api/ping', (req, res) => res.status(200).json({ ok: true }));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'Bodhisatvvam Backend v5 Final' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌸 Server running on port ${PORT}`);
});
