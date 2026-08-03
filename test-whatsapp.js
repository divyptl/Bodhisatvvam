const axios = require('axios');

// ==========================================
// WHATSAPP TEST CONFIGURATION
// ==========================================
// Replace these with your actual WhatsApp API credentials
const WHATSAPP_TOKEN = 'EAAUVDhZATxZAgBSJf7vJ6B6HIf4fGqWMbRNZAdlNdGV4ZA5UA80TCVG00aT4tpn0FDprfSURN46oPLZC8QzoMVOvd9t65tAcwet74suJK9mNkyMcNA87AjZAEJEkH5IBMeeXaNlVlSPnMM4wPMoUM33vCZAyZBObmOGvwEZCNZAdZBxEEMrrLiqaud7NBZC5s7K12jueYwZDZD';
const PHONE_NUMBER_ID = '1047297138466995';

// The phone number you want to send the test message to (include country code, e.g., 919876543210)
const TEST_PHONE_NUMBER = '919904447959';

// ==========================================
// MOCK DATA FOR THE MESSAGE
// ==========================================
const name = "Test User";
const orderId = "#BDH-TEST-1234";
const items = [
    { name: "Test Product 1", qty: 1, price: 500 },
    { name: "Test Product 2", qty: 2, price: 250 }
];
const total = "Rs. 1000";
const address = "123 Test Street, Test City, 123456";
const customerNotes = "This is a test order note.";

function formatItemsForWhatsApp(items) {
    if (Array.isArray(items)) {
        return items.map(i => `- ${i.name} x${i.qty} @ Rs.${i.price}`).join('\n');
    }
    return String(items);
}

async function sendTestWhatsApp() {
    if (WHATSAPP_TOKEN === 'YOUR_WHATSAPP_TOKEN_HERE' || PHONE_NUMBER_ID === 'YOUR_PHONE_NUMBER_ID_HERE') {
        console.error("❌ ERROR: Please replace the placeholder tokens in this script or set them in your environment variables.");
        return;
    }

    if (TEST_PHONE_NUMBER === 'YOUR_TEST_PHONE_NUMBER_HERE') {
        console.error("❌ ERROR: Please set your TEST_PHONE_NUMBER in the script.");
        return;
    }

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

        console.log("Sending the following message to:", TEST_PHONE_NUMBER);
        console.log("==========================================");
        console.log(body);
        console.log("==========================================\n");

        const phoneString = TEST_PHONE_NUMBER.toString();
        const toPhone = phoneString.startsWith('+') ? phoneString : '+' + phoneString;

        const waResponse = await axios.post(
            `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
            { messaging_product: 'whatsapp', to: toPhone, type: 'text', text: { body } },
            { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 10000 }
        );

        console.log(`✅ WhatsApp sent successfully!`);
        console.log(`   Meta response status : ${waResponse.status}`);
        console.log(`   Meta response data   : ${JSON.stringify(waResponse.data)}`);
    } catch (err) {
        const code = err?.response?.data?.error?.code || 'unknown';
        const type = err?.response?.data?.error?.type || 'unknown';
        const msg = err?.response?.data?.error?.message || err.message;
        console.error(`❌ WhatsApp error → Code ${code} [${type}]: ${msg}`);
        console.error(`   Full error response: ${JSON.stringify(err?.response?.data, null, 2)}`);
    }
}

sendTestWhatsApp();
