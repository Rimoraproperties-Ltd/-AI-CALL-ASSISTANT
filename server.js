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
// This uses GOOGLE_APPLICATION_CREDENTIALS automatically
let ttsClient;
try {
  ttsClient = new textToSpeech.TextToSpeechClient();
  console.log("Google TTS Client loaded using GOOGLE_APPLICATION_CREDENTIALS");
} catch (err) {
  console.error("Failed to initialize Google TTS client:", err);
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
      <prosody pitch="+7st" rate="98%">
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
      erro
