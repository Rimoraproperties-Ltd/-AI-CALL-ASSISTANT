const express = require("express");
const cors = require("cors");
const axios = require("axios");
const twilio = require("twilio");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, "public")));

// ENV
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

let callLogs = [];
let callScript = "Hello, press 1 if available, press 2 if not.";

// ===============================
// FORCE CALL TEST
// ===============================
app.get("/force-call", async (req, res) => {
  try {
    const response = await axios.post(
      "https://voice.africastalking.com/call",
      new URLSearchParams({
        username: AT_USERNAME,
        to: "+2349026645633",
        from: AT_VIRTUAL_NUMBER,
        callBackUrl: BASE_URL + "/at-voice",
      }),
      {
        headers: {
          apiKey: AT_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("AT SUCCESS:", response.data);
    res.json(response.data);

  } catch (err) {
    console.log("AT ERROR:", err.response?.data || err.message);
    res.json({ error: err.response?.data || err.message });
  }
});

// ===============================
// CALL FUNCTION
// ===============================
async function makeCall(to) {
  try {
    await axios.post(
      "https://voice.africastalking.com/call",
      new URLSearchParams({
        username: AT_USERNAME,
        to: to,
        from: AT_VIRTUAL_NUMBER,
        callBackUrl: BASE_URL + "/at-voice",
      }),
      {
        headers: {
          apiKey: AT_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("Call queued:", to);

  } catch (err) {
    console.log("Call error:", err.response?.data || err.message);
  }
}

// ===============================
// BULK CALL
// ===============================
app.post("/api/bulk-call", async (req, res) => {
  const numbers = req.body.numbers;

  if (!Array.isArray(numbers)) {
    return res.status(400).json({ error: "numbers must be array" });
  }

  numbers.forEach((num, i) => {
    setTimeout(() => makeCall(num), i * 3000);
  });

  res.json({ success: true });
});

// ===============================
// AT WEBHOOK
// ===============================
app.post("/at-voice", (req, res) => {
  res.type("text/xml");

  res.send(
    "<Response><Say>Hello, press 1 or 2</Say><GetDigits timeout='10' callbackUrl='" +
      BASE_URL +
      "/at-voice'/></Response>"
  );
});

// ===============================
// HOME
// ===============================
app.get("/", (req, res) => {
  res.send("Server running");
});

// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
