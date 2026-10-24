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
let lastError = "";

app.get("/", (req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#050b18">
<title>HABIBI-REAPER Dashboard</title>
<style>
*{box-sizing:border-box}
body{
margin:0;min-height:100vh;color:#eaf6ff;
font-family:Arial,sans-serif;
background:radial-gradient(ellipse at top,#12366a,#050b18 65%);
}
header{
text-align:center;padding:25px 12px;
background:#061020;border-bottom:1px solid #174a78;
}
.logo{
font-size:clamp(22px,6vw,32px);font-weight:900;
letter-spacing:2px;color:#36c9ff;
text-shadow:0 0 20px #008cff;
}
.sub{color:#91aac8;font-size:11px;letter-spacing:3px;margin-top:9px}
main{max-width:520px;margin:26px auto;padding:0 15px}
.card{
background:linear-gradient(145deg,#101f38,#081322);
border:1px solid #174a78;border-radius:18px;
padding:21px;margin-bottom:17px;
box-shadow:0 0 25px #007bff18;
}
h2{font-size:17px;margin:0 0 17px}
.muted{font-size:12px;line-height:1.8;color:#91aac8}
.status{display:flex;align-items:center;gap:10px;font-size:14px}
.dot{
width:10px;height:10px;border-radius:50%;
background:#ffb52e;box-shadow:0 0 12px currentColor;
}
label{display:block;font-size:11px;color:#9eb8d8;margin:18px 0 9px}
input{
width:100%;padding:15px;border-radius:10px;
border:1px solid #285781;background:#040b17;
color:white;font-size:16px;outline:none;
}
input:focus{border-color:#27c7ff;box-shadow:0 0 12px #008cff40}
button{
width:100%;padding:15px;margin-top:13px;border:0;
border-radius:10px;font-size:13px;font-weight:bold;
color:#04101d;cursor:pointer;
background:linear-gradient(90deg,#14c7ff,#527cff);
}
button:disabled{opacity:.6}
.secondary{background:#102945;color:#bfeaff;border:1px solid #285781}
.result{
display:none;margin-top:17px;padding:17px;text-align:center;
border:1px dashed #27c7ff;border-radius:12px;background:#061a30;
}
.code{font-size:25px;letter-spacing:5px;color:#48d9ff;font-weight:900;margin:13px 0}
#message{font-size:13px;line-height:1.7;color:#b7d5f5;white-space:pre-wrap;overflow-wrap:anywhere}
footer{text-align:center;padding:15px;color:#617f9f;font-size:11px}
</style>
</head>
<body>
<header>
<div class="logo">⚡ HABIBI-REAPER</div>
<div class="sub">WHATSAPP BOT DASHBOARD</div>
</header>
<main>
<section class="card">
<h2>◈ SYSTEM STATUS</h2>
<div class="status"><span class="dot" id="dot"></span><span id="status">Checking status...</span></div>
<p class="muted">Bot: HABIBI-REAPER<br>Service: Render</p>
<button class="secondary" onclick="refreshStatus()">REFRESH STATUS</button>
</section>

<section class="card">
<h2>◈ CONNECT WHATSAPP</h2>
<p class="muted">Enter your phone number with country code, without the + sign.</p>
<label for="phone">PHONE NUMBER</label>
<input id="phone" type="tel" inputmode="numeric" placeholder="937XXXXXXXX">
<button id="connect" onclick="connectWhatsApp()">GENERATE PAIRING CODE ↗</button>
<div class="result" id="result">
<div class="muted">YOUR PAIRING CODE</div>
<div class="code" id="code"></div>
<button class="secondary" onclick="copyCode()">COPY CODE</button>
</div>
<p id="message" role="status"></p>
</section>

<section class="card">
<h2>◈ HOW TO LINK</h2>
<p class="muted">
1. Generate the pairing code.<br>
2. Open WhatsApp on your phone.<br>
3. Go to Linked devices → Link a device.<br>
4. Choose Link with phone number instead.<br>
5. Enter the code displayed here.
</p>
</section>

<section class="card">
<h2>◈ BOT COMMANDS</h2>
<p class="muted">
.menu — Show menu<br>
.ping — Check response<br>
.alive — Bot status
</p>
</section>
</main>
<footer>POWERED BY HABIBI-REAPER • NEON BLUE EDITION</footer>

<script>
async function refreshStatus(){
const status=document.getElementById("status");
const dot=document.getElementById("dot");
try{
const r=await fetch("/health",{cache:"no-store"});
const d=await r.json();
status.textContent="WhatsApp: "+d.whatsapp;
dot.style.background=d.whatsapp==="connected"?"#22e6a0":
d.whatsapp==="error"?"#ff5263":"#ffb52e";
}catch(e){
status.textContent="Server unavailable";
dot.style.background="#ff5263";
}
}

async function connectWhatsApp(){
const phone=document.getElementById("phone").value.replace(/\\D/g,"");
const btn=document.getElementById("connect");
const msg=document.getElementById("message");
const result=document.getElementById("result");
result.style.display="none";

if(phone.length<8||phone.length>15){
msg.textContent="Enter a valid phone number with country code.";
return;
}

btn.disabled=true;
btn.textContent="REQUESTING CODE...";
msg.textContent="Please wait while the server requests a pairing code.";

try{
const r=await fetch("/pair?phone="+encodeURIComponent(phone));
const t=await r.text();
const m=t.match(/(?:Pairing Code:\\s*)([A-Z0-9-]+)/i);

if(r.ok&&m){
document.getElementById("code").textContent=m[1];
result.style.display="block";
msg.textContent="Code generated. Enter it in WhatsApp.";
}else{
msg.textContent=t;
}
}catch(e){
msg.textContent="Request failed. Check your internet and Render logs.";
}finally{
btn.disabled=false;
btn.textContent="GENERATE PAIRING CODE ↗";
refreshStatus();
}
}

async function copyCode(){
const code=document.getElementById("code").textContent;
try{
await navigator.clipboard.writeText(code);
document.getElementById("message").textContent="Pairing code copied.";
}catch(e){
document.getElementById("message").textContent="Please copy the code manually.";
}
}
refreshStatus();
setInterval(refreshStatus,10000);
</script>
</body>
</html>`);
});

app.get("/health", (req, res) => {
res.json({
status:"running",
bot:BOT_NAME,
whatsapp:botStatus,
lastError:lastError || undefined
});
});

app.get("/pair", async (req, res) => {
const phone=String(req.query.phone||"").replace(/\D/g,"");

if(!phone||phone.length<8||phone.length>15){
return res.status(400).send(
"Enter your number with country code. Example: /pair?phone=937XXXXXXXX"
);
}

if(sock?.user&&botStatus==="connected"){
return res.send(BOT_NAME+" is already connected to WhatsApp.");
}

if(pairingRequested){
return res.send(
pairingCode
?BOT_NAME+" Pairing Code: "+pairingCode
:"Pairing code is being generated. Wait a few seconds and try again."
);
}

pairingRequested=true;
pairingCode="";

try{
const socket=await startBot();

if(!socket)throw new Error("WhatsApp socket is not ready.");

if(socket.user){
pairingRequested=false;
return res.send(BOT_NAME+" is already connected to WhatsApp.");
}

const code=await socket.requestPairingCode(phone);

if(sock!==socket){
throw new Error("WhatsApp connection changed. Try again.");
}

pairingCode=code;

return res.type("text").send(
BOT_NAME+" Pairing Code: "+code+
"\n\nWhatsApp > Linked devices > Link a device > Link with phone number instead."
);
}catch(err){
pairingRequested=false;
pairingCode="";
lastError=err.message||"Unknown pairing error";
console.error("Pairing error:",lastError);
return res.status(500).send(
"Could not generate pairing code. Check Render Logs."
);
}
});

async function startBot(){
if(sock)return sock;
if(startPromise)return startPromise;

startPromise=(async()=>{
try{
fs.mkdirSync(AUTH_DIR,{recursive:true});

const {state,saveCreds}=await useMultiFileAuthState(AUTH_DIR);

const socket=makeWASocket({
auth:state,
logger:pino({level:"silent"}),
browser:[BOT_NAME,"Chrome","1.0.0"],
markOnlineOnConnect:false,
syncFullHistory:false
});

sock=socket;
botStatus="connecting";
lastError="";

socket.ev.on("creds.update",saveCreds);

socket.ev.on("connection.update",({connection,lastDisconnect})=>{
if(sock!==socket)return;

if(connection==="open"){
botStatus="connected";
pairingRequested=false;
pairingCode="";
lastError="";
console.log(BOT_NAME+" connected to WhatsApp!");
}

if(connection==="close"){
const code=lastDisconnect?.error?.output?.statusCode;
botStatus="disconnected";
sock=null;
pairingCode="";
console.log("WhatsApp connection closed:",code||"unknown");

if(code===DisconnectReason.loggedOut){
pairingRequested=false;
lastError="WhatsApp logged out. Link the device again.";
console.log(lastError);
return;
}

if(!reconnectTimer){
reconnectTimer=setTimeout(()=>{
reconnectTimer=null;
startBot().catch(err=>{
lastError=err.message||"Reconnect failed";
console.error("Reconnect error:",lastError);
});
},5000);
}
}
});

socket.ev.on("messages.upsert",async({messages})=>{
for(const msg of messages){
if(!msg?.message||msg.key.fromMe)continue;
if(msg.key.remoteJid==="status@broadcast")continue;

const jid=msg.key.remoteJid;
const body=msg.message;
const text=body.conversation||
body.extendedTextMessage?.text||
body.imageMessage?.caption||
body.videoMessage?.caption||"";
const command=text.trim().toLowerCase();

try{
if(sock!==socket||botStatus!=="connected")continue;

if(command===".ping"){
await socket.sendMessage(jid,{text:"Pong! 🏓"});
}else if(command===".alive"){
await socket.sendMessage(jid,{text:BOT_NAME+" is alive! 🤖🔥"});
}else if(command===".menu"){
await socket.sendMessage(jid,{
text:
"╭━━〔 "+BOT_NAME+" 〕━━╮\n"+
"┃\n"+
"┃ ⚡ .menu - Show menu\n"+
"┃ 🏓 .ping - Test response\n"+
"┃ 🤖 .alive - Bot status\n"+
"┃\n"+
"╰━━━━━━━━━━━━━━╯\n"+
"Powered by HABIBI-REAPER 🔥"
});
}
}catch(err){
console.error("Message handling error:",err.message);
}
}
});

console.log(BOT_NAME+" socket initialized.");
return socket;
}catch(err){
sock=null;
botStatus="error";
lastError=err.message||"Bot startup failed";
console.error("Bot startup error:",lastError);
throw err;
}
})();

try{
return await startPromise;
}finally{
startPromise=null;
}
}

app.listen(PORT,"0.0.0.0",()=>{
console.log(BOT_NAME+" web server running on port "+PORT);
startBot().catch(err=>{
lastError=err.message||"Initial startup failed";
console.error("Initial bot startup failed:",lastError);
});
}); 