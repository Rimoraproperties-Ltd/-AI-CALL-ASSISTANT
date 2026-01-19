require("dotenv").config();
const express = require("express");
const cors = require("cors");
const AfricasTalking = require("africastalking");

const app = express();
app.use(cors());
app.use(express.json());

// ------------------ AFRICA'S TALKING INIT ------------------
const AT = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

const atVoice = AT.VOICE;
const atSMS = AT.SMS;

// ------------------ BASIC HEALTH CHECK ------------------
app.get("/", (req, res) => {
  res.send("Africa's Talking Sandbox Server Running");
});

// ------------------ TEST SANDBOX VOICE ------------------
app.get("/test-voice", async (req, res) => {
  try {
    await atVoice.call({
      callFrom: process.env.AT_CALLER_ID,
      callTo: ["+234XXXXXXXXXX"] // REPLACE with your phone number
    });

    res.send("Sandbox voice call sent. Your phone should ring.");
  } catch (error) {
    console.error("VOICE ERROR:", error);
    res.status(500).send("Voice call failed. Check logs.");
  }
});

// ------------------ TEST SANDBOX SMS ------------------
app.get("/test-sms", async (req, res) => {
  try {
    await atSMS.send({
      to: ["+234XXXXXXXXXX"], // REPLACE with your phone number
      message: "Test SMS from Africa's Talking Sandbox"
    });

    res.send("Sandbox SMS sent. Check your phone.");
  } catch (error) {
    console.error("SMS ERROR:", error);
    res.status(500).send("SMS failed. Check logs.");
  }
});

// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sandbox server running on port ${PORT}`);
});
