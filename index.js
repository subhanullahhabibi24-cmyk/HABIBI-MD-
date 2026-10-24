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
const BOT_NAME = "HABIBI-REAPER";
const AUTH_DIR = path.join(__dirname, "auth_info_baileys");

let sock = null;
let startPromise = null;
let botStatus = "disconnected";
let pairingCode = "";
let pairingRequested = false;
let reconnectTimer = null;
let socketGeneration = 0;

// Home page
app.get("/", (req, res) => {
  res.send(`${BOT_NAME} WhatsApp Bot is running!`);
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "running",
    bot: BOT_NAME,
    whatsapp: botStatus
  });
});

// Pairing Code endpoint:
// /pair?phone=937XXXXXXXX
app.get("/pair", async (req, res) => {
  const phone = String(req.query.phone || "").replace(/\D/g, "");

  if (!phone || phone.length < 8 || phone.length > 15) {
    return res.status(400).send(
      "Enter your phone number with country code. Example: /pair?phone=937XXXXXXXX"
    );
  }

  if (sock?.user && botStatus === "connected") {
    return res.send(`${BOT_NAME} is already connected to WhatsApp.`);
  }

  if (pairingRequested) {
    return res.send(
      pairingCode
        ? `${BOT_NAME} Pairing Code: ${pairingCode}`
        : "Pairing code is being generated. Refresh this page in a few seconds."
    );
  }

  pairingRequested = true;
  pairingCode = "";

  try {
    // Wait for any existing startup operation to finish.
    const socket = await startBot();

    if (!socket) {
      throw new Error("WhatsApp socket could not be initialized.");
    }

    if (socket.user) {
      pairingRequested = false;
      return res.send(`${BOT_NAME} is already connected to WhatsApp.`);
    }

    // Ask Baileys to generate a pairing code.
    const code = await socket.requestPairingCode(phone);

    // Do not return a code from an outdated socket.
    if (sock !== socket) {
      throw new Error("WhatsApp connection changed. Please try again.");
    }

    pairingCode = code;

    return res.type("text").send(
      `${BOT_NAME} Pairing Code: ${code}\n\n` +
      "On your phone:\n" +
      "WhatsApp > Linked devices > Link a device > " +
      "Link with phone number instead."
    );
  } catch (err) {
    pairingRequested = false;
    pairingCode = "";

    console.error("Pairing error:", err.message);

    return res.status(500).send(
      "Could not generate pairing code. Check Render Logs and try again."
    );
  }
});

async function startBot() {
  // Reuse the active socket.
  if (sock) return sock;

  // Prevent simultaneous socket initialization.
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const generation = ++socketGeneration;

    try {
      fs.mkdirSync(AUTH_DIR, { recursive: true });

      const { state, saveCreds } =
        await useMultiFileAuthState(AUTH_DIR);

      const socket = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: [BOT_NAME, "Chrome", "1.0.0"],
        markOnlineOnConnect: false,
        syncFullHistory: false
      });

      sock = socket;
      botStatus = "connecting";

      socket.ev.on("creds.update", saveCreds);

      socket.ev.on(
        "connection.update",
        ({ connection, lastDisconnect }) => {
          // Ignore events from an obsolete socket.
          if (sock !== socket) return;

          if (connection === "open") {
            botStatus = "connected";
            pairingRequested = false;
            pairingCode = "";

            console.log(`${BOT_NAME} connected to WhatsApp!`);
          }

          if (connection === "close") {
            botStatus = "disconnected";
            sock = null;

            console.log(
              "WhatsApp connection closed:",
              lastDisconnect?.error?.output?.statusCode || "unknown"
            );

            const statusCode =
              lastDisconnect?.error?.output?.statusCode;

            if (statusCode === DisconnectReason.loggedOut) {
              pairingRequested = false;
              pairingCode = "";

              console.log(
                "WhatsApp logged out. Check saved authentication before pairing again."
              );
              return;
            }

            // Schedule only one reconnection at a time.
            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null;

                startBot().catch((err) => {
                  console.error("Reconnect error:", err.message);
                });
              }, 5000);
            }
          }
        }
      );

      socket.ev.on("messages.upsert", async ({ messages }) => {
        for (const msg of messages) {
          if (!msg?.message || msg.key.fromMe) continue;
          if (msg.key.remoteJid === "status@broadcast") continue;

          const jid = msg.key.remoteJid;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";

          const command = text.trim().toLowerCase();

          try {
            // Avoid sending replies through an obsolete socket.
            if (sock !== socket || botStatus !== "connected") continue;

            if (command === ".ping") {
              await socket.sendMessage(jid, {
                text: "Pong! 🏓"
              });
            } else if (command === ".alive") {
              await socket.sendMessage(jid, {
                text: `${BOT_NAME} is alive! 🤖🔥`
              });
            } else if (command === ".menu") {
              await socket.sendMessage(jid, {
                text:
                  `╭━━━〔 ${BOT_NAME} 〕━━━╮\n` +
                  "┃\n" +
                  "┃  🤖 BOT STATUS: ONLINE\n" +
                  "┃\n" +
                  "┃  .menu  - Show menu\n" +
                  "┃  .ping  - Check response\n" +
                  "┃  .alive - Bot status\n" +
                  "┃\n" +
                  "╰━━━━━━━━━━━━━━━━━━╯\n" +
                  "🔥 Powered by HABIBI-REAPER"
              });
            }
          } catch (err) {
            console.error("Message handling error:", err.message);
          }
        }
      });

      console.log(`${BOT_NAME} socket initialized.`);
      return socket;
    } catch (err) {
      if (generation === socketGeneration) {
        sock = null;
        botStatus = "error";
      }

      console.error("Bot startup error:", err.message);
      throw err;
    }
  })();

  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${BOT_NAME} web server running on port ${PORT}`);

  startBot().catch((err) => {
    console.error("Initial bot startup failed:", err.message);
  });
}); 