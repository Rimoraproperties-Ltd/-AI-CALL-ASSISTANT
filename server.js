const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Load environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const PORT = process.env.PORT || 3000;

// Initialize Twilio client
const client = twilio(accountSid, authToken);

// --------------------------------------------------
// HEALTH CHECK ENDPOINT
// --------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Server is running successfully 🚀",
    environment: {
      TWILIO_ACCOUNT_SID: accountSid ? "✅ Loaded" : "❌ Missing",
      TWILIO_AUTH_TOKEN: authToken ? "✅ Loaded" : "❌ Missing",
      TWILIO_PHONE_NUMBER: fromNumber ? "✅ Loaded" : "❌ Missing",
      PORT: PORT
    },
    timestamp: new Date().toISOString(),
  });
});

// --------------------------------------------------
// CALL MAKING ENDPOINT (GET + POST)
// --------------------------------------------------
app.all("/makecall", async (req, res) => {
  const to = req.query.to || req.body.to;

  if (!to) {
    return res.status(400).json({
      success: false,
      error: "Missing 'to' number. Use /makecall?to=+234XXXXXXXXXX"
    });
  }

  try {
    const call = await client.calls.create({
      to: to,
      from: fromNumber,
      url: "https://ai-call-assistant-znyw.onrender.com/voice"
    });

    res.json({ success: true, sid: call.sid });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// --------------------------------------------------
// TWILIO VOICE WEBHOOK
// --------------------------------------------------
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say("Hello! This is your automated assistant speaking. This call was placed successfully.");
  res.type("text/xml");
  res.send(twiml.toString());
});

// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
