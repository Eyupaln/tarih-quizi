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
// How long a player who has actually gone is given to come back before the
// match is called. This is now the only timer in the round lifecycle.
//
// A round itself has no time limit. It stays open until both players have
// marked and sent their move. The consequence is deliberate and worth stating
// plainly: a player who stays connected but walks away from an open round will
// hold that round open indefinitely, and the other player waits on them. There
// is no competitive stake in this game, so waiting was judged better than
// playing a move somebody never chose, but it is a real trade-off rather than a
// solved problem. If somebody ever complains that a round was frozen, this
// comment is the answer.
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
// There is no per-room round timer map any more. Rounds used to carry a
// deadline and an acknowledgement cap; both are gone, and a round is now closed
// by exactly one event, the second shot landing. The only per-room timer left
// is disconnectTimers, which is about a player leaving rather than a round
// running out.

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

// Number(null), Number(""), Number([]) and Number(true) are all finite and all
// pass Number.isInteger, so a bare coercion turns absent or malformed input
// into a valid looking value, which is how a missing zone used to be silently
// accepted as cell 0. Only real numbers and numeric strings are accepted here.
function toFiniteNumber(value) {
  const kind = typeof value;
  if (kind !== "number" && kind !== "string") return null;
  if (kind === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeZone(value) {
  const zone = toFiniteNumber(value);
  if (zone === null || !Number.isInteger(zone) || zone < 0 || zone > 8) return null;
  return zone;
}

// Goal geometry, in normalised 0-1 space relative to the goal box (never the
// viewport, because the two players are on different devices).
export const GOAL_GRID = 3;

// Difficulty dial. A shot is saved when the Euclidean distance between the
// striker's point and the keeper's point is at most this radius, both in
// normalised 0-1 goal space. Measured on 2M random pairs, shot and keeper both
// uniform on the unit square, seeded so the figures reproduce, and cross
// checked against a numerical integral of the disk-square overlap which agrees
// to within 0.05pp:
//
//   r      overall   centre third   edge midpoint   corner
//   0.52     51.1%       75.5%         55.4%      40.7%   <- original
//   0.47     44.1%       65.2%         47.9%      35.1%
//   0.44     40.0%       58.5%         43.3%      31.9%
//   0.40     34.4%       49.4%         37.2%      27.9%
//   0.38     31.7%       44.9%         34.3%      25.9%   <- now
//
// pi*r^2 is not the answer here and never was: it only holds while the disk
// fits inside the square. At r = 0.52 it claims 85% and the real figure is
// 51%, because the part of the disk hanging over an edge can never be reached
// by a target. The radius that actually yields an even 50% is 0.512, not the
// 0.5207 an earlier version of this comment claimed.
//
// Aim position matters more than the overall figure suggests. Measured for a
// shot aimed at exactly one point, keeper uniform, 4000x4000 grid:
//
//   point              r=0.52   r=0.47   r=0.44   r=0.40   r=0.38
//   dead centre        83.4%    69.4%    60.8%    50.3%    45.4%
//   edge midpoint      42.1%    34.7%    30.4%    25.1%    22.7%
//   corner             21.2%    17.3%    15.2%    12.6%    11.3%
//
// Note the two tables answer different questions and neither is a correction
// of the other: the first averages over every shot the striker could pick, the
// second fixes the shot at one spot. An earlier version of this comment quoted
// the second kind of number without saying so.
//
// The radius is one scalar, so it cannot be tuned per corner. What a smaller
// radius does for the corners is lower the floor, and at 0.38 a corner is worth
// about a ninth of saves while dead centre is still under half, which is what
// makes aiming feel like a real decision rather than a formality. The step
// below is measured too, in case playtesting keeps going in the same
// direction:
//
//   r      overall   centre third   corner    dead centre   corner point
//   0.35     27.8%       38.3%      23.1%       38.5%         9.6%
//   0.30     21.4%       28.1%      18.4%       28.3%         7.1%
//
// The radius has come down 0.52 -> 0.47 -> 0.44 -> 0.40 -> 0.38 across four
// rounds of playtesting, every one of them for the same reason: the keeper read
// as saving from too wide an area, dead centre above all, and the corners were
// still being reached too often. Nothing else in the game reads this constant,
// so each of those rounds was a one-line change.
//
// The geometry is symmetric, so neither role has an advantage. Checked by
// comparing each cell against its reflection: the largest gap is 0.6pp over
// 400k pairs, which is sampling noise rather than a real lean.
export const DIVE_RADIUS = 0.38;

// Centre of a 3x3 goal cell, as { x, y } in 0-1 goal space.
export function cellCenter(zone) {
  const index = toFiniteNumber(zone);
  if (index === null || !Number.isInteger(index) || index < 0 || index >= GOAL_GRID * GOAL_GRID) return null;
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

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// Nearest 3x3 cell for a continuous goal point, so the discrete value the UI
// and animation still rely on can be recovered from a continuous target.
export function nearestCell(target) {
  if (!target) return null;
  const toIndex = (value) => Math.min(
    GOAL_GRID - 1,
    Math.max(0, Math.round(value * GOAL_GRID - 0.5)),
  );
  return toIndex(target.y) * GOAL_GRID + toIndex(target.x);
}

// Single internal target format: { x, y, zone } in normalised goal space.
//
// The { zone } branch below is LEGACY and no current client reaches it. The
// continuous { x, y } payload has been the only thing js/game.js has sent
// since 9cab770 ("Move the shot contract to continuous goal coordinates"),
// which shipped the protocol change, and 44fbee1 ("Replace the nine cell
// buttons with continuous aiming") removed the nine buttons that produced a
// zone in the first place. So nothing in this repository exercises it any more.
//
// It is kept only so a browser still holding a pre-9cab770 game.js can finish
// its match instead of failing every shot with INVALID_TARGET. There is no
// cache-control header on the static assets, so a stale client can outlive a
// deploy by a few days. Remove normalizeZone, cellCenter and this branch once
// that window has passed; they are five lines, and until then they are the
// difference between a laggy client and a broken one.
export function normalizeTarget(payload) {
  if (!payload || typeof payload !== "object") return null;

  if (payload.x !== undefined || payload.y !== undefined) {
    const x = toFiniteNumber(payload.x);
    const y = toFiniteNumber(payload.y);
    if (x === null || y === null) return null;
    const target = { x: clamp01(x), y: clamp01(y) };
    return { x: target.x, y: target.y, zone: nearestCell(target) };
  }

  const zone = normalizeZone(payload.zone);
  if (zone === null) return null;
  const center = cellCenter(zone);
  if (!center) return null;
  return { x: center.x, y: center.y, zone };
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

// Sudden death is decided in pairs. Rounds 11 and 12 are the first pair, 13 and
// 14 the next, and the roles swap inside every round, so each player takes one
// kick per pair. A pair only ends the match when exactly one of its two kicks
// scored, and the scorer wins. Both scoring, or both being saved, carries on to
// the next pair. This mirrors the client's suddenPairComplete rule, which only
// ever looks at even rounds.
function resolveGoldenPair(room) {
  const pair = room.match.shots.forvet.slice(-2);
  if (pair.length < 2) return null;
  const goals = pair.filter((shot) => shot.result === "GOL");
  if (goals.length !== 1) return null;
  return rolesForRound(room, goals[0].round)?.forvetId ?? null;
}

// announceRound used to live here and reset the round's deadline and its
// acknowledgement set. Both are gone, so a round now needs no per-round state
// reset at all: it opens on match:started or the next round:ready, and the only
// thing that closes it is resolveRound.

// One shape for every round announcement, so the acknowledgement path and the
// advance path cannot drift apart.
function roundReadyPayload(room, replayed) {
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
}

// Closes the round. The only two callers are the two shot submissions, and the
// guard below is what makes the round wait for the second one: a round stays
// open until both targets are banked, with no timer to hurry anyone.
function resolveRound(room) {
  const forvetTarget = room.pendingShots.forvet;
  const kaleciTarget = room.pendingShots.kaleci;
  if (forvetTarget === null || kaleciTarget === null) return null;

  const roles = rolesForRound(room);
  const forvet = room.players.find((player) => player.id === roles?.forvetId);
  const kaleci = room.players.find((player) => player.id === roles?.kaleciId);
  if (!forvet || !kaleci) return null;

  const forvetZone = forvetTarget.zone;
  const kaleciZone = kaleciTarget.zone;
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
    // Only an even round closes a pair, so an odd round can never end the
    // match. Without this a single kick decided sudden death, and a save
    // handed the match to the keeper on a 0-0 score.
    if (room.match.round % 2 === 0) {
      winnerId = resolveGoldenPair(room);
      matchOver = winnerId !== null;
    }
    if (!matchOver) room.match.round += 1;
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
  const player = getPlayerForSocket(socket, room);
  const expectedRole = kind === "shot:submit" ? "forvet" : "kaleci";
  const isMyTurn = Boolean(player) && player.role === expectedRole;

  // A shot names the round it was aimed in. The roles alternate every round, so
  // a shot buffered or retried from an earlier round lands on a player whose
  // role matches again two rounds later and would be accepted as their own.
  // Checked leniently: a client that sends no round at all is still allowed,
  // so a stale cached client keeps working, but a wrong one is refused rather
  // than silently scored.
  const claimedRound = toFiniteNumber(payload?.round);
  if (claimedRound !== null && claimedRound !== room.match.round) {
    reply(ack, { ok: false, error: { code: "STALE_ROUND", message: "Bu vuruş eski bir tura ait, tekrar dene." } });
    return;
  }

  if (room.status !== "in_progress" || room.pendingNext) {
    reply(ack, { ok: false, error: { code: "WAIT_NEXT_ROUND", message: "Yeni tur için diğer oyuncuyu bekle." } });
    return;
  }
  if (!isMyTurn) {
    emitError(socket, ack, "ROLE_NOT_ALLOWED", "Bu turda bu işlemi yapma sırası sende değil.");
    return;
  }
  const target = normalizeTarget(payload);
  if (!target) {
    emitError(socket, ack, "INVALID_TARGET", "Geçerli bir hedef bölge seç.");
    return;
  }
  if (room.pendingShots[expectedRole] !== null) {
    reply(ack, { ok: true, ignored: true, role: expectedRole });
    return;
  }

  room.pendingShots[expectedRole] = target;
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
      // There is no timing to hand back here any more. A round has no deadline,
      // so a player who rejoins mid-round simply rejoins the round that is
      // still open, exactly as if they had never left.
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

  // round:ack used to live here. It was "I have the round and I have drawn it",
  // and the only thing the server did with it was hold the round's clock back
  // until both players had arrived. With the clock gone there is nothing to hold
  // back, so a round opens the moment it is announced and waits for both shots.
  // A client still sending round:ack is simply ignored, which is safe: an
  // unknown event on an otherwise idle socket changes nothing.

  socket.on("match:next", (_payload, ack) => {
    const room = getRoomForSocket(socket);
    if (!room || room.status !== "in_progress") {
      emitError(socket, ack, "NOT_IN_ROOM", "Maç artık devam etmiyor.");
      return;
    }
    // A replayed response describes a round the other player already started, so
    // it must not re-announce the round to the whole room.
    const buildResponse = (replayed) => roundReadyPayload(room, replayed);

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
