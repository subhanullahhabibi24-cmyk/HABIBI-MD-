const express = require("express");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AUTH_DIR = path.join(__dirname, "auth_info_baileys");

let sock;
let connecting = false;
let botStatus = "disconnected";
let pairingCode = "";
let pairingRequested = false;

app.get("/", (req, res) => {
  res.send("HABIBI-MD WhatsApp Bot is running!");
});

app.get("/health", (req, res) => {
  res.json({ status: "running", bot: "HABIBI-MD", whatsapp: botStatus });
});

// Pairing code: open /pair?phone=YOURNUMBER
app.get("/pair", async (req, res) => {
  const phone = String(req.query.phone || "").replace(/\D/g, "");

  if (!phone || phone.length < 8 || phone.length > 15) {
    return res.status(400).send(
      "Enter your phone number with country code. Example: /pair?phone=937XXXXXXXX"
    );
  }

  if (sock?.user) {
    return res.send("WhatsApp is already connected.");
  }

  if (pairingRequested) {
    return res.send(
      pairingCode
        ? `Your pairing code: ${pairingCode}`
        : "Pairing code is being generated. Refresh this page in a few seconds."
    );
  }

  pairingRequested = true;

  try {
    await startBot();

    if (!sock) {
      pairingRequested = false;
      return res.status(503).send("Bot is starting. Refresh this page shortly.");
    }

    const code = await sock.requestPairingCode(phone);
    pairingCode = code;

    res.send(
      `HABIBI-MD Pairing Code: ${code}\n\n` +
      "On your phone: WhatsApp > Linked devices > Link a device > Link with phone number instead."
    );
  } catch (err) {
    pairingRequested = false;
    console.error("Pairing error:", err.message);
    res.status(500).send("Could not generate pairing code. Check Render Logs.");
  }
});

async function startBot() {
  if (connecting) return;
  connecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      browser: ["HABIBI-MD", "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        botStatus = "connected";
        pairingRequested = false;
        pairingCode = "";
        console.log("HABIBI-MD connected to WhatsApp!");
      }

      if (connection === "close") {
        botStatus = "disconnected";
        connecting = false;
        sock = null;

        const code = lastDisconnect?.error?.output?.statusCode;
        console.log("WhatsApp connection closed:", code);

        if (code !== DisconnectReason.loggedOut) {
          setTimeout(() => startBot(), 5000);
        } else {
          pairingRequested = false;
          console.log("WhatsApp logged out. Request a new pairing code.");
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

    botStatus = "connecting";
  } catch (err) {
    connecting = false;
    sock = null;
    botStatus = "error";
    console.error("Bot startup error:", err);
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Web server running on port ${PORT}`);
  startBot();
});