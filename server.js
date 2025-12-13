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

// --------------------------------------------------
// CONFIG
// --------------------------------------------------
const BASE_URL =
  process.env.BASE_URL || "https://ai-call-assistant-znyw.onrender.com";
const TMP_DIR = __dirname;
const RESP_FILE = path.join(TMP_DIR, "responses.xlsx");

// --------------------------------------------------
// GOOGLE TTS CLIENT
// --------------------------------------------------
const ttsClient = new textToSpeech.TextToSpeechClient();

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
function cleanText(t) {
  if (!t) return "";
  return String(t).replace(/[&<>"]/g, "");
}

// ⭐ HUMAN + TELEPHONY-OPTIMIZED SSML
function buildSSML(script) {
  const question =
    "If we go ahead and reserve a slot for you, would you be available? " +
    "Press 1 if you are available, or press 2 if you are not.";

  return `
    <speak>
      <prosody rate="95%" pitch="-0.3st">
        <break time="250ms"/>
        ${script}
        <break time="450ms"/>
        <emphasis level="moderate">${question}</emphasis>
        <break time="300ms"/>
      </prosody>
    </speak>
  `;
}

// --------------------------------------------------
// EXCEL LOGGER
// --------------------------------------------------
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
    Timestamp: timestamp
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Responses");
  XLSX.writeFile(wb, RESP_FILE);
}

// --------------------------------------------------
// STATE
// --------------------------------------------------
let callScript = "Hello, this is your call assistant.";
let smsTemplate =
  "Your reservation has been received. We will contact you shortly.";

// --------------------------------------------------
// API ENDPOINTS
// --------------------------------------------------
app.post("/api/script", (req, res) => {
  callScript = cleanText(req.body.script || "");
  res.json({ success: true });
});

app.post("/api/sms-template", (req, res) => {
  smsTemplate = req.body.sms || smsTemplate;
  res.json({ success: true });
});

// --------------------------------------------------
// MAKE CALL
// --------------------------------------------------
app.post("/api/makecall", async (req, res) => {
  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const call = await client.calls.create({
      to: req.body.to,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice`
    });

    res.json({ success: true, sid: call.sid });
  } catch (err) {
    console.error("TWILIO ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------
// TWILIO VOICE WEBHOOK
// --------------------------------------------------
app.post("/voice", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  try {
    const ssml = buildSSML(cleanText(callScript));

    const [tts] = await ttsClient.synthesizeSpeech({
      input: { ssml },
      voice: {
        languageCode: "en-US",
        name: "en-US-Neural2-F",
        ssmlGender: "FEMALE"
      },
      audioConfig: {
        audioEncoding: "MULAW",
        sampleRateHertz: 8000,
        speakingRate: 1.0,
        volumeGainDb: 6.0,
        effectsProfileId: ["telephony-class-application"]
      }
    });

    const filename = `voice-${uuidv4()}.wav`;
    const filepath = path.join(TMP_DIR, filename);

    await util.promisify(fs.writeFile)(filepath, tts.audioContent, "binary");

    const gather = twiml.gather({
      numDigits: 1,
      action: `${BASE_URL}/gather`,
      method: "POST",
      timeout: 8
    });

    gather.play(`${BASE_URL}/${filename}`);

    twiml.say("We did not receive any input. Goodbye.");

    res.type("text/xml");
    res.send(twiml.toString());

    setTimeout(() => fs.unlink(filepath, () => {}), 60000);
  } catch (err) {
    console.error("TTS ERROR:", err);
    twiml.say("Sorry, there was an error generating the voice.");
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// --------------------------------------------------
// GATHER RESPONSE
// --------------------------------------------------
app.post("/gather", async (req, res) => {
  const digit = req.body.Digits;
  const from = req.body.From;
  const timestamp = new Date().toISOString();

  const status = digit === "1" ? "Yes" : digit === "2" ? "No" : "Invalid";
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
      body: smsTemplate
    });

    twiml.say("Thank you. You will receive a reservation text shortly.");
  } else if (digit === "2") {
    twiml.say("Thank you. We have noted that you are not available.");
  } else {
    twiml.say("Invalid input received. Goodbye.");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// --------------------------------------------------
// VIEW EXCEL IN BROWSER
// --------------------------------------------------
app.get("/api/view-reservations", (req, res) => {
  if (!fs.existsSync(RESP_FILE))
    return res.send("<h2>No responses yet.</h2>");

  const wb = XLSX.readFile(RESP_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  res.send(XLSX.utils.sheet_to_html(ws));
});

// --------------------------------------------------
// STATIC + HEALTH
// --------------------------------------------------
app.use(express.static(TMP_DIR));
app.get("/", (req, res) => res.json({ status: "SERVER_RUNNING" }));

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
app.listen(process.env.PORT || 3000, () =>
  console.log("SERVER RUNNING WITH MULAW AUDIO")
);
