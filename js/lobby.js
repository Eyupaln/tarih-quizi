(() => {
  "use strict";

  const shared = window.PenaltiShared;
  const roomCodeLabel = document.querySelector("#roomCodeLabel");
  const lobbyRoomLabel = document.querySelector("#lobbyRoomLabel");
  const roomPlayerCount = document.querySelector("#roomPlayerCount");
  const lobbyPlayerCount = document.querySelector("#lobbyPlayerCount");
  const lobbyTitle = document.querySelector("#lobbyTitle");
  const lobbyPlayerSlots = document.querySelector("#lobbyPlayerSlots");
  const readyBarText = document.querySelector("#readyBarText");
  const readyButton = document.querySelector("#readyButton");
  const readyButtonLabel = document.querySelector("#readyButtonLabel");
  const startButton = document.querySelector("#startButton");
  const copyCodeButton = document.querySelector("#copyCodeButton");

  let room = null;
  let starting = false;
  let navigatingToGame = false;
  let socketBindings = [];

  const materialIcon = (name) => `<span class="material-symbols-rounded" aria-hidden="true">${name}</span>`;

  function totalPlayers() {
    return Number(room?.maxPlayers) || 2;
  }

  function currentPlayer() {
    return room?.players?.find((player) => player.id === shared.getPlayerToken()) || null;
  }

  function isHost() {
    return Boolean(currentPlayer()?.isHost);
  }

  function allPlayersReady() {
    const players = room?.players || [];
    return players.length === totalPlayers()
      && players.every((player) => player.connected !== false && player.ready);
  }

  function setRoom(nextRoom) {
    if (!nextRoom) return;
    room = nextRoom;
    shared.setRoomSnapshot(room, room.code);
    render();
    if (room.status === "in_progress") {
      goToGame();
      return;
    }
    // A finished room stays in the lobby so the result can be reviewed.
    if (room.status === "finished") return;
    maybeStartMatch();
  }

  function render() {
    if (!room) return;
    const players = room.players || [];
    const total = totalPlayers();
    const you = currentPlayer();
    const readyCount = players.filter((player) => player.ready && player.connected !== false).length;
    const allReady = allPlayersReady();

    const finished = room.status === "finished";
    const finalScore = room.match?.score || {};
    if (roomCodeLabel) roomCodeLabel.textContent = room.code || "----";
    if (lobbyRoomLabel) lobbyRoomLabel.textContent = `ODA · ${room.code || "----"}`;
    if (roomPlayerCount) {
      roomPlayerCount.textContent = finished
        ? `${finalScore.player1 ?? 0} – ${finalScore.player2 ?? 0}`
        : `${players.length}/${total} oyuncu`;
    }
    if (lobbyPlayerCount) {
      lobbyPlayerCount.textContent = finished
        ? `${finalScore.player1 ?? 0} – ${finalScore.player2 ?? 0}`
        : `${players.length}/${total}`;
    }
    if (lobbyTitle) lobbyTitle.textContent = finished ? "Maç Sonucu" : "1v1 Düello";

    const slots = [];
    players.forEach((player) => {
      const isYou = player.id === shared.getPlayerToken();
      const connected = player.connected !== false;
      const status = !connected
        ? "BAĞLANTI KOPTU"
        : finished
          ? "MAÇ BİTTİ"
          : player.ready
            ? "HAZIR"
            : "BEKLENİYOR";
      const statusClass = !connected ? "slot-status--waiting" : player.ready ? "slot-status--ready" : "slot-status--waiting";
      slots.push(`
        <div class="player-slot ${isYou ? "player-slot--you" : ""}" role="listitem">
          <div class="player-avatar">${materialIcon(isYou ? "sports_soccer" : "person")}</div>
          <div class="player-slot-copy"><strong>${shared.escapeHTML(player.nickname || "OYUNCU")}${isYou ? " · SEN" : ""}</strong><small>${player.isHost ? "Oda sahibi" : "Oyuncu"}</small></div>
          <span class="slot-status ${statusClass}"><i class="status-dot ${connected && player.ready ? "status-dot--online" : ""}"></i>${status}</span>
        </div>
      `);
    });
    for (let index = players.length; index < total; index += 1) {
      slots.push(`
        <div class="player-slot player-slot--empty" role="listitem">
          <div class="player-avatar">${materialIcon("person_add")}</div>
          <div class="player-slot-copy"><strong>Oyuncu ${index + 1}</strong><small>Kodla davet et</small></div>
          <span class="slot-status">BEKLEMEDE</span>
        </div>
      `);
    }
    if (lobbyPlayerSlots) lobbyPlayerSlots.innerHTML = slots.join("");

    if (readyButton) {
      readyButton.disabled = finished || !you || room.status !== "waiting" || you.connected === false;
      readyButton.classList.toggle("is-ready", Boolean(you?.ready));
    }
    if (readyButtonLabel) {
      readyButtonLabel.textContent = finished ? "MAÇ BİTTİ" : you?.ready ? "HAZIRSIN" : "HAZIR OL";
    }
    if (readyBarText) {
      if (finished) {
        const score = room.match?.score || {};
        readyBarText.textContent = `Maç sona erdi · ${score.player1 ?? 0} – ${score.player2 ?? 0}`;
      } else if (players.some((player) => player.connected === false)) readyBarText.textContent = "Rakip bağlantısı bekleniyor…";
      else if (allReady) readyBarText.textContent = "Herkes hazır! Maç başlıyor…";
      else readyBarText.textContent = `${readyCount}/${total} oyuncu hazır`;
    }
    if (startButton) {
      startButton.classList.add("is-visible");
      startButton.disabled = finished || !isHost() || !allReady || starting || room.status !== "waiting";
      startButton.innerHTML = finished
        ? `ANA MENÜ ${materialIcon("arrow_forward")}`
        : isHost()
          ? `MAÇI BAŞLAT ${materialIcon("arrow_forward")}`
          : `RAKİP HAZIR OLSUN ${materialIcon("arrow_forward")}`;
    }
  }

  async function goToGame() {
    if (navigatingToGame || !room?.code) return;
    navigatingToGame = true;
    shared.stopMenuMusic();
    shared.setGameLaunch({ code: room.code, mode: "duo", startedAt: Date.now() });
    await shared.playLoading(350);
    shared.goTo("game.html");
  }

  async function maybeStartMatch() {
    if (starting || navigatingToGame || !room || room.status !== "waiting" || !isHost() || !allPlayersReady()) return;
    starting = true;
    render();
    try {
      const response = await shared.emitWithAck("match:start");
      if (!response?.ok) throw new Error(response?.error?.message || "Maç başlatılamadı.");
    } catch (error) {
      starting = false;
      if (readyBarText) readyBarText.textContent = error.message || "Maç başlatılamadı.";
      render();
    }
  }

  async function toggleReady() {
    const you = currentPlayer();
    if (!you || room?.status !== "waiting") return;
    const nextReady = !you.ready;
    if (readyButton) readyButton.disabled = true;
    try {
      const response = await shared.emitWithAck("lobby:ready", { ready: nextReady });
      if (!response?.ok) throw new Error(response?.error?.message || "Hazır durumu güncellenemedi.");
      if (response.room) setRoom(response.room);
    } catch (error) {
      if (readyBarText) readyBarText.textContent = error.message || "Hazır durumu güncellenemedi.";
      render();
    }
  }

  async function copyRoomCode() {
    if (!room?.code || !copyCodeButton) return;
    try {
      await navigator.clipboard.writeText(room.code);
      copyCodeButton.textContent = "KOD KOPYALANDI";
    } catch {
      copyCodeButton.textContent = room.code;
    }
    window.setTimeout(() => {
      if (copyCodeButton) copyCodeButton.innerHTML = "<span>⧉</span> KODU KOPYALA";
    }, 1400);
  }

  function waitForSocket() {
    if (shared.isSocketConnected()) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        offConnect?.();
        resolve();
      };
      const timer = window.setTimeout(finish, 5000);
      const offConnect = shared.onSocket("connect", finish);
    });
  }

  async function rejoinRoom() {
    const snapshot = shared.getRoomState();
    if (!snapshot?.code) {
      shared.goTo("index.html");
      return;
    }
    try {
      const response = await shared.emitWithAck("room:rejoin", {
        code: snapshot.code,
        nickname: shared.getPlayerName(),
        playerToken: shared.getPlayerToken(),
      });
      if (!response?.ok) {
        if (readyBarText) readyBarText.textContent = response?.error?.message || "Oda bulunamadı.";
        return;
      }
      if (response.room) setRoom(response.room);
      if (response.started) goToGame();
    } catch (error) {
      if (readyBarText) readyBarText.textContent = error.message || "Sunucuya bağlanılamadı.";
    }
  }

  function bindSocketEvents() {
    socketBindings = [
      shared.onSocket("room:state", (payload) => setRoom(payload)),
      shared.onSocket("room:playerJoined", (payload) => setRoom(payload?.room)),
      shared.onSocket("lobby:playerReady", (payload) => setRoom(payload?.room)),
      shared.onSocket("room:playerLeft", (payload) => setRoom(payload?.room)),
      shared.onSocket("room:playerReconnected", (payload) => setRoom(payload?.room)),
      shared.onSocket("opponent:disconnected", (payload) => {
        setRoom(payload?.room);
        if (readyBarText) readyBarText.textContent = payload?.message || "Rakip bağlantısı kesildi.";
      }),
      shared.onSocket("match:started", (payload) => {
        if (payload?.room) setRoom(payload.room);
        goToGame();
      }),
      shared.onSocket("room:error", (payload) => {
        if (readyBarText) readyBarText.textContent = payload?.message || "Oda işlemi başarısız.";
        starting = false;
        render();
      }),
      shared.onSocket("connect_error", () => {
        if (readyBarText) readyBarText.textContent = "Sunucuya bağlanılamadı.";
      }),
    ];
  }

  async function init() {
    if (!shared.requirePlayerName()) return;
    shared.bindSoundToggle();
    bindSocketEvents();

    readyButton?.addEventListener("click", toggleReady);
    startButton?.addEventListener("click", () => {
      if (room?.status === "finished") {
        shared.leaveRoom();
        shared.goTo("index.html");
        return;
      }
      maybeStartMatch();
    });
    copyCodeButton?.addEventListener("click", copyRoomCode);
    document.querySelectorAll(".lobby-page-actions .back-link, .flow-topline .back-link").forEach((link) => {
      link.addEventListener("click", () => shared.leaveRoom());
    });

    await shared.playLoading(shared.getInitialLoadingDuration());
    await waitForSocket();
    await rejoinRoom();
    render();
  }

  init();
})();
