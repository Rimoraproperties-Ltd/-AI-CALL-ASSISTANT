// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();

// Load Twilio credentials from environment variables
const ACCOUNT_SID = process.env.ACCOUNT_SID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const TWILIO_NUMBER = process.env.TWILIO_NUMBER;

if (!ACCOUNT_SID || !AUTH_TOKEN || !TWILIO_NUMBER) {
    console.error("❌ Missing environment variables!");
    console.error("Make sure ACCOUNT_SID, AUTH_TOKEN, and TWILIO_NUMBER are set.");
    process.exit(1);
}

// Twilio client
const client = require("twilio")(ACCOUNT_SID, AUTH_TOKEN);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// 📞 MAKE CALL ROUTE
// =========================
app.get("/makecall", async (req, res) => {
    const to = req.query.to;

    if (!to) {
        return res.json({ success: false, error: "Missing 'to' parameter" });
    }

    try {
        const call = await client.calls.create({
            to: to,
            from: TWILIO_NUMBER,
            url: "https://handler.twilio.com/twiml/EHf6e5b0824bc98b68a0fff4d7f83b1c9b" // Your TwiML BIN URL
        });

        console.log("📞 Call started:", call.sid);
        return res.json({ success: true, sid: call.sid });

    } catch (error) {
        console.error("❌ Twilio Error:", error);
        return res.json({ success: false, error: error.message });
    }
});

// Root
app.get("/", (req, res) => {
    res.send("AI Call Server Running 🚀");
});

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
