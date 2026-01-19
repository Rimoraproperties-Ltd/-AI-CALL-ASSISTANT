require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const util = require("util");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const AfricasTalking = require("africastalking");
const textToSpeech = require("@google-cloud/text-to-speech");
const twilio = require("twilio");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------- CONFIG ----------------
const BASE_URL = process.env.BASE_URL;
const TMP_DIR = __dirname;

// ---------------- PROVIDERS ----------------
const AT = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});
const atVoice = AT.VOICE;
const atSMS = AT.SMS;

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const ttsClient = new textToSpeech.TextToSpeechClient();

// ---------------- GOOGLE SHEET ----------------
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

async function logToSheet(number, response) {
  const doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  await sheet.addRow({
    number,
    time: new Date().toISOString(),
    response
  });
}

// ---------------- HELPERS ----------------
function isNigeria(number) {
  return number.startsWith("+234");
}

function cleanText(t) {
  return String(t || "").replace(/[&<>"]/g, "");
}

function buildSSML(script) {
  return `
  <speak>
    <prosody rate="95%" pitch="-0.3st">
      <break time="250ms"/>
      ${script}
      <break time="400ms"/>
      <emphasis level="moderate">
        If we go ahead and reserve a slot for you,
        press 1 if available or press 2 if not.
      </emphasis>
    </prosody>
  </speak>`;
}

// ---------------- STATE ----------------
let CALL_SCRIPT = "Super congratulations. You have been selected.";
let SMS_TEMPLATE = "Your reservation is confirmed. Details will follow.";

// ---------------- API ----------------
app.post("/api/script", (req, res) => {
  CALL_SCRIPT = cleanText(req.body.script);
  res.json({ success: true });
});

app.post("/api/sms-template", (req, res) => {
  SMS_TEMPLATE = req.body.sms;
  res.json({ success: true });
});

// ---------------- MAKE CALL (HYBRID) ----------------
app.post("/api/makecall", async (req, res) => {
  const number = req.body.to;

  try {
    if (isNigeria(number)) {
      await atVoice.call({
        callFrom: process.env.AT_CALLER_ID,
        callTo: [number],
        url: `${BASE_URL}/voice-at`
      });
    } else {
      await twilioClient.calls.create({
        to: number,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${BASE_URL}/voice-twilio`,
        statusCallback: `${BASE_URL}/call-status`,
        statusCallbackEvent: ["completed"],
        statusCallbackMethod: "POST"
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

// ---------------- TWILIO VOICE ----------------
app.post("/voice-twilio", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  try {
    const ssml = buildSSML(CALL_SCRIPT);
    const [tts] = await ttsClient.synthesizeSpeech({
      input: { ssml },
      voice: { languageCode: "en-US", name: "en-US-Neural2-F" },
      audioConfig: {
        audioEncoding: "MULAW",
        sampleRateHertz: 8000,
        volumeGainDb: 6.0,
        effectsProfileId: ["telephony-class-application"]
      }
    });

    const file = `voice-${uuidv4()}.wav`;
    const filePath = path.join(TMP_DIR, file);
    await util.promisify(fs.writeFile)(filePath, tts.audioContent, "binary");

    const gather = twiml.gather({
      numDigits: 1,
      action: `${BASE_URL}/gather`,
      method: "POST",
      timeout: 6
    });

    gather.play(`${BASE_URL}/${file}`);
    twiml.say("Goodbye.");

    res.type("text/xml").send(twiml.toString());
    setTimeout(() => fs.unlink(filePath, () => {}), 60000);
  } catch {
    twiml.say("Sorry, an error occurred.");
    res.type("text/xml").send(twiml.toString());
  }
});

// ---------------- GATHER RESPONSE ----------------
app.post("/gather", async (req, res) => {
  const digit = req.body.Digits;
  const number = req.body.To;

  const response =
    digit === "1" ? "yes" :
    digit === "2" ? "no" :
    "didn't respond";

  await logToSheet(number, response);

  if (digit === "1") {
    if (isNigeria(number)) {
      await atSMS.send({ to: [number], message: SMS_TEMPLATE });
    } else {
      await twilioClient.messages.create({
        to: number,
        from: process.env.TWILIO_PHONE_NUMBER,
        body: SMS_TEMPLATE
      });
    }
  }

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  twiml.say("Thank you.");
  res.type("text/xml").send(twiml.toString());
});

// ---------------- DIDN'T PICK ----------------
app.post("/call-status", async (req, res) => {
  const status = req.body.CallStatus;
  if (["no-answer", "busy", "failed"].includes(status)) {
    await logToSheet(req.body.To, "didn't pick");
  }
  res.sendStatus(200);
});

// ---------------- START ----------------
app.use(express.static(TMP_DIR));
app.listen(process.env.PORT || 3000, () =>
  console.log("Hybrid AI Call Assistant running")
);
