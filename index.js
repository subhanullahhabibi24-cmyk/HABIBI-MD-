const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");

async function startBot() {
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
      console.log("HABIBI-MD connected!");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("Connection closed:", code);

      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot(), 5000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (text === ".ping") {
      await sock.sendMessage(jid, { text: "Pong! 🏓" });
    } else if (text === ".alive") {
      await sock.sendMessage(jid, {
        text: "HABIBI-MD is alive! 🤖"
      });
    } else if (text === ".menu") {
      await sock.sendMessage(jid, {
        text:
          "╭──『 HABIBI-MD 』──╮\n" +
          "│ .menu\n│ .ping\n│ .alive\n" +
          "╰────────────────╯"
      });
    }
  });
}

startBot().catch(console.error);
