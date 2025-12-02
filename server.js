const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const twilio = require("twilio");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const util = require("util");
const textToSpeech = require("@google-cloud/text-to-speech");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ------------------ SAFE GOOGLE TTS SETUP ------------------
const keyPath = path.join(__dirname, "call-assistant-key.json");
fs.writeFileSync(keyPath, process.env.GOOGLE_TTS_JSON);
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;

const ttsClient = new textToSpeech.TextToSpeechClient();

// ------------------ SCRIPT ------------------
let callScript = "Hello, this is your call assistant.";

// Keywords to automatically emphasize (customize as needed)
const emphasisKeywords = ["important", "urgent", "please"];

// ------------------ EXPRESSIVE SSML FUNCTIONS ------------------
function emphasizeKeywords(script, keywords = []) {
  let result = script;
  keywords.forEach(word => {
    const regex = new RegExp(`\\b(${word})\\b`, "gi");
    result = result.replace(regex, `<emphasis level="moderate">$1</emphasis>`);
  });
  return result;
}

function makeExpressiveSSML(script) {
  // Apply keyword emphasis
  const highlightedScript = emphasizeKeywords(script, emphasisKeywords);

  // Add 400ms pause after each sentence
  const sentences = highlightedScript.split(/([.?!])/g);
  const ssmlSentences = sentences
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => `<s>${s}<break time="400ms"/></s>`)
    .join("");

  // Wrap with prosody for natural rate and pitch
  return `<speak><prosody rate="0.9" pitch="0">${ssmlSentences}</prosody></speak>`;
}

// ------------------ DASHBOARD SCRIPT UPDATE ------------------
app.post("/api/script", (req, res) => {
  if (!req.body.script) {
    return res.status(400).json({ success: false, message: "Script is required" });
  }
  callScript = req.body.script;
  res.json({ success: true, message: "Script updated", script: callScript });
});

// ------------------ TWILIO VOICE ------------------
app.post("/voice", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  try {
    const ssmlScript = makeExpressiveSSML(callScript);

    const ttsRequest = {
      input: { ssml: ssmlScript },
      voice: { languageCode: "en-US", name: "en-US-Wavenet-F", ssmlGender: "FEMALE" },
      audioConfig: { audioEncoding: "MP3", speakingRate: 0.9, pitch: 0 }
    };

    const [response] = await ttsClient.synthesizeSpeech(ttsRequest);
    const audioFileName = `output-${Date.now()}.mp3`;
    const audioFilePath = path.join(__dirname, audioFileName);
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(audioFilePath, response.audioContent, "binary");

    twiml.play(`${process.env.BASE_URL}/${audioFileName}`);
    res.type("text/xml");
    res.send(twiml.toString());

    // Delete temp audio after 1 minute
    setTimeout(() => {
      fs.unlink(audioFilePath, err => {
        if (err) console.error("Error deleting temp audio:", err);
      });
    }, 60 * 1000);

  } catch (err) {
    console.error("TTS Error:", err);
    twiml.say({ voice: "alice", language: "en-US" }, "Sorry, there was an error generating the voice.");
    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// ------------------ MAKE CALL ------------------
app.post("/api/makecall", async (req, res) => {
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const call = await client.calls.create({
      to: req.body.to,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: process.env.BASE_URL + "/voice"
    });
    res.json({ success: true, message: "Call started", sid: call.sid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Call failed", error: err.message });
  }
});

// ------------------ SERVE STATIC FILES ------------------
app.use(express.static(__dirname));

// ------------------ SERVER ------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
