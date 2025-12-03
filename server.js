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

// =========================
// BASE SETTINGS
// =========================
const BASE_URL = process.env.BASE_URL || "https://ai-call-assistant-znyw.onrender.com";
const TMP_DIR = __dirname;

// =========================
// GOOGLE TTS CLIENT
// =========================
const googleCreds = JSON.parse(process.env.GOOGLE_CREDENTIALS);

let ttsClient;
try {
  ttsClient = new textToSpeech.TextToSpeechClient({
    credentials: googleCreds,
  });
  console.log("Google TTS client initialized");
} catch (err) {
  console.error("Error initializing Google TTS client:", err);
}

// Clean user text
function cleanText(t) {
  if (!t) return "";
  return t.replace(/[&<>"]/g, "");
}

// SSML generator
function makeSSML(text) {
  return `
    <speak>
      <prosody pitch="+6st" rate="96%">
        <emphasis level="moderate">${text}</emphasis>
      </prosody>
    </speak>
  `;
}

// =========================
// UPDATE SCRIPT
// =========================
let callScript = "Hello, this is your call assistant.";

app.post("/api/script", (req, res) => {
  const script = req.body.script;
  if (!script || typeof script !== "string") {
    return res.status(400).json({ success: false, message: "Invalid script" });
  }

  callScript = cleanText(script);
  return res.json({ success: true, message: "Script updated" });
});

// =========================
// MAKE CALL — ALWAYS RETURNS JSON
// =========================
app.post("/api/makecall", async (req, res) => {
  const to = req.body.to;

  if (!to) {
    return res.status(400).json({
      success: false,
      message: "Missing 'to' phone number",
    });
  }

  if (!process.env.TWILIO_ACCOUNT_SID ||
      !process.env.TWILIO_AUTH_TOKEN ||
      !process.env.TWILIO_PHONE_NUMBER) {
    return res.status(500).json({
      success: false,
      message: "Twilio credentials not set",
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
    console.error("Twilio call error:", err);

    return res.status(500).json({
      success: false,
      message: "TWILIO_ERROR",
      error: err.message || String(err),
    });
  }
});

// =========================
// /voice ENDPOINT — TWILIO ONLY
// =========================
app.post("/voice", async (req, res) => {
  const ua = req.headers["user-agent"] || "";
  if (!ua.includes("Twilio")) {
    return res.json({
      success: false,
      error: "VOICE_ENDPOINT_FOR_TWILIO_ONLY",
    });
  }

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const text = cleanText(callScript);
  const ssml = makeSSML(text);

  const ttsRequest = {
    input: { ssml },
    voice: {
      languageCode: "en-US",
      name: "en-US-Neural2-F",
      ssmlGender: "FEMALE",
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 1.02,
      pitch: 7.5,
      volumeGainDb: 2.0,
      effectsProfileId: ["telephone-class-application"],
    }
  };

  try {
    const [audioResponse] = await ttsClient.synthesizeSpeech(ttsRequest);

    const fileName = `voice-${Date.now()}-${uuidv4()}.mp3`;
    const filePath = path.join(TMP_DIR, fileName);

    await util.promisify(fs.writeFile)(filePath, audioResponse.audioContent, "binary");

    twiml.play(`${BASE_URL}/${fileName}`);
    res.type("text/xml");
    res.send(twiml.toString());

    setTimeout(() => {
      fs.unlink(filePath, err => {
        if (err) console.error("Cleanup failed:", err);
      });
    }, 60000);

  } catch (err) {
    console.error("TTS ERROR in /voice:", err);
    twiml.say(
      { voice: "alice", language: "en-US" },
      "Sorry, there was an error generating the voice."
    );
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// =========================
// STATIC FILES FOR AUDIO
// =========================
app.use(express.static(TMP_DIR));

// HEALTH CHECK
app.get("/", (req, res) => {
  res.json({ status: "SERVER_RUNNING" });
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT} — BASE_URL = ${BASE_URL}`)
);
