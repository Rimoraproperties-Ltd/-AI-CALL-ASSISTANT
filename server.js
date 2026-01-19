require("dotenv").config();
const express = require("express");
const cors = require("cors");
const AfricasTalking = require("africastalking");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Africa's Talking
const AT = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

const atSMS = AT.SMS;

// Health check
app.get("/", (req, res) => {
  res.send("Africa's Talking SMS Sandbox Running");
});

// TEST SMS ROUTE
app.get("/test-sms", async (req, res) => {
  try {
    await atSMS.send({
      to: ["+234XXXXXXXXXX"], // 🔴 REPLACE with YOUR phone number
      message: "Test SMS from Africa's Talking Sandbox"
    });

    res.send("SMS sent successfully. Check your phone.");
  } catch (err) {
    console.error("SMS ERROR:", err);
    res.status(500).send("SMS failed. Check Render logs.");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("SMS Sandbox server running on port", PORT);
});
