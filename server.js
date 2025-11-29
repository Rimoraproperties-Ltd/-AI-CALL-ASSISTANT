const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const twilio = require("twilio");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Store script here temporarily
let callScript = "Hello, this is your call assistant.";

// Update script from dashboard
app.post("/api/script", (req, res) => {
    if (!req.body.script) {
        return res.status(400).json({ success: false, message: "Script is required" });
    }
    callScript = req.body.script;
    res.json({ success: true, message: "Script updated", script: callScript });
});

// Twilio Voice webhook
app.post("/voice", (req, res) => {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    // Read dynamic script
    twiml.say({ voice: "alice", language: "en-US" }, callScript);

    res.type("text/xml");
    res.send(twiml.toString());
});

// Make call
app.post("/api/makecall", async (req, res) => {
    try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

        const call = await client.calls.create({
            to: req.body.to,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: process.env.BASE_URL + "/voice"
        });

        res.json({ success: true, message: "Call started", sid: call.sid });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Call failed",
            error: err.message
        });
    }
});

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
