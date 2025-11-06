// ====== DEPENDENCIES ======
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");

// ====== APP SETUP ======
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// ====== ENV VARIABLES ======
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

// ====== TEST ENV CHECK ======
app.get("/checkenv", (req, res) => {
  res.json({
    TWILIO_ACCOUNT_SID: accountSid ? "✅ Loaded" : "❌ Missing",
    TWILIO_AUTH_TOKEN: authToken ? "✅ Loaded" : "❌ Missing",
    TWILIO_PHONE_NUMBER: fromNumber ? "✅ Loaded" : "❌ Missing",
    PORT: process.env.PORT || "Not set",
  });
});

// ====== MAKE CALL ENDPOINT ======
app.get("/makecall", async (req, res) => {
  const to = req.query.to;
  if (!to) {
    return res.status(400).send("Please provide a 'to' number in the URL, e.g. /makecall?to=+2348012345678");
  }

  try {
    const call = await client.calls.create({
      to: to,
      from: fromNumber,
      url: "https://ai-call-assistant-znyw.onrender.com/voice", // 👈 this points back to your Render app
    });
    res.json({ success: true, sid: call.sid });
  } catch (error) {
    console.error("❌ Error making the call:", error.message);
    res.json({ success: false, error: error.message });
  }
});

// ====== VOICE RESPONSE ======
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say("Hello, this is Rowaiye Call Assistant. Your booking request has been received. Thank you.");
  res.type("text/xml");
  res.send(twiml.toString());
});

// ====== START SERVER ======
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
