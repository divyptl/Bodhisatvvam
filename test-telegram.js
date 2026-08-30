require('dotenv').config();
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in your environment variables.");
    console.log("Currently found:");
    console.log("TELEGRAM_BOT_TOKEN:", TELEGRAM_BOT_TOKEN ? "✅ Set" : "❌ Missing");
    console.log("TELEGRAM_CHAT_ID:", TELEGRAM_CHAT_ID ? "✅ Set" : "❌ Missing");
    process.exit(1);
}

async function testTelegram() {
    console.log(`Sending test message to Chat ID: ${TELEGRAM_CHAT_ID}...`);
    try {
        const res = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHAT_ID,
                text: "✅ *Test message* from Bodhisatvvam server! Telegram is working perfectly.",
                parse_mode: 'Markdown'
            }
        );
        console.log("✅ Success! Message sent successfully.");
        console.log("Response from Telegram:", res.data.result.text);
    } catch (err) {
        console.error("❌ Failed to send message!");
        console.error("Error details:", err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
        
        if (err.response && err.response.data.description.includes("chat not found")) {
            console.log("\n💡 FIX: Telegram says 'chat not found'. This means your TELEGRAM_CHAT_ID is incorrect, OR you haven't sent a message to the bot yet.");
        } else if (err.response && err.response.data.description.includes("bot can't initiate conversation")) {
            console.log("\n💡 FIX: You MUST open Telegram and send /start to your bot before it can message you.");
        } else if (err.response && err.response.data.error_code === 401) {
            console.log("\n💡 FIX: Your TELEGRAM_BOT_TOKEN is incorrect. Please copy it exactly from @BotFather.");
        }
    }
}

testTelegram();
