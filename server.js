const express = require("express");
const cors = require("cors");
const axios = require("axios");
const twilio = require("twilio");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// ENV VARIABLES
// ===============================
const BASE_URL = process.env.BASE_URL;

const AT_USERNAME = process.env.AT_USERNAME;
const AT_API_KEY = process.env.AT_API_KEY;
const AT_VIRTUAL_NUMBER = process.env.AT_VIRTUAL_NUMBER;

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

console.log("USING AT USERNAME:", AT_USERNAME);

const twilioClient = twilio(
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN
);

// ===============================
// MEMORY
// ===============================
let callLogs = [];
let callScript = "Hello, press 1 if available, press 2 if not.";

// ===============================
// UPDATE SCRIPT
// ===============================
app.post("/api/script", (req, res) => {
  callScript = req.body.script || callScript;
  res.json({ success: true });
});

// ===============================
// 🔥 FORCE TEST (FIXED ENDPOINT)
// ===============================
app.get("/force-call", async (req, res) => {
  try {
    const response = await axios.post(
      "https://voice.africastalking.com/call", // ✅ FIXED
      new URLSearchParams({
        username: AT_USERNAME,
        to: "+2349026645633",
        from: AT_VIRTUAL_NUMBER,
        callBackUrl: `${BASE_URL}/at-voice`,
      }),
      {
        headers: {
          apiKey: AT_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("🔥 FORCE CALL SUCCESS:", response.data);

    res.json({
      success: true,
      data: response.data,
    });

  } catch (err) {
    const fullError = err.response?.data || err.message;

    console.log("❌ FORCE CALL ERROR FULL:", fullError);

    res.json({
      success: false,
      error: fullError,
    });
  }
});

// ===============================
// HYBRID CALL FUNCTION (FIXED)
// ===============================
async function makeCallHybrid(to) {
  console.log("📞 Attempting call:", to);

  try {
    const response = await axios.post(
      "https://voice.africastalking.com/call", // ✅ FIXED
      new URLSearchParams({
        username: AT_USERNAME,
        to: to,
        from: AT_VIRTUAL_NUMBER,
        callBackUrl: `${BASE_URL}/at-voice`,
      }),
      {
        headers: {
          apiKey: AT_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("✅ AT SUCCESS:", response.data);

    return "AT";

  } catch (err) {
    const atError = err.response?.data || err.message;

    console.log("❌ AT ERROR FULL:", atError);

    // Twilio fallback
    try {
      await twilioClient.calls.create({
        to: to,
        from: TWILIO_PHONE_NUMBER,
        url: `${BASE_URL}/twilio-voice`,
      });

      console.log("✅ Twilio fallback success");

      return "Twilio";

    } catch (twilioErr) {
      console.log("❌ Twilio failed:", twilioErr.message);
      return "FAILED";
    }
  }
}

// ===============================
// BULK CALL
// ===============================
app.post("/api/bulk-call", async (req, res) => {
  try {
    const numbers = req.body.numbers;

    if (!Array.isArray(numbers)) {
      return res.status(400).json({ error: "numbers must be array" });
    }

    console.log("📤
