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

const twilioClient = twilio(
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN
);

// ===============================
// MEMORY
// ===============================
let callLogs = [];
let callScript = "Hello, this is your call assistant.";

// ===============================
// UPDATE SCRIPT
// ===============================
app.post("/api/script", (req, res) => {
  callScript = req.body.script || callScript;
  res.json({ success: true });
});

// ===============================
// HYBRID CALL FUNCTION
// ===============================
async function makeCallHybrid(to) {
  console.log("📞 Attempting call:", to);

  try {
    const response = await axios.post(
      "https://voice.africastalking.com/call",
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

    // 🔥 SHOW REAL ERROR
    console.log("❌ AT ERROR FULL:", err.response?.data || err.message);

    // ===============================
    // TWILIO FALLBACK
    // ===============================
    try {
      await twilioClient.calls.create({
        to: to,
        from: TWILIO_PHONE_NUMBER,
        url: `${BASE_URL}/twilio-voice`,
      });

      console.log("✅ Twilio fallback success");

      return "Twilio";

    } catch (twilioErr) {

      console.log("❌ Twilio also failed:", twilioErr.message);

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

    console.log("📤 Numbers received:", numbers);

    numbers.forEach((num, i) => {
      setTimeout(() => {
        makeCallHybrid(num);
      }, i * 4000);
    });

    res.json({ success: true, total: numbers.length });

  } catch (err) {
    console.error("❌ Bulk call error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// AT VOICE WEBHOOK
// ===============================
app.post("/at-voice", (req, res) => {
  res.type("text/xml");

  const digits = req.body.digits;
  const caller = req.body.from;

  if (digits) {
    let status = "INVALID";

    if (digits === "1") status = "YES";
    if (digits === "2") status = "NO";

    callLogs.push({
      number: caller,
      response: status,
      time: new Date().toISOString(),
    });

    return res.send(`
      <Response>
        <Say>Thank you for your response</Say>
      </Response>
    `);
  }

  res.send(`
    <Response>
      <Say>${callScript}</Say>
      <GetDigits timeout="10" callbackUrl="${BASE_URL}/at-voice"/>
    </Response>
  `);
});

// ===============================
// TWILIO VOICE
// ===============================
app.post("/twilio-voice", (req, res) => {
  res.type("text/xml");

  res.send(`
    <Response>
      <Say>${callScript}</Say>
      <Gather numDigits="1" action="/twilio-response"/>
    </Response>
  `);
});

app.post("/twilio-response", (req, res) => {
  res.type("text/xml");

  const digit = req.body.Digits;
  const caller = req.body.From;

  let status = "INVALID";

  if (digit === "1") status = "YES";
  if (digit === "2") status = "NO";

  callLogs.push({
    number: caller,
    response: status,
    time: new Date().toISOString(),
  });

  res.send("<Response><Say>Thank you</Say></Response>");
});

// ===============================
// STATS
// ===============================
app.get("/api/stats", (req, res) => {
  const total = callLogs.length;
  const yes = callLogs.filter(l => l.response === "YES").length;
  const no = callLogs.filter(l => l.response === "NO").length;

  res.json({
    total,
    yes,
    no,
    conversionRate: total
      ? ((yes / total) * 100).toFixed(2) + "%"
      : "0%",
  });
});

// ===============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
