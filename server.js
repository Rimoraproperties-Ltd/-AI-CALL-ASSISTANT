const path = require("path");

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const twilio = require("twilio");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ===============================
// ENV VARIABLES (FROM RENDER)
// ===============================
const BASE_URL = process.env.BASE_URL;

const AT_USERNAME = process.env.AT_USERNAME;
const AT_API_KEY = process.env.AT_API_KEY;
const AT_VIRTUAL_NUMBER = process.env.AT_VIRTUAL_NUMBER;

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ===============================
// INIT CLIENTS
// ===============================
const twilioClient = twilio(
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN
);

// Google Sheets (ENV JSON)
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// ===============================
// MEMORY STORE
// ===============================
let callLogs = [];

// ===============================
// GOOGLE SHEETS LOGGER
// ===============================
async function logToSheets(number, response) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:C",
      valueInputOption: "RAW",
      requestBody: {
        values: [[number, new Date().toISOString(), response]],
      },
    });

    console.log("✅ Logged to Google Sheets");
  } catch (error) {
    console.error("❌ Sheets error:", error.message);
  }
}

// ===============================
// HYBRID SMS
// ===============================
async function sendSMSHybrid(to, message) {
  try {
    await axios.post(
      "https://api.africastalking.com/version1/messaging",
      new URLSearchParams({
        username: AT_USERNAME,
        to,
        message,
      }),
      {
        headers: {
          apiKey: AT_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("✅ SMS via Africa's Talking");
    return "AT";
  } catch (err) {
    console.log("⚠️ AT SMS failed → Twilio fallback");

    await twilioClient.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to,
    });

    return "Twilio";
  }
}

// ===============================
// HYBRID CALL
// ===============================
async function makeCallHybrid(to) {
  try {
    await axios.post(
      "https://voice.africastalking.com/call",
      new URLSearchParams({
        username: AT_USERNAME,
        to,
        from: AT_VIRTUAL_NUMBER,
      }),
      {
        headers: {
          apiKey: AT_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("📞 Call via Africa's Talking");
    return "AT";
  } catch (err) {
    console.log("⚠️ AT Call failed → Twilio fallback");

    await twilioClient.calls.create({
      to,
      from: TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/twilio-voice`,
    });

    return "Twilio";
  }
}

// ===============================
// AFRICA'S TALKING VOICE WEBHOOK
// ===============================
app.post("/at-voice", async (req, res) => {
  res.type("text/xml");

  const caller = req.body.from;
  const digits = req.body.digits;

  if (digits) {
    let status;

    if (digits === "1") {
      status = "YES";
      await sendSMSHybrid(
        caller,
        "Super congratulations! Your reservation has been confirmed."
      );
    } else if (digits === "2") {
      status = "NO";
    } else {
      status = "INVALID";
    }

    callLogs.push({
      number: caller,
      response: status,
      time: new Date().toISOString(),
    });

    await logToSheets(caller, status);

    return res.send(`
      <Response>
        <Say>Thank you for your response.</Say>
      </Response>
    `);
  }

  res.send(`
    <Response>
      <Say>
        Super congratulations!
        Press 1 if available, press 2 if not.
      </Say>
      <GetDigits timeout="10" callbackUrl="${BASE_URL}/at-voice" />
    </Response>
  `);
});

// ===============================
// TWILIO VOICE (FALLBACK)
// ===============================
app.post("/twilio-voice", (req, res) => {
  res.type("text/xml");

  res.send(`
    <Response>
      <Say>
        Super congratulations!
        Press 1 if available, press 2 if not.
      </Say>
      <Gather numDigits="1" action="/twilio-response" method="POST" />
    </Response>
  `);
});

app.post("/twilio-response", async (req, res) => {
  res.type("text/xml");

  const caller = req.body.From;
  const digit = req.body.Digits;

  let status;

  if (digit === "1") {
    status = "YES";
    await sendSMSHybrid(
      caller,
      "Super congratulations! Your reservation has been confirmed."
    );
  } else if (digit === "2") {
    status = "NO";
  } else {
    status = "INVALID";
  }

  callLogs.push({
    number: caller,
    response: status,
    time: new Date().toISOString(),
  });

  await logToSheets(caller, status);

  res.send(`<Response><Say>Thank you.</Say></Response>`);
});

// ===============================
// RETRY LOGIC
// ===============================
async function retryCall(number) {
  console.log("🔁 Retrying:", number);
  await makeCallHybrid(number);
}

// ===============================
// SINGLE CALL
// ===============================
app.post("/api/makecall", async (req, res) => {
  const { to } = req.body;

  const provider = await makeCallHybrid(to);

  setTimeout(() => {
    const record = callLogs.find(log => log.number === to);
    if (!record) retryCall(to);
  }, 2 * 60 * 1000);

  res.json({ success: true, provider });
});

// ===============================
// BULK CALL
// ===============================
app.post("/api/bulk-call", async (req, res) => {
  const { numbers } = req.body;

  if (!Array.isArray(numbers)) {
    return res.status(400).json({ error: "Numbers must be an array" });
  }

  for (let i = 0; i < numbers.length; i++) {
    setTimeout(async () => {
      console.log("📞 Calling:", numbers[i]);
      await makeCallHybrid(numbers[i]);
    }, i * 5000);
  }

  res.json({ success: true, total: numbers.length });
});

// ===============================
// FOLLOW-UP SMS (YES USERS)
// ===============================
app.post("/api/followup-yes", async (req, res) => {
  const yesUsers = callLogs.filter(l => l.response === "YES");

  for (let user of yesUsers) {
    await sendSMSHybrid(
      user.number,
      "Reminder: Your reservation is confirmed."
    );
  }

  res.json({ success: true, sent: yesUsers.length });
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
// LOGS
// ===============================
app.get("/api/logs", (req, res) => {
  res.json(callLogs);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🔥 Server running on port ${PORT}`)
);
