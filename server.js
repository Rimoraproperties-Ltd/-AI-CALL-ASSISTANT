require("dotenv").config();
const express = require("express");
const cors = require("cors");
const textToSpeech = require("@google-cloud/text-to-speech");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// GOOGLE TTS CLIENT
const client = new textToSpeech.TextToSpeechClient();

// Fix invalid characters in text
function cleanText(t) {
  if (!t) return "";
  return t
    .replace(/&/g, "and")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "");
}

// CALL TTS ROUTE
app.post("/tts", async (req, res) => {
  try {
    let text = cleanText(req.body.text);

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
        speakingRate: 0.96,
        pitch: 2.0
      }
    };

    const [response] = await client.synthesizeSpeech(request);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": response.audioContent.length
    });

    return res.send(response.audioContent);

  } catch (err) {
    console.error("TTS ERROR:", err);
    return res.status(500).send("TTS_FAILED");
  }
});

// BASIC TEST
app.get("/", (req, res) => {
  res.send("Voice Assistant Server Running");
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SERVER RUNNING ON PORT", port));
