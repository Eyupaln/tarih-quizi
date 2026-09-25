(() => {
  "use strict";

  const STORAGE_KEYS = {
    playerName: "penalti.playerName",
    playerId: "penalti.playerId",
    roomCode: "penalti.roomCode",
    roomState: "penalti.roomState",
    gameLaunch: "penalti.gameLaunch",
    loadingSeen: "penalti.loadingSeen",
    sound: "penalti.sound",
    menuMusic: "penalti.menuMusic",
  };

  const bannedWords = [
    "admin",
    "administrator",
    "moderator",
    "root",
    "sistem",
    "hacker",
  ];

  const nicknameRules = {
    minLength: 3,
    maxLength: 16,
    allowedCharacters: /^[\p{L}\p{N} _-]+$/u,
  };

  function readStorage(key, fallback = null) {
    try {
      const value = sessionStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Session storage can be unavailable in private/file contexts.
    }
  }

  function removeStorage(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage failures; navigation still works.
    }
  }

  function normalizeNickname(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function validateNickname(value) {
    const normalized = normalizeNickname(value);
    if (normalized.length < nicknameRules.minLength) {
      return { valid: false, value: normalized, message: `İsim en az ${nicknameRules.minLength} karakter olmalı.` };
    }
    if (normalized.length > nicknameRules.maxLength) {
      return { valid: false, value: normalized, message: `İsim en fazla ${nicknameRules.maxLength} karakter olabilir.` };
    }
    if (!nicknameRules.allowedCharacters.test(normalized)) {
      return { valid: false, value: normalized, message: "İsimde yalnızca harf, sayı, boşluk, _ ve - kullanabilirsin." };
    }

    const comparable = normalized.toLocaleLowerCase("tr-TR");
    const blockedWord = bannedWords.find((word) => comparable.includes(word.toLocaleLowerCase("tr-TR")));
    if (blockedWord) {
      return { valid: false, value: normalized, message: "Bu isim kullanılamaz. Lütfen başka bir isim seç." };
    }

    return { valid: true, value: normalized, message: "" };
  }

  function getPlayerName() {
    return readStorage(STORAGE_KEYS.playerName, "") || "";
  }

  function setPlayerName(name) {
    const result = validateNickname(name);
    if (!result.valid) return result;
    writeStorage(STORAGE_KEYS.playerName, result.value);
    if (!readStorage(STORAGE_KEYS.playerId)) {
      writeStorage(STORAGE_KEYS.playerId, `player-${Date.now().toString(36)}`);
    }
    return result;
  }

  function getPlayerId() {
    let playerId = readStorage(STORAGE_KEYS.playerId, "");
    if (!playerId) {
      playerId = `player-${Date.now().toString(36)}`;
      writeStorage(STORAGE_KEYS.playerId, playerId);
    }
    return playerId;
  }

  function randomRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  }

  function normalizeRoomCode(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  }

  function getRoomState() {
    try {
      const value = readStorage(STORAGE_KEYS.roomState, null);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function setRoomState(room) {
    writeStorage(STORAGE_KEYS.roomState, JSON.stringify(room));
    if (room?.code) writeStorage(STORAGE_KEYS.roomCode, room.code);
  }

  function clearRoomState() {
    removeStorage(STORAGE_KEYS.roomState);
    removeStorage(STORAGE_KEYS.roomCode);
    removeStorage(STORAGE_KEYS.gameLaunch);
  }

  function getGameLaunch() {
    try {
      const value = readStorage(STORAGE_KEYS.gameLaunch, null);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function setGameLaunch(launch) {
    writeStorage(STORAGE_KEYS.gameLaunch, JSON.stringify(launch));
  }

  function clearGameLaunch() {
    removeStorage(STORAGE_KEYS.gameLaunch);
  }

  function getInitialLoadingDuration() {
    const hasVisited = readStorage(STORAGE_KEYS.loadingSeen, "false") === "true";
    const isReload = window.performance?.getEntriesByType?.("navigation")?.[0]?.type === "reload";
    writeStorage(STORAGE_KEYS.loadingSeen, "true");
    return hasVisited || isReload ? 1100 : 1200;
  }

  function playLoading(duration = 650) {
    const screen = document.querySelector("#loadingScreen");
    document.body.classList.add("is-loading");
    if (!screen) {
      return new Promise((resolve) => window.setTimeout(resolve, duration));
    }
    screen.classList.remove("is-hidden");
    screen.setAttribute("aria-hidden", "false");
    screen.setAttribute("aria-busy", "true");
    return new Promise((resolve) => {
      window.setTimeout(() => {
        screen.classList.add("is-hidden");
        screen.setAttribute("aria-hidden", "true");
        screen.setAttribute("aria-busy", "false");
        document.body.classList.remove("is-loading");
        resolve();
      }, duration);
    });
  }

  function requirePlayerName() {
    if (getPlayerName()) return true;
    window.location.replace("index.html");
    return false;
  }

  function goTo(path) {
    window.location.href = path;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getSoundEnabled() {
    return readStorage(STORAGE_KEYS.sound, "true") !== "false";
  }

  const MENU_TRACK_SOURCES = [
    encodeURI("assets/menü1.mp3"),
    encodeURI("assets/menü2.mp3"),
    encodeURI("assets/menü3.mp3"),
  ];
  const MENU_MUSIC_VOLUME = 0.7;
  let menuPlayers = null;
  let menuMusicActive = false;
  let currentMenuTrack = null;
  let lastMenuTrackIndex = -1;
  let menuTrackBag = [];

  function getMenuPlayers() {
    if (menuPlayers) return menuPlayers;
    menuPlayers = MENU_TRACK_SOURCES.map((source) => {
      const player = new Audio(source);
      player.preload = "auto";
      player.volume = MENU_MUSIC_VOLUME;
      player.load();
      return player;
    });
    return menuPlayers;
  }

  function readMenuMusicState() {
    try {
      const value = readStorage(STORAGE_KEYS.menuMusic, null);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function persistMenuMusicState(trackIndex = lastMenuTrackIndex, position = 0) {
    if (!menuMusicActive) return;
    writeStorage(STORAGE_KEYS.menuMusic, JSON.stringify({
      active: true,
      trackIndex,
      position: Number.isFinite(position) && position > 0 ? position : 0,
    }));
  }

  function refillMenuTrackBag() {
    const players = getMenuPlayers();
    const bag = players.map((_, index) => index);
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
    }
    if (lastMenuTrackIndex >= 0 && bag[0] === lastMenuTrackIndex && bag.length > 1) {
      [bag[0], bag[1]] = [bag[1], bag[0]];
    }
    menuTrackBag = bag;
  }

  function takeNextMenuTrackIndex() {
    if (menuTrackBag.length === 0) refillMenuTrackBag();
    lastMenuTrackIndex = menuTrackBag.shift();
    return lastMenuTrackIndex;
  }

  function seekMenuTrack(player, position) {
    if (!(position > 0)) return;
    const applyPosition = () => {
      try {
        const maxPosition = Number.isFinite(player.duration) ? Math.max(0, player.duration - 0.1) : position;
        player.currentTime = Math.min(position, maxPosition);
      } catch {
        // The track may still be loading its metadata.
      }
    };
    if (player.readyState >= 1) applyPosition();
    else player.addEventListener("loadedmetadata", applyPosition, { once: true });
  }

  function playMenuTrack(trackIndex, position = 0) {
    const players = getMenuPlayers();
    if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex >= players.length) return;
    const player = players[trackIndex];
    currentMenuTrack = player;
    lastMenuTrackIndex = trackIndex;
    seekMenuTrack(player, position);
    const playRequest = player.play();
    if (playRequest) playRequest.catch(() => {});
    persistMenuMusicState(trackIndex, position);
  }

  function playNextMenuTrack() {
    if (!menuMusicActive || !getSoundEnabled()) return;
    playMenuTrack(takeNextMenuTrackIndex());
  }

  function resumeMenuMusic() {
    if (document.body?.dataset?.page === "game" || !getSoundEnabled()) return;
    const savedState = readMenuMusicState();
    if (!menuMusicActive && !savedState?.active) return;
    menuMusicActive = true;

    if (currentMenuTrack) {
      if (currentMenuTrack.paused) {
        const playRequest = currentMenuTrack.play();
        if (playRequest) playRequest.catch(() => {});
      }
      return;
    }

    const savedIndex = Number.isInteger(savedState?.trackIndex)
      && savedState.trackIndex >= 0
      && savedState.trackIndex < MENU_TRACK_SOURCES.length
      ? savedState.trackIndex
      : null;
    const trackIndex = savedIndex ?? takeNextMenuTrackIndex();
    playMenuTrack(trackIndex, Number(savedState?.position) || 0);
  }

  function startMenuMusic() {
    if (document.body?.dataset?.page === "game" || !getSoundEnabled()) return;
    menuMusicActive = true;
    writeStorage(STORAGE_KEYS.menuMusic, JSON.stringify({ active: true, trackIndex: lastMenuTrackIndex, position: 0 }));
    resumeMenuMusic();
  }

  function pauseMenuMusic() {
    if (!menuMusicActive || !menuPlayers) return;
    const trackIndex = currentMenuTrack ? menuPlayers.indexOf(currentMenuTrack) : lastMenuTrackIndex;
    const position = currentMenuTrack?.currentTime || 0;
    menuPlayers.forEach((player) => player.pause());
    persistMenuMusicState(trackIndex, position);
  }

  function stopMenuMusic() {
    if (menuMusicActive && menuPlayers) {
      const trackIndex = currentMenuTrack ? menuPlayers.indexOf(currentMenuTrack) : lastMenuTrackIndex;
      const position = currentMenuTrack?.currentTime || 0;
      menuPlayers.forEach((player) => player.pause());
      persistMenuMusicState(trackIndex, position);
    }
    menuMusicActive = false;
    currentMenuTrack = null;
  }

  function clearMenuMusic() {
    stopMenuMusic();
    if (menuPlayers) {
      menuPlayers.forEach((player) => {
        try {
          player.currentTime = 0;
        } catch {
          // The track may still be loading its metadata.
        }
      });
    }
    removeStorage(STORAGE_KEYS.menuMusic);
  }

  function syncMenuMusic() {
    if (getSoundEnabled()) resumeMenuMusic();
    else pauseMenuMusic();
  }

  function bindSoundToggle() {
    const button = document.querySelector("#soundToggle");
    if (!button) return;
    let enabled = getSoundEnabled();
    const update = () => button.setAttribute("aria-pressed", String(enabled));
    update();
    button.addEventListener("click", () => {
      enabled = !enabled;
      writeStorage(STORAGE_KEYS.sound, String(enabled));
      update();
      syncMenuMusic();
    });
  }

  document.addEventListener("pointerdown", resumeMenuMusic);
  document.addEventListener("keydown", resumeMenuMusic);
  window.addEventListener("pagehide", () => {
    if (!menuMusicActive || !currentMenuTrack || !menuPlayers) return;
    persistMenuMusicState(menuPlayers.indexOf(currentMenuTrack), currentMenuTrack.currentTime);
  });

  if (document.body?.dataset?.page !== "game" && readMenuMusicState()?.active) {
    resumeMenuMusic();
  }

  window.PenaltiShared = {
    STORAGE_KEYS,
    bannedWords,
    nicknameRules,
    normalizeNickname,
    validateNickname,
    getPlayerName,
    setPlayerName,
    getPlayerId,
    randomRoomCode,
    normalizeRoomCode,
    getRoomState,
    setRoomState,
    clearRoomState,
    getGameLaunch,
    setGameLaunch,
    clearGameLaunch,
    getInitialLoadingDuration,
    playLoading,
    requirePlayerName,
    goTo,
    escapeHTML,
    getSoundEnabled,
    startMenuMusic,
    resumeMenuMusic,
    pauseMenuMusic,
    stopMenuMusic,
    clearMenuMusic,
    bindSoundToggle,
  };
})();
