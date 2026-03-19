const express = require('express');
const axios   = require('axios');
const path    = require('path');
const cors    = require('cors');

const rateLimit = require('express-rate-limit');

const app = express();
const REQUIRED_ENV = [
    'WHATSAPP_TOKEN',
    'PHONE_NUMBER_ID',
    'GOOGLE_SCRIPT_URL',
    'GOOGLE_SCRIPT_SECRET',
    'ALLOWED_ORIGIN',       
];

const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    console.warn(`⚠️  STARTUP WARNING: Missing env vars: [${missingEnv.join(', ')}]. Related features will be disabled.`);
}

const WHATSAPP_TOKEN      = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID     = process.env.PHONE_NUMBER_ID;
const GOOGLE_SCRIPT_URL   = process.env.GOOGLE_SCRIPT_URL;
const GOOGLE_SCRIPT_SECRET = process.env.GOOGLE_SCRIPT_SECRET;
const ALLOWED_ORIGIN      = process.env.ALLOWED_ORIGIN || '*';

app.use(cors({
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '10kb' })); // Prevent oversized payloads
app.use(express.static(path.join(__dirname, 'public')));

const orderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minute window
    max: 5,                    // max 5 order attempts per IP
    message: {
        success: false,
        message: 'Too many requests from this device. Please wait 15 minutes and try again.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});


function generateOrderId() {
    const timestamp = Date.now().toString(36).toUpperCase(); // Base-36 timestamp for uniqueness
    const random    = Math.floor(1000 + Math.random() * 9000);
    return `#BDH-${timestamp}-${random}`;
}

/**
 * Validates a phone number string.
 * Strips non-numerics, checks for 10–13 digit length (handles +91 prefix).
 */
function validatePhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13;
}

/**
 * Validates all required order fields.
 * Returns an array of error strings (empty array = valid).
 */
function validateOrderInput({ name, phone, address, items, total }) {
    const errors = [];

    if (!name || typeof name !== 'string' || name.trim().length < 2)
        errors.push('Name must be at least 2 characters.');

    if (!validatePhone(phone))
        errors.push('Please provide a valid 10-digit phone number.');

    if (!address || typeof address !== 'string' || address.trim().length < 10)
        errors.push('Address must be at least 10 characters.');

    if (!items || (typeof items !== 'string' && !Array.isArray(items)) || (Array.isArray(items) && items.length === 0))
        errors.push('Order must contain at least one item.');

    const parsedTotal = parseFloat(String(total).replace(/[^0-9.]/g, ''));
    if (isNaN(parsedTotal) || parsedTotal <= 0)
        errors.push('Order total is invalid.');

    return errors;
}

/**
 * Formats items for the WhatsApp message.
 * Handles both a plain string and an array of item objects.
 */
function formatItemsForMessage(items) {
    if (Array.isArray(items)) {
        return items.map(i => `• ${i.name} x${i.qty} — ₹${i.price}`).join('\n');
    }
    return String(items);
}

// ── 5. ORDER ENDPOINT ────────────────────────────────────────
app.post('/api/order', orderLimiter, async (req, res) => {
    const { name, phone, address, items, total } = req.body;

    // 5a. Validate inputs
    const validationErrors = validateOrderInput({ name, phone, address, items, total });
    if (validationErrors.length > 0) {
        return res.status(400).json({
            success: false,
            message: validationErrors.join(' '),
        });
    }

    // 5b. Generate one authoritative Order ID
    const orderId        = generateOrderId();
    const sanitizedPhone = phone.replace(/\D/g, '');
    const formattedItems = formatItemsForMessage(items);

    // Sanitized log — no customer PII, no tokens
    console.log(`📦 Processing ${orderId} | Items: ${Array.isArray(items) ? items.length : 1} | Total: ${total}`);

    let sheetSuccess = false;

    // 5c. Push to Google Sheets (with shared secret header)
    if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_SECRET) {
        try {
            // NOTE: Apps Script's doPost() cannot read custom HTTP headers.
            // The shared secret is sent inside the JSON body instead.
            await axios.post(
                GOOGLE_SCRIPT_URL,
                {
                    secret: GOOGLE_SCRIPT_SECRET, // Apps Script verifies this
                    orderId,
                    name,
                    phone: sanitizedPhone,
                    address,
                    items,
                    total,
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000,
                }
            );
            console.log(`✅ Sheet updated → ${orderId}`);
            sheetSuccess = true;
        } catch (sheetError) {
            // Log only safe metadata, not the full error object
            const status = sheetError?.response?.status || 'no-response';
            console.error(`❌ Sheet error for ${orderId} → HTTP ${status}: ${sheetError.message}`);
        }
    } else {
        console.warn(`⚠️  Sheet skipped for ${orderId} — GOOGLE_SCRIPT_URL or SECRET not set.`);
    }

    // 5d. Send WhatsApp notification
    if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
        try {
            const messageBody =
                `*Namaste ${name},* 🙏\n\n` +
                `Thank you for choosing Bodhisatvvam! ✨\n\n` +
                `*Order Confirmation (${orderId})*\n` +
                `────────────────────\n` +
                `${formattedItems}\n` +
                `────────────────────\n` +
                `*Total:* ${total}\n` +
                `*Delivery to:* ${address}\n\n` +
                `We will review and confirm your order shortly.\n\n` +
                `_Empower Your Life_ 🌸\n` +
                `— Shree Bodhisatvvam Team`;

            await axios.post(
                `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, // Upgraded to v21.0
                {
                    messaging_product: 'whatsapp',
                    to: sanitizedPhone,
                    type: 'text',
                    text: { body: messageBody },
                },
                {
                    headers: {
                        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                }
            );
            console.log(`✅ WhatsApp sent → ${orderId}`);
        } catch (waError) {
            // Log only error code and type — NEVER log the token or customer data
            const errCode = waError?.response?.data?.error?.code    || 'unknown';
            const errType = waError?.response?.data?.error?.type    || 'unknown';
            const errMsg  = waError?.response?.data?.error?.message || waError.message;
            console.error(`❌ WhatsApp error for ${orderId} → Code ${errCode} [${errType}]: ${errMsg}`);
        }
    } else {
        console.warn(`⚠️  WhatsApp skipped for ${orderId} — credentials not set.`);
    }

    // 5e. Return response — always include the server-generated orderId
    if (sheetSuccess) {
        return res.status(200).json({
            success: true,
            orderId,   // ← Frontend displays THIS, not a locally generated one
            message:   'Order received! We will confirm via WhatsApp shortly.',
        });
    } else {
        return res.status(500).json({
            success: false,
            message:  'Our server had an issue recording your order. Please WhatsApp us directly.',
        });
    }
});

// ── 6. HEALTH CHECK ──────────────────────────────────────────
// Useful for Render uptime monitoring and debugging
app.get('/health', (req, res) => {
    res.status(200).json({
        status:    'ok',
        service:   'Bodhisatvvam Backend',
        timestamp: new Date().toISOString(),
        env: {
            whatsapp:    !!WHATSAPP_TOKEN,
            googleSheet: !!GOOGLE_SCRIPT_URL,
            cors:        ALLOWED_ORIGIN,
        },
    });
});

// ── 7. START SERVER ──────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌸 Bodhisatvvam server running on port ${PORT}`);
    console.log(`   CORS origin  : ${ALLOWED_ORIGIN}`);
    console.log(`   WhatsApp     : ${WHATSAPP_TOKEN ? '✅ configured' : '❌ not set'}`);
    console.log(`   Google Sheet : ${GOOGLE_SCRIPT_URL ? '✅ configured' : '❌ not set'}`);
});
