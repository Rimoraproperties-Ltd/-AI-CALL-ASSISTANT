require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const util = require("util");
const textToSpeech = require("@google-cloud/text-to-speech");
const twilio = require("twilio");
const { v4: uuidv4 } = require("uuid");
const XLSX = require("xlsx");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------
// BASIC CONFIG
// ---------------------------------------------------------------
const BASE_URL =
  process.env.BASE_URL || "https://ai-call-assistant-znyw.onrender.com";
const TMP_DIR = __dirname;
const RESP_FILE = path.join(TMP_DIR, "responses.xlsx");

// ---------------------------------------------------------------
// GOOGLE TTS CLIENT
// ---------------------------------------------------------------
let ttsClient;
try {
  ttsClient = new textToSpeech.TextToSpeechClient();
  console.log("Google TTS initialized using GOOGLE_APPLICATION_CREDENTIALS");
} catch (err) {
  console.error("Google TTS Initialization ERROR:", err);
}

// ---------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------
function cleanText(t) {
  if (!t) return "";
  return String(t).replace(/[&<>"]/g, "");
}

// ⭐ NEW: Slightly deeper, natural, professional female SSML
function buildSSML(script) {
  const question =
    "If we go ahead and reserve a slot for you, would you be available? " +
    "Press 1 if you are available, or press 2 if you are not.";

  return `
    <speak>
      <prosody rate="96%" pitch="-0.5st">
        <break time="200ms"/>
        ${script}
        <break time="350ms"/>
        <emphasis level="moderate">${question}</emphasis>
      </prosody>
    </speak>
  `;
}

// Excel logging
function appendResponse(phone, status, timestamp) {
  let data = [];

  if (fs.existsSync(RESP_FILE)) {
    const wb = XLSX.readFile(RESP_FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    data = XLSX.utils.sheet_to_json(ws);
  }

  data.push({
    Phone: phone,
    Status: status,
    Timestamp: timestamp,
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Responses");
  XLSX.writeFile(wb, RESP_FILE);
}

// ---------------------------------------------------------------
// SCRIPT + SMS TEMPLATE STORAGE
// ---------------------------------------------------------------
let callScript = "Hello, this is your call assistant.";
let smsTemplate = "Your reservation has been received. We will contact you shortly.";

// Update script
app.post("/api/script", (req, res) => {
  const script = req.body.script;
  if (!script)
    return res.status(400).json({ success: false, message: "Invalid script" });

  callScript = cleanText(script);
  return res.json({ success: true });
});

// Update SMS template
app.post("/api/sms-template", (req, res) => {
  const sms = req.body.sms;
  if (!sms)
    return res
      .status(400)
      .json({ success: false, message: "Invalid SMS template" });

  smsTemplate = sms.trim();
  return res.json({ success: true });
});

// ---------------------------------------------------------------
// MAKE CALL
// ---------------------------------------------------------------
app.post("/api/makecall", async (req, res) => {
  const to = req.body.to;

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const call = await client.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice`,
    });

    return res.json({ success: true, sid: call.sid });
  } catch (err) {
    console.error("Twilio call error:", err);
    return res.status(500).json({
      success: false,
      message: "TWILIO_ERROR",
      error: err.message || String(err),
    });
  }
});

// ---------------------------------------------------------------
// TWILIO VOICE HANDLER
// ---------------------------------------------------------------
app.post("/voice", async (req, res) => {
  const ua = req.headers["user-agent"] || "";
  if (!ua.includes("Twilio"))
    return res.json({ error: "VOICE_ENDPOINT_FOR_TWILIO_ONLY" });

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const safeText = cleanText(callScript);
  const ssml = buildSSML(safeText);

  const ttsRequest = {
    input: { ssml },
    voice: {
      languageCode: "en-US",
      name: "en-US-Neural2-F",
      ssmlGender: "FEMALE",
    },
    audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
  };

  try {
    const [audioResponse] = await ttsClient.synthesizeSpeech(ttsRequest);

    const fileName = `voice-${Date.now()}-${uuidv4()}.mp3`;
    const filePath = path.join(TMP_DIR, fileName);

    await util.promisify(fs.writeFile)(
      filePath,
      audioResponse.audioContent,
      "binary"
    );

    const gather = twiml.gather({
      numDigits: 1,
      action: `${BASE_URL}/gather`,
      method: "POST",
      timeout: 8,
    });

    gather.play(`${BASE_URL}/${fileName}`);

    twiml.say("We did not receive any input. Goodbye.");

    res.type("text/xml");
    res.send(twiml.toString());

    setTimeout(() => fs.unlink(filePath, () => {}), 60000);
  } catch (err) {
    console.error("TTS ERROR:", err);
    twiml.say("There was an error generating the voice.");
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// ---------------------------------------------------------------
// GATHER INPUT (1 OR 2)
// ---------------------------------------------------------------
app.post("/gather", async (req, res) => {
  const digit = req.body.Digits;
  const from = req.body.From;
  const timestamp = new Date().toISOString();

  let status = digit === "1" ? "Yes" : digit === "2" ? "No" : "Invalid";

  appendResponse(from, status, timestamp);

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  if (digit === "1") {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await client.messages.create({
      to: from,
      from: process.env.TWILIO_PHONE_NUMBER,
      body: smsTemplate, // ⭐ CUSTOM SMS TEMPLATE
    });

    twiml.say("Thank you. You will receive a reservation text shortly.");
  } else if (digit === "2") {
    twiml.say("Thank you. We have recorded that you are not available.");
  } else {
    twiml.say("Invalid input received. Goodbye.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ---------------------------------------------------------------
// VIEW EXCEL (NOT DOWNLOAD)
// ---------------------------------------------------------------
app.get("/api/view-reservations", (req, res) => {
  if (!fs.existsSync(RESP_FILE))
    return res.send("<h2>No reservation responses recorded yet.</h2>");

  const wb = XLSX.readFile(RESP_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const html = XLSX.utils.sheet_to_html(ws);

  res.send(`
    <html>
    <head>
      <title>Reservation Responses</title>
      <style>
        body { font-family: Arial; padding: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 10px; }
        th { background: #007bff; color: white; }
      </style>
    </head>
    <body>
      <h2>Reservation Responses</h2>
      ${html}
    </body>
    </html>
  `);
});

// ---------------------------------------------------------------
// STATIC + HEALTH CHECK
// ---------------------------------------------------------------
app.use(express.static(TMP_DIR));
app.get("/", (req, res) => res.json({ status: "SERVER_RUNNING" }));

// ---------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------
app.listen(process.env.PORT || 3000, () =>
  console.log("SERVER RUNNING...")
);

