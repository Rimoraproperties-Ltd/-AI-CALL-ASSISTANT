require("dotenv").config();
const express = require("express");
const cors = require("cors");
const textToSpeech = require("@google-cloud/text-to-speech");
const twilio = require("twilio");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ======================
// GOOGLE CLOUD TTS SETUP
// ======================
const googleCreds = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const ttsClient = new textToSpeech.TextToSpeechClient({
  credentials: googleCreds,
});

function cleanText(t) {
  if (!t) return "";
  return t.replace(/[&<>"]/g, "");
}

// ======================
// TTS ENDPOINT
// ======================
app.post("/tts", async (req, res) => {
  try {
    const text = cleanText(req.body.text);

    if (!text) {
      return res.status(400).json({ error: "TEXT_NOT_PROVIDED" });
    }

    const request = {
      input: {
        ssml: `<speak>
                <prosody pitch="+6st" rate="95%">
                    <emphasis level="moderate">${text}</emphasis>
                </prosody>
              </speak>`
      },
      voice: {
        languageCode: "en-US",
        name: "en-US-Wavenet-C",
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 0.95,
        pitch: 4.0,
      },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    const audioBase64 = response.audioContent.toString("base64");

    return res.json({
      success: true,
      audio: audioBase64,
    });

  } catch (err) {
    console.error("TTS ERROR:", err);
    return res.status(500).json({ error: "TTS_FAILED", details: err.message });
  }
});

// =============================
// PROTECT /voice FROM DASHBOARD
// =============================
app.post("/voice", (req, res) => {
  const userAgent = req.headers["user-agent"] || "";

  // If request is NOT from Twilio => BLOCK IT
  if (!userAgent.includes("Twilio")) {
    return res.json({
      success: false,
      error: "VOICE_ENDPOINT_FOR_TWILIO_ONLY"
    });
  }

  // If request is from Twilio → return XML
  res.set("Content-Type", "text/xml");
  return res.send(`
    <Response>
      <Say voice="Polly.Joanna">
        Hello, this is your AI call assistant. The campaign has finished.
      </Say>
      <Hangup/>
    </Response>
  `);
});

// ======================
// HEALTH CHECK
// ======================
app.get("/", (req, res) => {
  res.json({ status: "VOICE_SERVER_LIVE" });
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SERVER RUNNING ON PORT", PORT));
