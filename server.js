import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { customAlphabet } from "nanoid";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDirectory = __dirname;
const port = Number.parseInt(process.env.PORT || "3000", 10) || 3000;
const ROOM_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{6}$/;
const ROOM_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const REGULATION_SHOTS = 10;
const DISCONNECT_GRACE_MS = 20000;
const createRoomCode = customAlphabet(ROOM_ALPHABET, 6);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 1e6,
});

const rooms = new Map();
const disconnectTimers = new Map();

app.get("/health", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size, uptime: process.uptime() });
});

app.use(express.static(rootDirectory, {
  extensions: ["html"],
  index: "index.html",
}));

function reply(ack, payload) {
  if (typeof ack === "function") ack(payload);
}

function emitError(socket, ack, code, message) {
  const payload = { code, message };
  socket.emit("room:error", payload);
  reply(ack, { ok: false, error: payload });
}

function cleanNickname(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
}

function cleanPlayerToken(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || `guest-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeRoomCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^2-9A-HJ-NP-Z]/g, "")
    .slice(0, 6);
}

function normalizeZone(value) {
  const zone = Number(value);
  if (!Number.isInteger(zone) || zone < 0 || zone > 8) return null;
  return zone;
}

// Goal geometry, in normalised 0-1 space relative to the goal box (never the
// viewport, because the two players are on different devices).
export const GOAL_GRID = 3;

// Adjacent cell centres sit 1/3 apart, so any radius below 0.1667 can only ever
// match a cell with itself. 0.12 therefore reproduces the old exact-equality
// behaviour. This is the difficulty dial: ~0.40 makes the keeper save about
// half of all shots.
export const DIVE_RADIUS = 0.12;

// Centre of a 3x3 goal cell, as { x, y } in 0-1 goal space.
export function cellCenter(zone) {
  const index = Number(zone);
  if (!Number.isInteger(index) || index < 0 || index >= GOAL_GRID * GOAL_GRID) return null;
  const column = index % GOAL_GRID;
  const row = Math.floor(index / GOAL_GRID);
  const step = 1 / GOAL_GRID;
  return { x: (column + 0.5) * step, y: (row + 0.5) * step };
}

// Euclidean distance between two goal-space points.
export function goalDistance(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// True when the keeper's reach covers the striker's shot.
export function isSaved(forvetTarget, kaleciTarget, radius = DIVE_RADIUS) {
  return goalDistance(forvetTarget, kaleciTarget) <= radius;
}

function createMatch() {
  return {
    round: 1,
    shots: { forvet: [], kaleci: [] },
    score: { player1: 0, player2: 0 },
    goldenPenalty: false,
  };
}

function createRoom() {
  let code = createRoomCode();
  while (rooms.has(code)) code = createRoomCode();
  const room = {
    code,
    hostId: null,
    players: [],
    maxPlayers: 2,
    status: "waiting",
    match: createMatch(),
    pendingShots: { forvet: null, kaleci: null },
    pendingNext: false,
    lastResult: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function publicPlayer(player, room) {
  return {
    id: player.id,
    nickname: player.nickname,
    ready: Boolean(player.ready),
    role: player.role,
    connected: player.connected !== false,
    isHost: room.hostId === player.id,
  };
}

function publicRoom(room) {
  if (!room) return null;
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((player) => publicPlayer(player, room)),
    maxPlayers: room.maxPlayers,
    status: room.status,
    match: {
      round: room.match.round,
      score: { ...room.match.score },
      goldenPenalty: room.match.goldenPenalty,
      shots: {
        forvet: room.match.shots.forvet.map((shot) => ({ ...shot })),
        kaleci: room.match.shots.kaleci.map((shot) => ({ ...shot })),
      },
    },
  };
}

function emitRoomState(room) {
  if (!room) return;
  io.to(room.code).emit("room:state", publicRoom(room));
}

function getRoomForSocket(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) || null : null;
}

function getPlayerForSocket(socket, room = getRoomForSocket(socket)) {
  if (!room) return null;
  return room.players.find((player) => player.id === socket.data.playerId) || null;
}

function clearDisconnectTimer(code, playerId) {
  const key = `${code}:${playerId}`;
  const timer = disconnectTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  disconnectTimers.delete(key);
}

function scheduleDisconnectCleanup(room, player) {
  const key = `${room.code}:${player.id}`;
  clearDisconnectTimer(room.code, player.id);
  const timer = setTimeout(() => {
    disconnectTimers.delete(key);
    const currentRoom = rooms.get(room.code);
    if (!currentRoom) return;
    const currentPlayer = currentRoom.players.find((candidate) => candidate.id === player.id);
    if (!currentPlayer || currentPlayer.connected !== false) return;
    removePlayer(currentRoom, currentPlayer, "disconnect-timeout");
  }, DISCONNECT_GRACE_MS);
  disconnectTimers.set(key, timer);
}

function finishAfterPlayerRemoval(room, player) {
  if (room.status !== "in_progress") return;
  room.status = "finished";
  io.to(room.code).emit("opponent:left", {
    playerId: player.id,
    nickname: player.nickname,
    message: `${player.nickname} odayı terk etti.`,
    reason: "opponent_gone",
    canReconnect: false,
    graceMs: 0,
    score: { ...room.match.score },
    round: room.match.round,
    goldenPenalty: room.match.goldenPenalty,
    room: publicRoom(room),
  });
  io.to(room.code).emit("match:finished", {
    reason: "opponent_disconnected",
    message: `${player.nickname} bağlantısı koptu, maç sonlandırıldı.`,
    room: publicRoom(room),
  });
}

function removePlayer(room, player, reason = "left") {
  if (!room || !player) return;
  clearDisconnectTimer(room.code, player.id);
  const index = room.players.findIndex((candidate) => candidate.id === player.id);
  if (index < 0) return;
  room.players.splice(index, 1);
  if (room.hostId === player.id) room.hostId = room.players[0]?.id || null;

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }
  if (room.status === "in_progress") finishAfterPlayerRemoval(room, player);
  io.to(room.code).emit("room:playerLeft", {
    playerId: player.id,
    nickname: player.nickname,
    reason,
    score: { ...(room.match?.score || { player1: 0, player2: 0 }) },
    room: publicRoom(room),
  });
  emitRoomState(room);
}

function removePlayerFromRoom(socket, reason = "left", explicit = true) {
  const room = getRoomForSocket(socket);
  if (!room) return null;
  const player = getPlayerForSocket(socket, room);
  if (!player) {
    socket.data.roomCode = null;
    socket.data.playerId = null;
    return room;
  }
  if (player.socketId && player.socketId !== socket.id) return room;

  socket.leave(room.code);
  socket.data.roomCode = null;
  socket.data.playerId = null;
  if (explicit) {
    removePlayer(room, player, reason);
  } else {
    player.connected = false;
    player.socketId = null;
    io.to(room.code).emit("opponent:disconnected", {
      playerId: player.id,
      message: "Rakip bağlantısı kesildi, yeniden bağlanılıyor…",
      room: publicRoom(room),
    });
    // A full screen state so the remaining player is never left guessing
    // whether the game is still alive.
    io.to(room.code).emit("opponent:left", {
      playerId: player.id,
      nickname: player.nickname,
      message: `${player.nickname} bağlantısı kesildi.`,
      reason,
      canReconnect: true,
      graceMs: DISCONNECT_GRACE_MS,
      score: { ...(room.match?.score || { player1: 0, player2: 0 }) },
      round: room.match?.round,
      goldenPenalty: room.match?.goldenPenalty,
      room: publicRoom(room),
    });
    scheduleDisconnectCleanup(room, player);
  }
  return room;
}

function attachSocketToRoom(socket, room, player) {
  clearDisconnectTimer(room.code, player.id);
  player.connected = true;
  player.socketId = socket.id;
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
}

function addPlayerToRoom(socket, room, nickname, playerToken) {
  const id = cleanPlayerToken(playerToken);
  const existing = room.players.find((player) => player.id === id);
  if (existing) {
    existing.nickname = cleanNickname(nickname) || existing.nickname;
    attachSocketToRoom(socket, room, existing);
    return existing;
  }
  const player = {
    id,
    socketId: socket.id,
    nickname: cleanNickname(nickname) || "OYUNCU",
    ready: false,
    role: null,
    connected: true,
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  attachSocketToRoom(socket, room, player);
  return player;
}

function rolesForRound(room, round = room.match.round) {
  const [first, second] = room.players;
  if (!first || !second) return null;
  return round % 2 === 1
    ? { forvetId: first.id, kaleciId: second.id }
    : { forvetId: second.id, kaleciId: first.id };
}

function assignRoles(room) {
  const roles = rolesForRound(room);
  if (!roles) return null;
  room.players.forEach((player) => {
    player.role = player.id === roles.forvetId ? "forvet" : "kaleci";
  });
  return roles;
}

function allPlayersReady(room) {
  return room.players.length === room.maxPlayers && room.players.every((player) => player.ready);
}

function getScoreKey(room, playerId) {
  return playerId === room.players[0]?.id ? "player1" : "player2";
}

function emitMatchFinished(room, payload) {
  room.status = "finished";
  room.pendingNext = false;
  io.to(room.code).emit("match:finished", {
    ...payload,
    room: publicRoom(room),
  });
}

function startMatch(room) {
  if (room.status !== "waiting" || room.players.length !== room.maxPlayers || !allPlayersReady(room)) return null;
  room.status = "in_progress";
  room.match = createMatch();
  room.pendingShots = { forvet: null, kaleci: null };
  room.pendingNext = false;
  const roles = assignRoles(room);
  const response = {
    ok: true,
    room: publicRoom(room),
    players: room.players.map((candidate) => publicPlayer(candidate, room)),
    forvetId: roles?.forvetId,
    kaleciId: roles?.kaleciId,
    round: room.match.round,
    score: { ...room.match.score },
    goldenPenalty: false,
  };
  io.to(room.code).emit("match:started", response);
  emitRoomState(room);
  return response;
}

function resolveRound(room) {
  const forvetZone = room.pendingShots.forvet;
  const kaleciZone = room.pendingShots.kaleci;
  if (forvetZone === null || kaleciZone === null) return null;

  const roles = rolesForRound(room);
  const forvet = room.players.find((player) => player.id === roles?.forvetId);
  const kaleci = room.players.find((player) => player.id === roles?.kaleciId);
  if (!forvet || !kaleci) return null;

  const forvetTarget = cellCenter(forvetZone);
  const kaleciTarget = cellCenter(kaleciZone);
  const result = isSaved(forvetTarget, kaleciTarget) ? "KURTARDI" : "GOL";
  if (result === "GOL") room.match.score[getScoreKey(room, forvet.id)] += 1;
  room.match.shots.forvet.push({ round: room.match.round, zone: forvetZone, result });
  room.match.shots.kaleci.push({ round: room.match.round, zone: kaleciZone, result });
  room.pendingShots = { forvet: null, kaleci: null };
  room.pendingNext = true;
  room.lastResult = {
    round: room.match.round,
    result,
    forvetZone,
    kaleciZone,
    forvetId: forvet.id,
    kaleciId: kaleci.id,
    scores: { ...room.match.score },
  };

  let matchOver = false;
  let winnerId = null;
  let goldenPenalty = room.match.goldenPenalty;
  if (room.match.goldenPenalty) {
    matchOver = true;
    winnerId = result === "GOL" ? forvet.id : kaleci.id;
  } else if (room.match.round >= REGULATION_SHOTS) {
    if (room.match.score.player1 === room.match.score.player2) {
      room.match.goldenPenalty = true;
      goldenPenalty = true;
      room.match.round = REGULATION_SHOTS + 1;
    } else {
      matchOver = true;
      winnerId = room.match.score.player1 > room.match.score.player2
        ? room.players[0]?.id
        : room.players[1]?.id;
    }
  } else {
    room.match.round += 1;
  }

  const nextRound = matchOver ? null : room.match.round;
  const resultPayload = {
    ...room.lastResult,
    nextRound,
    goldenPenalty,
    matchOver,
    winnerId,
    room: publicRoom(room),
  };
  io.to(room.code).emit("round:result", resultPayload);

  if (matchOver) {
    emitMatchFinished(room, {
      reason: room.match.goldenPenalty ? "golden_penalty" : "score_limit",
      winnerId,
      result,
      ...room.lastResult,
    });
  }
  return resultPayload;
}

function handleShot(socket, kind, payload, ack) {
  const room = getRoomForSocket(socket);
  if (!room) {
    emitError(socket, ack, "NOT_IN_ROOM", "Önce bir odaya girmelisin.");
    return;
  }
  if (room.status !== "in_progress" || room.pendingNext) {
    reply(ack, { ok: false, error: { code: "WAIT_NEXT_ROUND", message: "Yeni tur için diğer oyuncuyu bekle." } });
    return;
  }
  const player = getPlayerForSocket(socket, room);
  const expectedRole = kind === "shot:submit" ? "forvet" : "kaleci";
  if (!player || player.role !== expectedRole) {
    emitError(socket, ack, "ROLE_NOT_ALLOWED", "Bu turda bu işlemi yapma sırası sende değil.");
    return;
  }
  const zone = normalizeZone(payload?.zone);
  if (zone === null) {
    emitError(socket, ack, "INVALID_ZONE", "Geçerli bir hedef bölge seç.");
    return;
  }
  if (room.pendingShots[expectedRole] !== null) {
    reply(ack, { ok: true, ignored: true, role: expectedRole });
    return;
  }

  room.pendingShots[expectedRole] = zone;
  socket.emit("shot:accepted", { role: expectedRole, round: room.match.round });
  io.to(room.code).emit("shot:waiting", {
    role: expectedRole,
    round: room.match.round,
    waitingFor: expectedRole === "forvet" ? "kaleci" : "forvet",
    room: publicRoom(room),
  });
  reply(ack, { ok: true, role: expectedRole, round: room.match.round });
  resolveRound(room);
}

io.on("connection", (socket) => {
  socket.data.roomCode = null;
  socket.data.playerId = null;

  socket.on("room:create", (payload = {}, ack) => {
    const nickname = cleanNickname(payload.nickname);
    if (!nickname) {
      emitError(socket, ack, "INVALID_NICKNAME", "Geçerli bir oyuncu adı gir.");
      return;
    }
    removePlayerFromRoom(socket, "switch-room", true);
    const room = createRoom();
    const player = addPlayerToRoom(socket, room, nickname, payload.playerToken);
    const response = { ok: true, code: room.code, room: publicRoom(room), player: publicPlayer(player, room) };
    socket.emit("room:created", response);
    reply(ack, response);
  });

  socket.on("room:join", (payload = {}, ack) => {
    const code = normalizeRoomCode(payload.code);
    const nickname = cleanNickname(payload.nickname);
    if (!ROOM_CODE_PATTERN.test(code)) {
      emitError(socket, ack, "INVALID_CODE", "Oda kodu 6 karakter olmalı.");
      return;
    }
    if (!nickname) {
      emitError(socket, ack, "INVALID_NICKNAME", "Geçerli bir oyuncu adı gir.");
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      emitError(socket, ack, "ROOM_NOT_FOUND", "Bu kodla eşleşen bir oda bulunamadı.");
      return;
    }
    if (room.status !== "waiting" && !room.players.some((player) => player.id === cleanPlayerToken(payload.playerToken))) {
      emitError(socket, ack, "ROOM_NOT_WAITING", "Bu oda artık yeni oyuncu kabul etmiyor.");
      return;
    }
    const token = cleanPlayerToken(payload.playerToken);
    const alreadyHere = room.players.some((player) => player.id === token);
    if (!alreadyHere && room.players.length >= room.maxPlayers) {
      emitError(socket, ack, "ROOM_FULL", "Oda dolu.");
      return;
    }
    removePlayerFromRoom(socket, "switch-room", true);
    const player = addPlayerToRoom(socket, room, nickname, token);
    const response = { ok: true, code: room.code, room: publicRoom(room), player: publicPlayer(player, room) };
    socket.emit("room:joined", response);
    io.to(room.code).emit("room:playerJoined", { player: publicPlayer(player, room), room: publicRoom(room) });
    reply(ack, response);
    emitRoomState(room);
  });

  socket.on("room:rejoin", (payload = {}, ack) => {
    const code = normalizeRoomCode(payload.code);
    const room = rooms.get(code);
    const playerId = cleanPlayerToken(payload.playerToken);
    if (!room) {
      emitError(socket, ack, "ROOM_NOT_FOUND", "Oda artık bulunamadı.");
      return;
    }
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      emitError(socket, ack, "PLAYER_NOT_FOUND", "Odadaki oyuncu kaydı bulunamadı.");
      return;
    }
    if (payload.nickname) player.nickname = cleanNickname(payload.nickname) || player.nickname;
    attachSocketToRoom(socket, room, player);
    const resumedRoles = room.status === "in_progress" ? assignRoles(room) : null;
    const response = {
      ok: true,
      code: room.code,
      room: publicRoom(room),
      player: publicPlayer(player, room),
      started: room.status === "in_progress",
      round: room.match?.round,
      forvetId: resumedRoles?.forvetId,
      kaleciId: resumedRoles?.kaleciId,
      goldenPenalty: room.match?.goldenPenalty,
      score: room.match?.score ? { ...room.match.score } : undefined,
    };
    socket.emit("room:rejoined", response);
    io.to(room.code).emit("room:playerReconnected", { player: publicPlayer(player, room), room: publicRoom(room) });
    reply(ack, response);
    emitRoomState(room);
  });

  socket.on("room:leave", (_payload, ack) => {
    removePlayerFromRoom(socket, "left", true);
    reply(ack, { ok: true });
  });

  socket.on("lobby:ready", (payload = {}, ack) => {
    const room = getRoomForSocket(socket);
    const player = getPlayerForSocket(socket, room);
    if (!room || !player || room.status !== "waiting") {
      reply(ack, { ok: false, error: { code: "NOT_READY_STATE", message: "Oda hazır değil." } });
      return;
    }
    player.ready = Boolean(payload.ready);
    const response = { ok: true, playerId: player.id, ready: player.ready, room: publicRoom(room) };
    io.to(room.code).emit("lobby:playerReady", response);
    reply(ack, response);
    emitRoomState(room);
    if (allPlayersReady(room)) startMatch(room);
  });

  socket.on("match:start", (_payload, ack) => {
    const room = getRoomForSocket(socket);
    const player = getPlayerForSocket(socket, room);
    if (!room || !player) {
      emitError(socket, ack, "NOT_IN_ROOM", "Önce bir odaya girmelisin.");
      return;
    }
    if (room.hostId !== player.id) {
      emitError(socket, ack, "HOST_ONLY", "Maçı sadece oda sahibi başlatabilir.");
      return;
    }
    const response = startMatch(room);
    if (!response) {
      const code = room.status !== "waiting" ? "ALREADY_STARTED" : room.players.length !== room.maxPlayers ? "ROOM_NOT_FULL" : "PLAYERS_NOT_READY";
      const message = code === "ALREADY_STARTED"
        ? "Maç zaten başladı."
        : code === "ROOM_NOT_FULL"
          ? "Maç için odaya iki oyuncu katılmalı."
          : "İki oyuncu da hazır olmalı.";
      emitError(socket, ack, code, message);
      return;
    }
    reply(ack, response);
  });

  // Put a finished room back into the lobby so the same two players can ready
  // up again and play a rematch.
  socket.on("match:reset", (_payload, ack) => {
    const room = getRoomForSocket(socket);
    const player = getPlayerForSocket(socket, room);
    if (!room || !player) {
      emitError(socket, ack, "NOT_IN_ROOM", "Önce bir odaya girmelisin.");
      return;
    }
    if (room.status !== "finished") {
      reply(ack, { ok: true, room: publicRoom(room) });
      return;
    }
    room.status = "waiting";
    room.match = createMatch();
    room.pendingShots = { forvet: null, kaleci: null };
    room.pendingNext = false;
    room.lastResult = null;
    room.players.forEach((candidate) => {
      candidate.ready = false;
      candidate.role = null;
    });
    const response = { ok: true, room: publicRoom(room) };
    io.to(room.code).emit("room:reset", response);
    reply(ack, response);
  });

  socket.on("shot:submit", (payload = {}, ack) => handleShot(socket, "shot:submit", payload, ack));
  socket.on("save:submit", (payload = {}, ack) => handleShot(socket, "save:submit", payload, ack));

  socket.on("match:next", (_payload, ack) => {
    const room = getRoomForSocket(socket);
    if (!room || room.status !== "in_progress") {
      emitError(socket, ack, "NOT_IN_ROOM", "Maç artık devam etmiyor.");
      return;
    }
    const buildResponse = (replayed) => {
      const roles = assignRoles(room);
      return {
        ok: true,
        round: room.match.round,
        forvetId: roles?.forvetId,
        kaleciId: roles?.kaleciId,
        score: { ...room.match.score },
        goldenPenalty: room.match.goldenPenalty,
        room: publicRoom(room),
        replayed,
      };
    };

    // Both players press the result button. The first one advances the round;
    // the second must receive the already-advanced round instead of an error,
    // otherwise that client is left stuck and can never select again.
    if (!room.pendingNext) {
      const response = buildResponse(true);
      socket.emit("round:ready", response);
      reply(ack, response);
      return;
    }

    room.pendingNext = false;
    const response = buildResponse(false);
    io.to(room.code).emit("round:ready", response);
    reply(ack, response);
  });

  socket.on("disconnect", () => {
    removePlayerFromRoom(socket, "disconnect", false);
  });
});

// Only bind a port when this file is the process entrypoint. Importing it
// (for the pure goal geometry helpers) must not start a server.
const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on port ${port}`);
  });

  process.on("SIGTERM", () => {
    httpServer.close(() => process.exit(0));
  });
}
