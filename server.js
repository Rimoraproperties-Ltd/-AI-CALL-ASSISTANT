// ================================
// server.js — SAFE FOR GITHUB
// ================================

const express = require("express");
const cors = require("cors");
const { Twilio } = require("twilio");

const app = express();
app.use(cors());
app.use(express.json());

// Load environment variables
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio Client
const client = new Twilio(ACCOUNT_SID, AUTH_TOKEN);

// ================================
// HEALTH CHECK ENDPOINT
// ================================
app.get("/health", (req, res) => {
    return res.json({
        status: "ok",
        message: "Server is running successfully 🚀",
        environment: {
            TWILIO_ACCOUNT_SID: ACCOUNT_SID ? "✅ Loaded" : "❌ Missing",
            TWILIO_AUTH_TOKEN: AUTH_TOKEN ? "✅ Loaded" : "❌ Missing",
            TWILIO_PHONE_NUMBER: TWILIO_NUMBER ? "✅ Loaded" : "❌ Missing",
            PORT: process.env.PORT || "3000"
        },
        timestamp: new Date().toISOString()
    });
});

// ================================
// MAKE CALL ENDPOINT
// ================================
app.post("/makecall", async (req, res) => {
    try {
        const to = req.query.to || req.body.to;

        if (!to) {
            return res.status(400).json({
                success: false,
                error: "Missing 'to' phone number"
            });
        }

        console.log("📞 Making call to:", to);

        const call = await client.calls.create({
            to: to,
            from: TWILIO_NUMBER,
            url: "https://handler.twilio.com/twiml/EH0c1a48bfd757b698f217b588cc50ee4d" // Your TwimlBin or Twilio Function URL
        });

        return res.json({
            success: true,
            message: "Call initiated successfully",
            sid: call.sid
        });

    } catch (error) {
        console.error("❌ Call error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ================================
// START SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
