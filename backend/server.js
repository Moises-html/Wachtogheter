const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e6
});

const PORT = process.env.PORT || 3000;
const MAX_ROOM_SIZE = 6;

app.get("/health", (_req, res) => res.json({ ok: true, app: "WatchTogether" }));

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    roomId = String(roomId || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);
    name = String(name || "Convidado").trim().slice(0, 24) || "Convidado";
    if (!roomId) return socket.emit("app-error", "Digite um código de sala.");

    const room = io.sockets.adapter.rooms.get(roomId);
    if (room && room.size >= MAX_ROOM_SIZE) {
      return socket.emit("app-error", "Essa sala já atingiu o limite de 6 pessoas.");
    }

    const existing = [...(room || [])];
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name;

    socket.emit("room-joined", {
      roomId,
      selfId: socket.id,
      peers: existing.map(id => ({
        id,
        name: io.sockets.sockets.get(id)?.data.name || "Convidado"
      }))
    });

    socket.to(roomId).emit("user-joined", { id: socket.id, name });
    io.to(roomId).emit("room-count", io.sockets.adapter.rooms.get(roomId)?.size || 1);
  });

  socket.on("signal", ({ to, data }) => {
    if (!to || !data || !socket.data.roomId) return;
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("chat-message", ({ text }) => {
    if (!socket.data.roomId) return;
    const message = String(text || "").trim().slice(0, 500);
    if (!message) return;
    io.to(socket.data.roomId).emit("chat-message", {
      id: socket.id,
      name: socket.data.name || "Convidado",
      text: message,
      time: new Date().toISOString()
    });
  });

  socket.on("video-change", ({ url, title }) => {
    if (!socket.data.roomId) return;
    socket.to(socket.data.roomId).emit("video-change", {
      url: String(url || "").trim().slice(0, 2000),
      title: String(title || "Vídeo compartilhado").trim().slice(0, 100)
    });
  });

  socket.on("video-control", payload => {
    if (socket.data.roomId) socket.to(socket.data.roomId).emit("video-control", payload);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit("user-left", { id: socket.id });
    setTimeout(() => {
      io.to(roomId).emit("room-count", io.sockets.adapter.rooms.get(roomId)?.size || 0);
    }, 50);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WatchTogether backend ativo na porta ${PORT}`);
});
