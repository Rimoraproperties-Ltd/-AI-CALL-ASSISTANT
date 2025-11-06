// ====== DEPENDENCIES ======
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");

// ====== APP SETUP ======
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ====== ENV VARIABLES ======
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

// ====== HEALTH CHECK ======
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Server is running successfully 🚀",
    environment: {
      TWILIO_ACCOUNT_SID: accountSid ? "✅ Loaded" : "❌ Missing",
      TWILIO_AUTH_TOKEN: authToken ? "✅ Loaded" : "❌ Missing",
      TWILIO_PHONE_NUMBER: fromNumber ? "✅ Loaded" : "❌ Missing",
      PORT: process.env.PORT || 3000,
    },
    timestamp: new Date().toISOString(),
  });
});

// ====== MAKE CALL ENDPOINT ======
app.post("/makecall", async (req, res) => {
  const to = req.body.to || req.query.to;

  if (!to) {
    return res.status(400).json({
      success: false,
      error: "Missing 'to' parameter (in body or query string)",
    });
  }

  try {
    const call = await client.calls.create({
      to: to,
      from: fromNumber,
      url: "https://ai-call-assistant-znyw.onrender.com/voice",
    });

    res.json({ success: true, callSid: call.sid });
  } catch (error) {
    console.error("Error making the call:", error.message);
    res.json({ success: false, error: error.message });
  }
});

// ====== VOICE RESPONSE ======
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    "Hi, this is Tosin from the Diamond Project. You were selected for an event this Sunday at Novare Mall Abuja. Would you like to confirm your attendance?"
  );
  res.type("text/xml");
  res.send(twiml.toString());
});

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
