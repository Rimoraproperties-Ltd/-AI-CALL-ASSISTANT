require("dotenv").config();
const express = require("express");
const cors = require("cors");
const textToSpeech = require("@google-cloud/text-to-speech");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Load Google creds from environment variable
const googleCreds = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const client = new textToSpeech.TextToSpeechClient({
  credentials: googleCreds,
});

// Clean text
function cleanText(t) {
  if (!t) return "";
  return t.replace(/[&<>"]/g, "");
}

// TTS Endpoint
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
              </speak>`,
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

    const [response] = await client.synthesizeSpeech(request);

    // Send audio as base64 inside JSON
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

// HEALTH CHECK
app.get("/", (req, res) => {
  res.json({ status: "VOICE_SERVER_LIVE" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SERVER RUNNING ON PORT", PORT));
