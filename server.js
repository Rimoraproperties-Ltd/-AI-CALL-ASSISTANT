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
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------- CONFIG ----------
const BASE_URL = process.env.BASE_URL || "https://ai-call-assistant-znyw.onrender.com";
const TMP_DIR = __dirname; // uses project root to serve static files
const TTS_TEMP_LIFETIME_MS = 60 * 1000; // delete generated mp3 after 1 minute

// ---------- GOOGLE KEY HANDLING (supports two Render methods) ----------
/*
  Recommended on Render:
  - Upload the JSON as a Secret File named google-key.json -> path: /etc/secrets/google-key.json
  - Set GOOGLE_APPLICATION_CREDENTIALS to that path in Environment Variables

  Alternatively, if you pasted the JSON into an env var named GOOGLE_TTS_JSON,
  this code writes it to a local file at runtime and points GOOGLE_APPLICATION_CREDENTIALS to it.
*/

if (process.env.GOOGLE_TTS_JSON) {
  // write key file from env (safe if you used Render env var for JSON content)
  const keyPath = path.join(__dirname, "call-assistant-key.json");
  try {
    fs.writeFileSync(keyPath, process.env.GOOGLE_TTS_JSON, { encoding: "utf8", mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
    console.log("Wrote Google key from GOOGLE_TTS_JSON to", keyPath);
  } catch (e) {
    console.error("Failed writing GOOGLE_TTS_JSON to file:", e);
  }
}

// If user already set GOOGLE_APPLICATION_CREDENTIALS to a secrets file path (Render Secret Files)
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  if (!fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    console.warn("GOOGLE_APPLICATION_CREDENTIALS set but file not found:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
  } else {
    console.log("Using Google credentials file:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
}

// Initialize Google TTS client
let ttsClient;
try {
  ttsClient = new textToSpeech.TextToSpeechClient();
} catch (err) {
  console.error("Failed to initialize Google TTS client. Make sure credentials are available.", err);
  // continue; errors will be surfaced at request time
}

// ---------- SCRIPT STATE ----------
let callScript = "Hello, this is your call assistant.";

// Keywords to emphasize (customize)
const emphasisKeywords = ["important", "urgent", "please", "note", "remember"];

// ---------- UTIL: sanitize user text ----------
function cleanText(t) {
  if (!t) return "";
  return String(t)
    .replace(/&/g, "and")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "");
}

// ---------- SSML helpers ----------
function emphasizeKeywords(script, keywords = []) {
  let result = script;
  keywords.forEach(word => {
    const regex = new RegExp(`\\b(${word})\\b`, "gi");
    result = result.replace(regex, `<emphasis level="moderate">$1</emphasis>`);
  });
  return result;
}

function makeDynamicSSML(script) {
  const highlightedScript = emphasizeKeywords(script, emphasisKeywords);

  const segments = highlightedScript
    .split(/([.?!,])/g)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const ssmlSegments = segments.map(seg => {
    let breakTime = "200ms";
    let pitch = "0";

    if (/[.]/.test(seg)) breakTime = "500ms";
    if (/[?!]/.test(seg)) { breakTime = "600ms"; pitch = "1.0"; }

    // wrap segment text safely
    return `<s><prosody pitch="${pitch}">${seg}</prosody><break time="${breakTime}"/></s>`;
  });

  // Overall prosody: slightly faster, higher base pitch for warm friendly tone
  return `<speak><prosody rate="1.02" pitch="7.5">${ssmlSegments.join("")}</prosody></speak>`;
}

// ---------- ROUTES ----------

// Update script from dashboard
app.post("/api/script", (req, res) => {
  const text = req.body.script;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ success: false, message: "Script is required and must be text." });
  }
  callScript = text;
  return res.json({ success: true, message: "Script updated", script: callScript });
});

// Make call (used by your dashboard)
app.post("/api/makecall", async (req, res) => {
  const to = req.body.to;
  if (!to) return res.status(400).json({ success: false, message: "Missing 'to' phone number." });

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    return res.status(500).json({ success: false, message: "Twilio credentials not configured." });
  }

  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const call = await client.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/voice`
    });
    return res.json({ success: true, message: "Call started", sid: call.sid });
  } catch (err) {
    console.error("Twilio call error:", err);
    return res.status(500).json({ success: false, message: "Call failed", error: err.message || String(err) });
  }
});

// Twilio will request this webhook to get TwiML for the call
app.post("/voice", async (req, res) => {
  // Ensure Twilio gets XML response
  res.type("text/xml");
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  // Build SSML from current script
  const safeText = cleanText(callScript);
  const ssmlScript = makeDynamicSSML(safeText);

  // Prepare TTS request
  const ttsRequest = {
    input: { ssml: ssmlScript },
    voice: {
      languageCode: "en-US",
      name: "en-US-Neural2-F", // warm, expressive female neural voice
      ssmlGender: "FEMALE"
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 1.02,
      pitch: 7.5,
      volumeGainDb: 2.2,
      effectsProfileId: ["telephone-class-application"]
    }
  };

  try {
    if (!ttsClient) throw new Error("TTS client not initialized (missing credentials?).");

    const [response] = await ttsClient.synthesizeSpeech(ttsRequest);
    const audioFileName = `tts-${Date.now()}-${uuidv4()}.mp3`;
    const audioFilePath = path.join(TMP_DIR, audioFileName);

    // write mp3 to disk so Twilio can fetch it via public BASE_URL
    await util.promisify(fs.writeFile)(audioFilePath, response.audioContent, "binary");

    // Play the file in Twilio call
    twiml.play(`${BASE_URL}/${audioFileName}`);
    res.send(twiml.toString());

    // cleanup after a short delay
    setTimeout(() => {
      fs.unlink(audioFilePath, (err) => { if (err) console.error("Failed deleting temp audio:", err); });
    }, TTS_TEMP_LIFETIME_MS);

  } catch (err) {
    console.error("TTS / voice error:", err);
    // fallback: speak a short apology using Twilio's built-in voice (guaranteed to work)
    const fallbackText = "Sorry, there was an error generating the voice.";
    twiml.say({ voice: "alice", language: "en-US" }, fallbackText);
    res.send(twiml.toString());
  }
});

// Optional: endpoint to preview generated audio (returns mp3)
app.post("/tts", async (req, res) => {
  const text = cleanText(req.body.text || callScript);
  const ssml = makeDynamicSSML(text);
  const ttsRequest = {
    input: { ssml },
    voice: { languageCode: "en-US", name: "en-US-Neural2-F", ssmlGender: "FEMALE" },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 1.02,
      pitch: 7.5,
      volumeGainDb: 2.2,
      effectsProfileId: ["telephone-class-application"]
    }
  };

  try {
    if (!ttsClient) throw new Error("TTS client not initialized (missing credentials?).");
    const [response] = await ttsClient.synthesizeSpeech(ttsRequest);
    res.set({ "Content-Type": "audio/mpeg" });
    return res.send(response.audioContent);
  } catch (err) {
    console.error("TTS preview error:", err);
    return res.status(500).json({ success: false, message: "TTS_FAILED", error: err.message || String(err) });
  }
});

// Health check
app.get("/", (req, res) => res.json({ success: true, message: "AI Call Assistant running" }));

// Serve static so Twilio can fetch mp3s
app.use(express.static(TMP_DIR));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} — BASE_URL=${BASE_URL}`));
