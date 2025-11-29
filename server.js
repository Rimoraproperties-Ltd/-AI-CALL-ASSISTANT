const express = require("express");
const cors = require("cors");
const { urlencoded } = require("body-parser");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(urlencoded({ extended: false }));

const twilio = require("twilio");
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// HEALTH CHECK
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        message: "Server is running successfully 🚀",
        environment: {
            TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? "✅ Loaded" : "❌ Missing",
            TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? "✅ Loaded" : "❌ Missing",
            TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ? "✅ Loaded" : "❌ Missing",
            PORT: process.env.PORT || 3000
        },
        timestamp: new Date().toISOString()
    });
});

// MAIN CALL ENDPOINT (with script support)
app.post("/makecall", async (req, res) => {
    try {
        const { to, message } = req.query;

        if (!to) {
            return res.status(400).json({ success: false, error: "Missing 'to' parameter" });
        }

        const finalMessage =
            message ||
            "Hello, this is your automated call assistant speaking. No script was provided.";

        const twimlResponse = `<Response><Say>${finalMessage}</Say></Response>`;

        const call = await client.calls.create({
            twiml: twimlResponse,
            to,
            from: process.env.TWILIO_PHONE_NUMBER
        });

        res.json({
            success: true,
            message: "Call initiated successfully",
            sid: call.sid
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
