const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage
} = require("@whiskeysockets/baileys");

const fs = require("fs-extra");
const pino = require("pino");
// const qrcodeTerminal = require("qrcode-terminal"); // Ya no se usa en consola
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

// ---------------- Server Setup -----------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use("/images", express.static("images"));

app.get("/api/images", async (req, res) => {
    try {
        await fs.ensureDir("./images");
        const items = await fs.readdir("./images");
        const result = [];
        
        for (const item of items) {
            const itemPath = `./images/${item}`;
            const stat = await fs.stat(itemPath);
            if (stat.isDirectory()) {
                const files = await fs.readdir(itemPath);
                const images = files.filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f));
                if (images.length > 0) {
                    result.push({ folder: item, images, createdAt: stat.birthtime });
                }
            }
        }
        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/delete-auth", async (req, res) => {
    try {
        await fs.remove("./auth");
        log("🗑️ Carpeta 'auth' eliminada. Por favor reinicia el bot para volver a escanear.");
        res.json({ success: true });
        // Opcional: process.exit(0) si usas un gestor de procesos que reinicie automáticamente
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

let isBotRunning = false;

app.post("/api/start-bot", (req, res) => {
    if (isBotRunning) {
        return res.json({ success: false, message: "El bot ya está corriendo" });
    }
    isBotRunning = true;
    startBot();
    res.json({ success: true, message: "Bot iniciado" });
});

io.on("connection", (socket) => {
    console.log("Cliente web conectado");
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor web corriendo en http://localhost:${PORT}`);
});

// ---------------- Helper Log -----------------
function log(msg) {
    console.log(msg);
    io.emit("log", msg);
}

// ---------------- Bot -----------------

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: "silent" })
    });

    // --------- Manejo de conexión ----------
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            log("📲 Escanea el código QR (mira la web)");
            // qrcodeTerminal.generate(qr, { small: true });
            try {
                const url = await QRCode.toDataURL(qr);
                io.emit("qr", url);
            } catch (err) {
                console.error(err);
            }
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;

            log(`❌ Conexión cerrada: ${reason}`);
            io.emit("connection-close", reason);

            if (reason !== DisconnectReason.loggedOut) {
                log("🔁 Reconectando...");
                startBot();
            } else {
                log("🚫 Sesión cerrada. Borra /auth y vuelve a escanear.");
            }
        }

        if (connection === "open") {
            log("✅ Bot conectado a WhatsApp");
            io.emit("connection-open");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // --------- Variables de trabajo (Por Usuario) -----------
    // Usamos un Map para guardar el estado de cada usuario de forma independiente
    // Clave: remoteJid (ID del usuario) -> Valor: { folderName: string, imageQueue: [] }
    const userStates = new Map();

    // --------- Manejo de mensajes -----------
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;

        // Inicializar estado del usuario si no existe
        if (!userStates.has(from)) {
            userStates.set(from, { folderName: null, imageQueue: [] });
        }
        const userState = userStates.get(from);

        // ========== 1. Detectar texto =============
        const text = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text ||
                     msg.message?.viewOnceMessage?.message?.conversation ||
                     null;

        if (text) {
            const newFolder = text.trim();

            if (userState.folderName && userState.imageQueue.length > 0) {
                log(`📝 [${from}] '${userState.folderName}' recibió ${userState.imageQueue.length} imágenes`);
            }

            // Actualizamos el estado SOLO de este usuario
            userState.folderName = newFolder;
            userState.imageQueue = [];

            log(`📁 [${from}] Carpeta configurada: ${newFolder}`);
            return;
        }

        // ========== 2. Detectar imagen ============
        const mediaMessage =
            msg.message.imageMessage ||
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
            msg.message?.viewOnceMessage?.message?.imageMessage;

        if (mediaMessage) {
            if (!userState.folderName) {
                log(`⚠️ [${from}] Imagen recibida sin carpeta definida.`);
                return;
            }

            try {
                const buffer = await downloadMediaMessage(msg, "buffer", {}, {});

                const dir = `./images/${userState.folderName}`;
                fs.ensureDirSync(dir);

                // Contamos cuántos archivos existen en la carpeta para numerar correctamente
                const existingFiles = await fs.readdir(dir);
                const imageCount = existingFiles.filter(f => /^image_\d+\.jpg$/i.test(f)).length;
                const path = `${dir}/image_${imageCount + 1}.jpg`;

                fs.writeFileSync(path, buffer);
                userState.imageQueue.push(path);

                log(`📸 [${from}] Imagen guardada en '${userState.folderName}': ${path}`);
            } catch (e) {
                console.error("❌ Error descargando imagen:", e);
                log(`❌ Error descargando imagen: ${e.message}`);
            }
        }
    });
}

// Ejecutar bot
// startBot(); // Se inicia desde la web
