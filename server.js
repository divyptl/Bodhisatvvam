const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());

// Serve the frontend UI
app.use(express.static(path.join(__dirname, 'public')));

// Environment Variables// Environment Variables
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

app.post('/api/order', async (req, res) => {
    const { name, phone, address, items, total } = req.body;
    const orderId = '#BDH-' + Math.floor(10000 + Math.random() * 90000);

    console.log(`Processing Order ${orderId} for ${name}`);


    const messageBody = `*Namaste ${name},*\n\nThank you for choosing Bodhisatvvam! ✨\n\n*Order Details (${orderId}):*\nItems: ${items}\nTotal: ${total}\nDelivery to: ${address}\n\nWe will review your request and confirm your order shortly.\n\nEmpower Your Life,\n-Shree Bodhisatvvam Team`;

    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: phone.replace(/\D/g, ''), // Strips non-numeric characters
                type: "text",
                text: { body: messageBody }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        await axios.post(GOOGLE_SCRIPT_URL, {
            orderId, name, phone, address, items, total
        });

        res.status(200).json({ success: true, message: "Order logged and notified." });
    } catch (error) {
        console.error("Backend Error:", error?.response?.data || error.message);
        res.status(500).json({ success: false, message: "Server encountered an issue." });
    }
});

// Start the server and force it to bind to Render's port
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bodhisatvvam server successfully awake and running on port ${PORT}`);
});
