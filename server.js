require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const util = require("util");
const textToSpeech = require("@google-cloud/text-to-speech");
const twilio = require("twilio");
const { v4: uuidv4 } = require("uuid");

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

// ---------------------------------------------------------------
// GOOGLE TTS CLIENT (using GOOGLE_APPLICATION_CREDENTIALS)
// ---------------------------------------------------------------
let ttsClient;
try {
  ttsClient = new textToSpeech.TextToSpeechClient();
  console.log("Google TTS initialized using GOOGLE_APPLICATION_CREDENTIALS");
} catch (err) {
  console.error("Google TTS Initialization ERROR:", err);
}

// ---------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------
function cleanText(t) {
  if (!t) return "";
  return t.replace(/[&<>"]/g, "");
}

function createSafeSSML(text) {
  // Warm, feminine, natural voice with safe SSML pitch
  return `
    <speak>
      <prosody pitch="+4st" rate="97%">
        ${text}
      </prosody>
    </speak>
  `;
}

// ---------------------------------------------------------------
// SCRIPT MANAGEMENT
// ---------------------------------------------------------------
let callScript = "Hello, this is your call assistant.";

app.post("/api/script", (req, res) => {
  const script = req.body.script;
  if (!script) {
    return res
      .status(400)
      .json({ success: false, message: "Script cannot be empty" });
  }

  callScript = cleanText(script);
  return res.json({ success: true, message: "Script updated successfully" });
});

// ---------------------------------------------------------------
// CALL API — ALWAYS RETURNS JSON
// ---------------------------------------------------------------
app.post("/api/makecall", async (req, res) => {
  const to = req.body.to;

  if (!to) {
    return res.status(400).json({
      success: false,
      message: "Missing 'to' phone number",
    });
  }

  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER
  ) {
    return res.status(500).json({
      success: false,
      message: "Twilio credentials not fully configured",
    });
  }

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

    return res.json({
      success: true,
      message: "Call started",
      sid: call.sid,
    });
  } catch (err) {
    console.error("Twilio Error:", err);

    return res.status(500).json({
      success: false,
      message: "TWILIO_ERROR",
      error: err.message || String(err),
    });
  }
});

// ---------------------------------------------------------------
// TWILIO VOICE WEBHOOK (ONLY TWILIO CAN ACCESS)
// ---------------------------------------------------------------
app.post("/voice", async (req, res) => {
  const ua = req.headers["user-agent"] || "";

  // PROTECT from dashboard
  if (!ua.includes("Twilio")) {
    return res.json({
      success: false,
      error: "VOICE_ENDPOINT_FOR_TWILIO_ONLY",
    });
  }

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const safeText = cleanText(callScript);
  const ssml = createSafeSSML(safeText);

  const ttsRequest = {
    input: { ssml },
    voice: {
      languageCode: "en-US",
      name: "en-US-Neural2-F",
      ssmlGender: "FEMALE",
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 1.0,
      // pitch, gain, effects REMOVED (invalid for some voices)
    },
  };

  try {
    const [audioResponse] = await ttsClient.synthesizeSpeech(ttsRequest);

    const fileName = `voice-${Date.now()}-${uuidv4()}.mp3`;
    const filePath = path.join(TMP_DIR, fileName);

    // Write MP3 file
    await util.promisify(fs.writeFile)(
      filePath,
      audioResponse.audioContent,
      "binary"
    );

    // Play it in the call
    twiml.play(`${BASE_URL}/${fileName}`);
    res.type("text/xml");
    res.send(twiml.toString());

    // Auto-cleanup
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) console.error("Temp file cleanup failed:", err);
      });
    }, 60000);
  } catch (err) {
    console.error("TTS ERROR in /voice:", err);

    // Fallback voice
    twiml.say(
      { voice: "alice", language: "en-US" },
      "Sorry, there was an error generating the voice."
    );
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// ---------------------------------------------------------------
// STATIC FILES (serve MP3 to Twilio)
// ---------------------------------------------------------------
app.use(express.static(TMP_DIR));

// HEALTH CHECK
app.get("/", (req, res) => {
  res.json({ status: "SERVER_RUNNING", base_url: BASE_URL });
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SERVER RUNNING on port ${PORT}`);
  console.log(`BASE_URL = ${BASE_URL}`);
});
