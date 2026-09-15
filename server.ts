import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import { createServer } from "http";
import { google } from "googleapis";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;
  const codeToSessionId = new Map<string, string>();

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/games", async (req, res) => {
    try {
      const drive = google.drive({ version: 'v3', auth: process.env.GOOGLE_DRIVE_API_KEY });
      const folderId = '1qlxBDr_OPO_5kBJSx9hSAIU-pWeICRjK';
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name)',
      });
      
      console.log('Files fetched from Drive:', response.data.files);
      
      const uniqueFiles = new Map();
      response.data.files?.forEach(file => {
          if (file.name) {
              const displayName = file.name
                  .split('(')[0]
                  .replace(/\.[^/.]+$/, "")
                  .trim();
              
              const normalizedName = displayName.toLowerCase();
              if (!uniqueFiles.has(normalizedName)) {
                  uniqueFiles.set(normalizedName, { ...file, name: displayName });
              }
          }
      });
      res.json({ files: Array.from(uniqueFiles.values()), rawFiles: response.data.files });
    } catch (error) {
      console.error('Error listing Drive files:', error);
      res.status(500).json({ error: 'Failed to list games' });
    }
  });

  app.get("/api/games/download/:fileId", async (req, res) => {
    try {
      const drive = google.drive({ version: 'v3', auth: process.env.GOOGLE_DRIVE_API_KEY });
      const response = await drive.files.get(
        { fileId: req.params.fileId, alt: 'media' },
        { responseType: 'stream' }
      );
      response.data.pipe(res);
    } catch (error) {
      console.error('Error downloading Drive file:', error);
      res.status(500).json({ error: 'Failed to download game' });
    }
  });

  // WebSocket signaling
  io.on("connection", (socket) => {
    console.log("A user connected");
    socket.on("register-code", (data) => {
        // data: { code, sessionId }
        codeToSessionId.set(data.code, data.sessionId);
        console.log(`Registered code: ${data.code} -> ${data.sessionId}`);
    });

    socket.on("join-by-code", (data) => {
        // data: { code, playerId }
        console.log("Join by code attempt:", data.code, data.playerId);
        const sessionId = codeToSessionId.get(data.code);
        if (sessionId) {
            console.log("Session found:", sessionId);
            socket.emit("code-verified", { sessionId });
        } else {
            console.log("Session not found for code:", data.code);
            socket.emit("code-error", { message: "Invalid code" });
        }
    });

    socket.on("join-session", (data) => {
        // data: { sessionId, playerId }
        socket.join(data.sessionId);
        socket.to(data.sessionId).emit("player-connected", data.playerId);
        socket.emit("connected", { status: "connected" });
        console.log(`User joined session: ${data.sessionId} as Player ${data.playerId}`);
    });
    
    socket.on("controller-input", (data) => {
      // data: { sessionId, playerId, button, type }
      console.log("Controller input:", data);
      io.to(data.sessionId).emit("game-input", data);
    });
    
    socket.on("controller-exit", (data) => {
      // data: { sessionId, playerId }
      console.log("Controller exit:", data);
      io.to(data.sessionId).emit("game-exit", data);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
