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
  credentials: googleCreds
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
        name: "en-US-Wavenet-C"
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 0.95,
        pitch: 4.0
      }
    };

    const [response] = await client.synthesizeSpeech(request);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": response.audioContent.length,
    });

    return res.send(response.audioContent);

  } catch (err) {
    console.error("TTS ERROR:", err);
    return res.status(500).send("TTS_FAILED");
  }
});

// HEALTH CHECK
app.get("/", (req, res) => {
  res.send("VOICE SERVER LIVE");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SERVER RUNNING ON PORT", PORT));
