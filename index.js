const express = require("express");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).send("HABIBI-MD WhatsApp Bot is running! 🤖");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "running",
    bot: "HABIBI-MD"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Web server running on port ${PORT}`);
});

let starting = false;
let reconnectTimer;

async function startBot() {
  if (starting) return;
  starting = true;

  try {
    const { state, saveCreds } =
      await useMultiFileAuthState("./auth_info_baileys");

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      browser: ["HABIBI-MD", "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        console.log("HABIBI-MD connected to WhatsApp!");
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log("WhatsApp connection closed:", code);

        starting = false;

        if (code !== DisconnectReason.loggedOut) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(startBot, 5000);
        } else {
          console.log("WhatsApp logged out. Re-link the account.");
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const msg of messages) {
        if (!msg?.message || msg.key.fromMe) continue;
        if (msg.key.remoteJid === "status@broadcast") continue;

        const jid = msg.key.remoteJid;
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          "";

        try {
          if (text.trim() === ".ping") {
            await sock.sendMessage(jid, { text: "Pong! 🏓" });
          } else if (text.trim() === ".alive") {
            await sock.sendMessage(jid, {
              text: "HABIBI-MD is alive! 🤖"
            });
          } else if (text.trim() === ".menu") {
            await sock.sendMessage(jid, {
              text:
                "╭──『 HABIBI-MD 』──╮\n" +
                "│ .menu\n│ .ping\n│ .alive\n" +
                "╰────────────────╯"
            });
          }
        } catch (err) {
          console.error("Message handling error:", err.message);
        }
      }
    });
  } catch (err) {
    console.error("Bot startup error:", err);
    starting = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(startBot, 10000);
  }
}

startBot(); 
