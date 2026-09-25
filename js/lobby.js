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

  const materialIcon = (name) => `<span class="material-symbols-rounded" aria-hidden="true">${name}</span>`;

  function totalPlayers() {
    return room?.mode === "tournament" ? 3 : 2;
  }

  function ensureDemoOpponent() {
    if (!room?.isDemo) return;
    const total = totalPlayers();
    if (room.players.length >= total) return;
    const botNames = ["MERT", "AYLA", "KAF"];
    while (room.players.length < total) {
      const index = room.players.length;
      room.players.push({ id: `bot-demo-${index}`, name: botNames[index] || "RAKİP", ready: true, bot: true });
    }
    shared.setRoomState(room);
  }

  function currentPlayer() {
    return room?.players.find((player) => player.id === shared.getPlayerId()) || room?.players.find((player) => !player.bot);
  }

  function render() {
    if (!room) return;
    const total = totalPlayers();
    const players = room.players || [];
    const allReady = players.length === total && players.every((player) => player.ready);
    const you = currentPlayer();
    const youReady = Boolean(you?.ready);

    if (roomCodeLabel) roomCodeLabel.textContent = room.code || "----";
    if (lobbyRoomLabel) lobbyRoomLabel.textContent = `ODA · ${room.code || "----"}`;
    if (roomPlayerCount) roomPlayerCount.textContent = `${players.length}/${total} oyuncu`;
    if (lobbyPlayerCount) lobbyPlayerCount.textContent = `${players.length}/${total}`;
    if (lobbyTitle) lobbyTitle.textContent = room.mode === "tournament" ? "3'lü Turnuva" : "1v1 Düello";

    const slots = [];
    players.forEach((player) => {
      const isYou = player.id === shared.getPlayerId();
      const status = player.ready ? "HAZIR" : "BEKLENİYOR";
      slots.push(`
        <div class="player-slot ${isYou ? "player-slot--you" : ""}" role="listitem">
          <div class="player-avatar">${materialIcon(player.bot ? "person" : "sports_soccer")}</div>
          <div class="player-slot-copy"><strong>${shared.escapeHTML(player.name)}${isYou ? " · SEN" : ""}</strong><small>${player.bot ? "Bot rakip" : "Oyuncu"}</small></div>
          <span class="slot-status ${player.ready ? "slot-status--ready" : "slot-status--waiting"}"><i class="status-dot ${player.ready ? "status-dot--online" : ""}"></i>${status}</span>
        </div>
      `);
    });
    for (let index = players.length; index < total; index += 1) {
      slots.push(`<div class="player-slot player-slot--empty" role="listitem"><div class="player-avatar">${materialIcon("person_add")}</div><div class="player-slot-copy"><strong>Oyuncu ${index + 1}</strong><small>Kodla davet et</small></div><span class="slot-status">BEKLEMEDE</span></div>`);
    }
    if (lobbyPlayerSlots) lobbyPlayerSlots.innerHTML = slots.join("");

    if (readyButton) {
      readyButton.disabled = !you;
      readyButton.classList.toggle("is-ready", youReady);
    }
    if (readyButtonLabel) readyButtonLabel.textContent = youReady ? "HAZIRSIN" : "HAZIR OL";
    if (readyBarText) {
      readyBarText.textContent = allReady ? "Herkes hazır! Maçı başlatabilirsin." : `${players.filter((player) => player.ready).length}/${total} oyuncu hazır`;
    }
    if (startButton) {
      startButton.classList.add("is-visible");
      startButton.disabled = !allReady;
      startButton.innerHTML = `${room.mode === "tournament" ? "TURNUVAYI BAŞLAT" : "MAÇI BAŞLAT"} ${materialIcon("arrow_forward")}`;
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

  async function init() {
    if (!shared.requirePlayerName()) return;
    shared.bindSoundToggle();
    room = shared.getRoomState();
    if (!room?.code) {
      shared.goTo("index.html");
      return;
    }
    ensureDemoOpponent();
    render();

    readyButton?.addEventListener("click", () => {
      const you = currentPlayer();
      if (!you) return;
      you.ready = !you.ready;
      shared.setRoomState(room);
      render();
    });

    startButton?.addEventListener("click", async () => {
      if (startButton.disabled) return;
      shared.setGameLaunch({ code: room.code, mode: room.mode || "duo", startedAt: Date.now() });
      await shared.playLoading(450);
      shared.goTo("game.html");
    });
    copyCodeButton?.addEventListener("click", copyRoomCode);
    document.querySelectorAll(".lobby-page-actions .back-link, .flow-topline .back-link").forEach((link) => {
      link.addEventListener("click", () => shared.clearRoomState());
    });

    await shared.playLoading(shared.getInitialLoadingDuration());
    render();
  }

  init();
})();
