// services/botCall.js
import { RTCPeerConnection, nonstandard } from "wrtc";
import fs from "fs";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Initialize AI Bot Call Handler
 */
export async function startBotCall(callId) {
  console.log(`🤖 Starting AI Bot for call ${callId}`);

  const pc = new RTCPeerConnection();

  // 1️⃣ When we get remote audio (user speaking)
  pc.ontrack = async (event) => {
    console.log("🎤 Received inbound audio track");

    const audioFile = "inbound.wav";
    const stream = event.streams[0];
    const writer = fs.createWriteStream(audioFile);

    // Save inbound audio temporarily
    stream.on("data", (chunk) => writer.write(chunk));
    stream.on("end", async () => {
      writer.end();

      // 2️⃣ Convert to text (STT)
      const transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(audioFile),
        model: "gpt-4o-mini-transcribe"
      });

      console.log("📝 User said:", transcription.text);

      // 3️⃣ AI Reply
      const reply = await client.chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: "You are a polite appointment booking assistant." },
          { role: "user", content: transcription.text }
        ]
      });

      const aiText = reply.choices[0].message.content;
      console.log("🤖 AI says:", aiText);

      // 4️⃣ Convert AI text to speech (TTS)
      const speech = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: aiText
      });

      // Save output speech
      const outFile = "outbound.wav";
      fs.writeFileSync(outFile, Buffer.from(await speech.arrayBuffer()));

      // 5️⃣ Inject audio back into call
      const { MediaStreamTrack } = nonstandard;
      const track = new MediaStreamTrack({ kind: "audio", stream: fs.createReadStream(outFile) });
      pc.addTrack(track);

      console.log("📢 Sent AI voice reply into the call.");
    });
  };

  // Create SDP Offer (simulate joining)
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  console.log("📡 Bot Call SDP Offer created:", offer.sdp);

  return pc;
}
