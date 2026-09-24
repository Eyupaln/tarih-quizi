(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const materialIcon = (name, className = "") => `<span class="material-symbols-rounded ${className}" aria-hidden="true">${name}</span>`;

  const els = {
    loadingScreen: $("#loadingScreen"),
    appShell: $("#appShell"),
    lobbyView: $("#lobbyView"),
    matchView: $("#matchView"),
    tournamentView: $("#tournamentView"),
    brandHome: $("#brandHome"),
    soundToggle: $("#soundToggle"),
    createRoomButton: $("#createRoomButton"),
    joinRoomButton: $("#joinRoomButton"),
    joinPanel: $("#joinPanel"),
    roomCodeInput: $("#roomCodeInput"),
    joinConfirmButton: $("#joinConfirmButton"),
    roomPanel: $("#roomPanel"),
    roomCodeLabel: $("#roomCodeLabel"),
    copyCodeButton: $("#copyCodeButton"),
    roomPlayerCount: $("#roomPlayerCount"),
    lobbyPlayerCount: $("#lobbyPlayerCount"),
    lobbyPlayerSlots: $("#lobbyPlayerSlots"),
    readyBarText: $("#readyBarText"),
    readyButton: $("#readyButton"),
    readyButtonLabel: $("#readyButtonLabel"),
    startButton: $("#startButton"),
    quickDemoButton: $("#quickDemoButton"),
    matchRoomLabel: $("#matchRoomLabel"),
    leaveMatchButton: $("#leaveMatchButton"),
    youAvatar: $("#youAvatar"),
    youName: $("#youName"),
    youScore: $("#youScore"),
    opponentAvatar: $("#opponentAvatar"),
    opponentName: $("#opponentName"),
    opponentScore: $("#opponentScore"),
    opponentRoleLabel: $("#opponentRoleLabel"),
    matchScoreboard: $("#matchScoreboard"),
    scoreText: $("#scoreText"),
    scoreStatus: $("#scoreStatus"),
    scoreFeedback: $("#scoreFeedback"),
    roundEyebrow: $("#roundEyebrow"),
    roundCurrent: $("#roundCurrent"),
    roundTotal: $("#roundTotal"),
    roundLabel: $("#roundLabel"),
    youAttemptDots: $("#youAttemptDots"),
    opponentAttemptDots: $("#opponentAttemptDots"),
    youAttemptCount: $("#youAttemptCount"),
    opponentAttemptCount: $("#opponentAttemptCount"),
    roleBanner: $("#roleBanner"),
    roleBannerIcon: $("#roleBannerIcon"),
    roleTitle: $("#roleTitle"),
    roleTimer: $("#roleTimer"),
    pitch: $("#pitch"),
    goalFrame: $("#goalFrame"),
    targetGrid: $("#targetGrid"),
    keeper: $("#keeper"),
    trajectory: $("#trajectory"),
    trajectoryPath: $("#trajectoryPath"),
    trajectoryEnd: $("#trajectoryEnd"),
    ballHandle: $("#ballHandle"),
    football: $("#football"),
    tapLabel: $("#tapLabel"),
    gestureHint: $("#gestureHint"),
    pitchBadge: $("#pitchBadge"),
    opponentStatusAvatar: $("#opponentStatusAvatar"),
    opponentStatusText: $("#opponentStatusText"),
    statusPulse: $("#statusPulse"),
    opponentActionButton: $("#opponentActionButton"),
    opponentTargetGrid: $("#opponentTargetGrid"),
    opponentTargetLabel: $("#opponentTargetLabel"),
    instructionIcon: $("#instructionIcon"),
    actionTitle: $("#actionTitle"),
    actionSubtitle: $("#actionSubtitle"),
    powerMeter: $("#powerMeter"),
    powerLabel: $("#powerLabel"),
    powerFill: $("#powerFill"),
    powerValue: $("#powerValue"),
    confirmButton: $("#confirmButton"),
    roundHint: $("#roundHint"),
    rulesButton: $("#rulesButton"),
    leaveTournamentButton: $("#leaveTournamentButton"),
    tournamentProgress: $("#tournamentProgress"),
    tournamentMatches: $("#tournamentMatches"),
    leaderboardCard: $("#leaderboardCard"),
    punishmentCard: $("#punishmentCard"),
    tournamentNextButton: $("#tournamentNextButton"),
    toast: $("#toast"),
    toastText: $("#toastText"),
    countdownOverlay: $("#countdownOverlay"),
    countdownNumber: $("#countdownNumber"),
    countdownWord: $("#countdownWord"),
    resultOverlay: $("#resultOverlay"),
    resultCard: $("#resultCard"),
    resultConfetti: $("#resultConfetti"),
    resultIcon: $("#resultIcon"),
    resultEyebrow: $("#resultEyebrow"),
    resultTitle: $("#resultTitle"),
    resultMessage: $("#resultMessage"),
    resultScore: $("#resultScore"),
    resultStats: $("#resultStats"),
    resultPrimaryButton: $("#resultPrimaryButton"),
    resultSecondaryButton: $("#resultSecondaryButton"),
    rulesSheet: $("#rulesSheet"),
    rulesBackdrop: $("#rulesBackdrop"),
    closeRulesButton: $("#closeRulesButton"),
  };

  const loadingVisitKey = "penalti-duello-loading-seen";
  let hasVisitedSite = false;

  try {
    hasVisitedSite = sessionStorage.getItem(loadingVisitKey) === "true";
    sessionStorage.setItem(loadingVisitKey, "true");
  } catch {
    // Keep the first-load timing if session storage is unavailable.
  }

  document.body.classList.add("is-loading");
  const isReload = window.performance?.getEntriesByType?.("navigation")?.[0]?.type === "reload";
  const loadingDuration = hasVisitedSite || isReload ? 1100 : 1200;

  if (els.loadingScreen) {
    els.loadingScreen.dataset.duration = String(loadingDuration);
    window.setTimeout(() => {
      els.loadingScreen.classList.add("is-hidden");
      els.loadingScreen.setAttribute("aria-busy", "false");
      els.loadingScreen.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-loading");
    }, loadingDuration);
  } else {
    document.body.classList.remove("is-loading");
  }

  const BOT_POOL = {
    duo: [
      { id: "opponent", name: "MERT", avatar: "sports_handball" },
      { id: "opponent", name: "AYLA", avatar: "person" },
      { id: "opponent", name: "KAF", avatar: "smart_toy" },
    ],
    tournament: [
      { id: "bot-b", name: "MERT", avatar: "sports_handball" },
      { id: "bot-c", name: "AYLA", avatar: "person" },
    ],
  };

  const state = {
    mode: "duo",
    room: false,
    roomCode: "",
    players: [],
    match: null,
    tournament: null,
    resultAction: null,
    sound: true,
  };

  let toastTimer = null;
  let roundTimer = null;
  let countdownTimers = [];
  let resolveTimer = null;
  let scoreFeedbackTimer = null;
  let audioContext = null;

  const playerYou = () => ({ id: "you", name: "SEN", avatar: "sports_soccer", ready: false, bot: false });

  function randomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clonePlayer(player) {
    return { ...player, wins: player.wins || 0, losses: player.losses || 0, goals: player.goals || 0 };
  }

  function getTotalPlayers() {
    return state.mode === "tournament" ? 3 : 2;
  }

  function setView(name) {
    const views = { lobby: els.lobbyView, match: els.matchView, tournament: els.tournamentView };
    Object.entries(views).forEach(([key, view]) => view.classList.toggle("view--active", key === name));
    els.appShell.classList.toggle("is-lobby", name === "lobby");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function clearMatchTimers() {
    if (roundTimer) window.clearInterval(roundTimer);
    if (resolveTimer) window.clearTimeout(resolveTimer);
    if (scoreFeedbackTimer) window.clearTimeout(scoreFeedbackTimer);
    countdownTimers.forEach((timer) => window.clearTimeout(timer));
    roundTimer = null;
    resolveTimer = null;
    scoreFeedbackTimer = null;
    countdownTimers = [];
    if (els.scoreFeedback) {
      els.scoreFeedback.classList.remove("is-visible", "score-feedback--goal", "score-feedback--save", "score-feedback--miss", "score-feedback--conceded");
      els.scoreFeedback.textContent = "";
    }
    [els.youScore, els.opponentScore].forEach((score) => score?.classList.remove("score-pop"));
    if (els.matchScoreboard) els.matchScoreboard.classList.remove("is-goal", "is-save", "is-miss", "is-conceded");
  }

  function hideOverlays() {
    els.countdownOverlay.hidden = true;
    els.resultOverlay.hidden = true;
    els.rulesSheet.hidden = true;
  }

  function showToast(message, tone = "green") {
    els.toastText.textContent = message;
    const icon = $(".toast-icon", els.toast);
    if (icon) icon.innerHTML = materialIcon(tone === "orange" ? "priority_high" : tone === "yellow" ? "star" : "auto_awesome");
    els.toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2800);
  }

  function playTone(frequency = 520, duration = 0.08, type = "sine") {
    if (!state.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.055, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration + 0.02);
    } catch {
      // Audio is an enhancement; browsers may block it until a gesture.
    }
  }

  function setMode(mode) {
    if (state.mode === mode && !state.room && !state.match && !state.tournament) {
      updateModeButtons();
      return;
    }
    state.mode = mode;
    resetRoom();
    updateModeButtons();
    renderLobby();
  }

  function updateModeButtons() {
    $$(".mode-button").forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle("mode-button--active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  function resetRoom() {
    clearMatchTimers();
    hideOverlays();
    state.room = false;
    state.roomCode = "";
    state.players = [];
    state.match = null;
    state.tournament = null;
    els.joinPanel.hidden = true;
    els.roomPanel.hidden = true;
  }

  function createBot(source, index = 0) {
    const bot = source[index % source.length];
    return { ...bot, name: bot.name, ready: true, bot: true, wins: 0, losses: 0, goals: 0 };
  }

  function setupDemoRoom(customCode = "") {
    const you = playerYou();
    const total = getTotalPlayers();
    const bots = [];
    const pool = state.mode === "tournament" ? BOT_POOL.tournament : BOT_POOL.duo;
    for (let index = 0; index < total - 1; index += 1) bots.push(createBot(pool, index));
    state.players = [you, ...bots];
    state.room = true;
    state.roomCode = (customCode || randomCode()).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(4, "X");
    els.roomCodeInput.value = "";
    els.joinPanel.hidden = true;
    els.roomPanel.hidden = false;
    renderLobby();
    showToast(`Oda ${state.roomCode} açıldı. Kodu arkadaşınla paylaş.`);
  }

  function renderLobby() {
    const total = getTotalPlayers();
    const players = state.room ? state.players : [playerYou()];
    const filled = players.length;
    const readyCount = players.filter((player) => player.ready).length;
    const allReady = state.room && readyCount === total;

    els.lobbyPlayerCount.textContent = `${filled}/${total}`;
    els.roomPlayerCount.textContent = `${filled}/${total} oyuncu`;
    els.roomCodeLabel.textContent = state.roomCode || "----";
    els.roomPanel.hidden = !state.room;

    const slots = [];
    players.forEach((player) => {
      const isYou = player.id === "you";
      const ready = Boolean(player.ready);
      const status = isYou ? (ready ? "HAZIR" : "BEKLENİYOR") : ready ? "HAZIR" : "BEKLENİYOR";
      slots.push(`
        <div class="player-slot ${isYou ? "player-slot--you" : ""}">
          <div class="player-avatar">${materialIcon(player.avatar)}</div>
          <div class="player-slot-copy">
            <strong>${escapeHTML(player.name)}${isYou ? " · SEN" : ""}</strong>
            <small>${player.bot ? "Bot rakip" : "Ev sahibi"}</small>
          </div>
          <span class="slot-status ${ready ? "slot-status--ready" : "slot-status--waiting"}"><i class="status-dot ${ready ? "status-dot--online" : ""}"></i>${status}</span>
        </div>
      `);
    });
    for (let index = filled; index < total; index += 1) {
      slots.push(`
        <div class="player-slot player-slot--empty">
          <div class="player-avatar">${materialIcon("person_add")}</div>
          <div class="player-slot-copy"><strong>Oyuncu ${index + 1}</strong><small>Kodla davet et</small></div>
          <span class="slot-status">BEKLEMEDE</span>
        </div>
      `);
    }
    els.lobbyPlayerSlots.innerHTML = slots.join("");

    const you = players.find((player) => player.id === "you");
    const youReady = Boolean(you?.ready);
    els.readyButton.disabled = !state.room;
    els.readyButton.classList.toggle("is-ready", youReady);
    els.readyButtonLabel.textContent = youReady ? "HAZIRSIN" : "HAZIR OL";
    els.startButton.classList.toggle("is-visible", Boolean(state.room));
    els.startButton.disabled = !allReady;
    els.startButton.innerHTML = state.mode === "tournament" ? `TURNUVAYI BAŞLAT ${materialIcon("arrow_forward")}` : `MAÇI BAŞLAT ${materialIcon("arrow_forward")}`;

    if (!state.room) {
      els.readyBarText.textContent = "Oda oluştur veya bir odaya katıl";
    } else if (allReady) {
      els.readyBarText.textContent = "Herkes hazır! Maçı başlatabilirsin.";
    } else {
      els.readyBarText.textContent = `${readyCount}/${total} oyuncu hazır`;
    }
  }

  function toggleReady() {
    if (!state.room) return;
    const you = state.players.find((player) => player.id === "you");
    if (!you) return;
    you.ready = !you.ready;
    playTone(you.ready ? 650 : 390, 0.06);
    renderLobby();
    if (you.ready) showToast("Hazırsın! Rakibin de hazır olmasını bekle.");
  }

  function startRoom() {
    if (!state.room) return;
    const total = getTotalPlayers();
    if (state.players.filter((player) => player.ready).length !== total) {
      showToast("Tüm oyuncular hazır olmalı.", "orange");
      return;
    }
    if (state.mode === "tournament") {
      startTournament();
    } else {
      startMatch(state.players[0], state.players[1], { tournamentIndex: null });
    }
  }

  function quickDemo() {
    setupDemoRoom();
    const you = state.players.find((player) => player.id === "you");
    if (you) you.ready = true;
    renderLobby();
    startRoom();
  }

  async function copyRoomCode() {
    if (!state.roomCode) return;
    try {
      await navigator.clipboard.writeText(state.roomCode);
      showToast("Oda kodu kopyalandı.");
    } catch {
      showToast(`Oda kodun: ${state.roomCode}`, "yellow");
    }
  }

  function joinRoom() {
    const code = (els.roomCodeInput.value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (code.length !== 4) {
      showToast("4 haneli oda kodunu gir.", "orange");
      els.roomCodeInput.focus();
      return;
    }
    setupDemoRoom(code);
    showToast(`${code} odasına bağlandın.`);
  }

  // Match lifecycle
  function startMatch(playerOne, playerTwo, options = {}) {
    clearMatchTimers();
    hideOverlays();
    const you = { ...playerOne, id: "you", name: "SEN", avatar: "sports_soccer" };
    const opponent = { ...playerTwo };
    state.match = {
      players: [you, opponent],
      score: [0, 0],
      attempts: [[], []],
      saves: [0, 0],
      round: 1,
      suddenDeath: false,
      phase: "aim",
      userAim: null,
      botAim: null,
      userConfirmed: false,
      botConfirmed: false,
      startedAt: Date.now(),
      tournamentIndex: options.tournamentIndex ?? null,
      tournamentRecorded: false,
      lastResult: null,
    };
    els.youScore.textContent = "0";
    els.opponentScore.textContent = "0";
    els.scoreText.textContent = "0 – 0";
    els.matchRoomLabel.textContent = `ODA · ${state.roomCode || "DEMO"}`;
    setView("match");
    beginRound();
  }

  function userIsStriker() {
    return Boolean(state.match && state.match.round % 2 === 1);
  }

  function beginRound() {
    const match = state.match;
    if (!match) return;
    match.phase = "aim";
    match.userAim = null;
    match.botAim = null;
    match.userConfirmed = false;
    match.botConfirmed = false;
    match.startedAt = Date.now();
    resetPitchVisuals();
    renderMatch();
    const status = userIsStriker() ? "Rakip kaleyi savunuyor…" : "Rakip şutunu hazırlıyor…";
    els.opponentStatusText.textContent = status;
    els.statusPulse.classList.remove("is-ready");
    if (roundTimer) window.clearInterval(roundTimer);
    roundTimer = window.setInterval(updateRoundTimer, 500);
  }

  function updateRoundTimer() {
    const match = state.match;
    if (!match || match.phase === "result" || match.phase === "resolving" || match.phase === "finished") {
      if (els.roleTimer) els.roleTimer.textContent = "—";
      return;
    }
    const elapsed = Math.floor((Date.now() - match.startedAt) / 1000);
    const remaining = Math.max(0, 10 - elapsed);
    if (els.roleTimer) els.roleTimer.textContent = `00:${String(remaining).padStart(2, "0")}`;
    if (remaining === 0) els.roleTimer?.classList.add("is-time-warning");
  }

  function pulseScore(element) {
    if (!element) return;
    element.classList.remove("score-pop");
    void element.offsetWidth;
    element.classList.add("score-pop");
  }

  function showScoreFeedback(result) {
    if (!els.scoreFeedback) return;
    const userScored = result === "goal" && userIsStriker();
    const userConceded = result === "goal" && !userIsStriker();
    const userSaved = result === "save" && !userIsStriker();
    const tone = result === "goal" ? (userConceded ? "conceded" : "goal") : result;
    const labels = {
      goal: userScored ? "GOL!" : "GOL YEDİN+!",
      save: userSaved ? "KURTARDIN!" : "KURTARDI!",
      miss: "KAÇIRDI!",
    };
    window.clearTimeout(scoreFeedbackTimer);
    els.scoreFeedback.textContent = labels[result] || "";
    els.scoreFeedback.classList.remove("is-visible", "score-feedback--goal", "score-feedback--save", "score-feedback--miss", "score-feedback--conceded");
    els.scoreFeedback.classList.add("is-visible", `score-feedback--${tone}`);
    if (els.matchScoreboard) {
      els.matchScoreboard.classList.remove("is-goal", "is-save", "is-miss", "is-conceded");
      els.matchScoreboard.classList.add(`is-${tone}`);
    }
    scoreFeedbackTimer = window.setTimeout(() => {
      els.scoreFeedback.classList.remove("is-visible");
      if (els.matchScoreboard) els.matchScoreboard.classList.remove("is-goal", "is-save", "is-miss", "is-conceded");
      scoreFeedbackTimer = null;
    }, 950);
  }

  function renderMatch() {
    const match = state.match;
    if (!match) return;
    const [you, opponent] = match.players;
    const striker = userIsStriker();
    const regularRound = Math.min(5, ((match.round - 1) % 5) + 1);
    const currentAttempt = match.suddenDeath ? Math.floor((match.round - 10 + 1) / 2) : regularRound;
    const totalLabel = match.suddenDeath ? "ALTIN" : "/ 5";
    const attemptText = match.suddenDeath ? `ALTIN ${currentAttempt}` : `${currentAttempt} / 5`;
    const previousYouScore = els.youScore.textContent.trim();
    const previousOpponentScore = els.opponentScore.textContent.trim();

    els.youAvatar.innerHTML = materialIcon(you.avatar);
    els.youName.textContent = you.name;
    els.opponentAvatar.innerHTML = materialIcon(opponent.avatar);
    els.opponentName.textContent = opponent.name;
    els.youScore.textContent = String(match.score[0]);
    els.opponentScore.textContent = String(match.score[1]);
    if (previousYouScore && previousYouScore !== els.youScore.textContent) pulseScore(els.youScore);
    if (previousOpponentScore && previousOpponentScore !== els.opponentScore.textContent) pulseScore(els.opponentScore);
    els.scoreText.textContent = `${match.score[0]} – ${match.score[1]}`;
    els.scoreStatus.textContent = match.suddenDeath ? "ALTIN PENALTI" : "MAÇ";
    els.roundEyebrow.textContent = match.suddenDeath ? "ALTIN VURUŞ" : "VURUŞ";
    els.roundCurrent.textContent = String(currentAttempt);
    els.roundTotal.textContent = totalLabel;
    els.roundLabel.textContent = attemptText;
    if (els.roleBanner) els.roleBanner.classList.toggle("role-banner--keeper", !striker);
    if (els.roleBannerIcon) els.roleBannerIcon.innerHTML = materialIcon(striker ? "sports_soccer" : "sports_handball");
    if (els.roleTitle) els.roleTitle.textContent = striker ? "FORVET" : "KALECİ";
    els.pitch.classList.toggle("pitch--keeper", !striker);
    els.tapLabel.textContent = striker ? "VUR" : "KURTAR";
    els.ballHandle.setAttribute("aria-label", striker ? "Vuruş topu" : "Kurtarış topu");
    const hasAim = Boolean(match.userAim);
    els.pitchBadge.classList.toggle("is-miss", Boolean(hasAim && match.userAim.type === "miss"));
    els.pitchBadge.textContent = hasAim
      ? (match.userAim.type === "miss" ? "KALE DIŞI!" : striker ? "HEDEF KİLİTLENDİ" : "DİVE KİLİTLENDİ")
      : (striker ? "VURUŞU GÖNDER" : "KURTAR");
    els.gestureHint.classList.toggle("is-hidden", hasAim || match.userConfirmed);
    els.ballHandle.classList.toggle("is-confirmed", match.userConfirmed);
    els.ballHandle.setAttribute("aria-valuetext", match.userConfirmed ? "Vuruş kilitlendi" : "Vuruş butonunu kullan");

    const youRoleLabel = $(".score-player--you small");
    const opponentRoleLabel = $(".score-player--opponent small");
    if (youRoleLabel) youRoleLabel.textContent = striker ? "FORVET" : "KALECİ";
    if (opponentRoleLabel) opponentRoleLabel.textContent = striker ? "RAKİP · KALECİ" : "RAKİP · FORVET";

    renderDots(els.youAttemptDots, match.attempts[0], true);
    renderDots(els.opponentAttemptDots, match.attempts[1], false);

    if (striker) {
      els.instructionIcon.innerHTML = materialIcon("near_me");
      els.actionTitle.textContent = "Vuruş yeri seç ve vur";
      els.actionSubtitle.textContent = "Hedefe dokun, sonra butona bas.";
    } else {
      els.instructionIcon.innerHTML = materialIcon("sports_handball");
      els.actionTitle.textContent = "Kaleyi seç ve kurtar";
      els.actionSubtitle.textContent = "Kaleci hedefine dokun, sonra Kurtar'a bas.";
    }
    els.roundHint.textContent = striker ? "İki buton da basılı olmalı" : "İki buton da basılı olmalı";
    updatePowerMeter(match.userAim, striker);
    els.confirmButton.innerHTML = match.userConfirmed
      ? `OYUNCU BEKLENİYOR…`
      : striker
        ? `VURUŞU GÖNDER ${materialIcon("arrow_forward")}`
        : `KURTAR ${materialIcon("arrow_forward")}`;
    els.confirmButton.classList.toggle("confirm-button--keeper", !striker);
    els.confirmButton.disabled = match.phase !== "aim" || match.userConfirmed || !match.userAim;
    els.opponentTargetLabel.textContent = striker ? "RAKİP KALECİ HEDEFİ" : "RAKİP VURUŞ HEDEFİ";
    renderOpponentAim();
    els.opponentActionButton.innerHTML = match.botConfirmed
      ? `RAKİP HAZIR ${materialIcon("check")}`
      : striker
        ? `RAKİP KURTAR ${materialIcon("arrow_forward")}`
        : `RAKİP VURUŞ ${materialIcon("arrow_forward")}`;
    els.opponentActionButton.disabled = match.phase !== "aim" || match.botConfirmed || !match.botAim;
    els.opponentStatusAvatar.innerHTML = materialIcon(opponent.avatar);
    els.opponentStatusText.textContent = match.userConfirmed && match.botConfirmed
      ? "İki oyuncu hazır!"
      : match.userConfirmed
        ? "Oyuncu bekleniyor…"
        : match.botConfirmed
          ? "Rakip hazır!"
          : striker
            ? "Rakip kaleyi savunuyor…"
            : "Rakip şutunu hazırlıyor…";
    els.statusPulse.classList.toggle("is-ready", match.botConfirmed);
  }

  function renderDots(container, attempts, isCurrentSide) {
    const total = 5;
    const visibleAttempts = attempts.slice(-total);
    const resultLabels = { goal: "Gol", save: "Kurtarış", miss: "Kaçırma" };
    const usedCount = attempts.length > total ? `${total}+` : `${attempts.length}/${total}`;
    if (isCurrentSide && els.youAttemptCount) els.youAttemptCount.textContent = usedCount;
    if (!isCurrentSide && els.opponentAttemptCount) els.opponentAttemptCount.textContent = usedCount;
    let html = "";
    for (let index = 0; index < total; index += 1) {
      const result = visibleAttempts[index];
      const isCurrent = !result && index === attempts.length;
      const className = `${result ? `round-dot--${result}` : ""}${isCurrent ? " round-dot--current" : ""}`;
      const label = result ? `${index + 1}. ${resultLabels[result] || "Sonuç"}` : `${index + 1}. Kullanılmadı`;
      html += `<span class="round-dot ${className}" role="listitem" aria-label="${label}" title="${label}"></span>`;
    }
    container.innerHTML = html;
    container.setAttribute("aria-label", `${isCurrentSide ? "Sen" : "Rakip"} ${attempts.length} penaltı kullanıldı`);
  }

  function updatePowerMeter(aim, striker = true) {
    const power = aim ? Math.max(0.12, Math.min(1, Number(aim.power) || 0.58)) : 0;
    els.powerLabel.textContent = striker ? "ŞUT GÜCÜ" : "DİVE GÜCÜ";
    els.powerFill.style.width = `${Math.round(power * 100)}%`;
    els.powerValue.textContent = aim ? `%${Math.round(power * 100)}` : "—";
    els.powerMeter.classList.toggle("is-high", power >= 0.72);
  }

  function resetPitchVisuals() {
    els.pitch.classList.remove("is-resolving");
    els.keeper.className = "keeper";
    els.football.classList.remove("is-flight", "is-flight--goal", "is-flight--miss", "is-flight--save");
    els.football.style.removeProperty("--flight-x");
    els.football.style.removeProperty("--flight-y");
    els.football.style.transform = "";
    els.ballHandle.style.transform = "";
    els.ballHandle.classList.remove("is-confirmed");
    els.trajectory.style.opacity = "0.45";
    els.trajectoryPath.setAttribute("d", "M180 365 Q180 250 180 125");
    els.trajectoryEnd.setAttribute("cx", "180");
    els.trajectoryEnd.setAttribute("cy", "125");
    $$("#targetGrid button").forEach((button) => button.classList.remove("is-selected", "is-miss-target"));
    els.gestureHint.classList.remove("is-hidden");
  }

  function getAimPoint(aim) {
    const pitchRect = els.pitch.getBoundingClientRect();
    const goalRect = els.goalFrame.getBoundingClientRect();
    if (!aim) return { x: pitchRect.width / 2, y: pitchRect.height * 0.29 };
    if (aim.type === "miss") {
      return {
        x: Math.max(10, Math.min(pitchRect.width - 10, (aim.x || 0.5) * pitchRect.width)),
        y: Math.max(10, Math.min(pitchRect.height - 10, (aim.y || 0.15) * pitchRect.height)),
      };
    }
    const cell = Math.max(0, Math.min(8, Number(aim.cell) || 0));
    const column = cell % 3;
    const row = Math.floor(cell / 3);
    return {
      x: goalRect.left - pitchRect.left + ((column + 0.5) / 3) * goalRect.width,
      y: goalRect.top - pitchRect.top + ((row + 0.5) / 3) * goalRect.height,
    };
  }

  function updateTrajectory(aim) {
    const point = getAimPoint(aim);
    const pitchRect = els.pitch.getBoundingClientRect();
    const endX = (point.x / pitchRect.width) * 360;
    const endY = (point.y / pitchRect.height) * 430;
    const controlX = 180 + (endX - 180) * 0.12;
    const controlY = 255 + (endY - 255) * 0.12;
    els.trajectoryPath.setAttribute("d", `M 180 365 Q ${controlX} ${controlY} ${endX} ${endY}`);
    els.trajectoryEnd.setAttribute("cx", String(endX));
    els.trajectoryEnd.setAttribute("cy", String(endY));
    els.trajectory.style.opacity = aim ? "1" : "0.45";
  }

  function setAim(aim) {
    const match = state.match;
    if (!match || match.phase !== "aim" || match.userConfirmed) return;
    match.userAim = aim;
    $$("#targetGrid button").forEach((button) => {
      const selected = aim.type === "goal" && Number(button.dataset.cell) === Number(aim.cell);
      button.classList.toggle("is-selected", selected);
      button.classList.remove("is-miss-target");
    });
    els.pitchBadge.classList.toggle("is-miss", aim.type === "miss");
    els.pitchBadge.textContent = aim.type === "miss" ? "KALE DIŞI!" : userIsStriker() ? "HEDEF SEÇİLDİ" : "DİVE NOKTASI";
    els.ballHandle.setAttribute("aria-valuetext", aim.type === "miss" ? "Kale dışı hedef" : `Hedef ${Number(aim.cell) + 1}`);
    els.gestureHint.classList.add("is-hidden");
    updateTrajectory(aim);
    renderMatch();
    playTone(aim.type === "miss" ? 260 : 480, 0.045, "triangle");
  }

  function renderOpponentAim() {
    const match = state.match;
    if (!match || !els.opponentTargetGrid) return;
    $$("button[data-cell]", els.opponentTargetGrid).forEach((button) => {
      const selected = match.botAim?.type === "goal" && Number(button.dataset.cell) === Number(match.botAim.cell);
      button.classList.toggle("is-selected", selected);
      button.disabled = match.phase !== "aim" || match.botConfirmed;
    });
  }

  function setOpponentAim(cell) {
    const match = state.match;
    if (!match || match.phase !== "aim" || match.botConfirmed) return;
    match.botAim = { type: "goal", cell: Number(cell) };
    renderMatch();
    els.opponentActionButton.classList.add("has-selection");
    playTone(390, 0.045, "triangle");
  }

  function confirmOpponentAction() {
    const match = state.match;
    if (!match || match.phase !== "aim" || match.botConfirmed) return;
    if (!match.botAim) {
      showToast("Rakip önce bir hedef seçmeli.", "orange");
      return;
    }
    match.botConfirmed = true;
    els.opponentStatusText.textContent = "İki oyuncu hazır!";
    els.statusPulse.classList.add("is-ready");
    els.opponentActionButton.textContent = "RAKİP HAZIR";
    els.opponentActionButton.disabled = true;
    playTone(640, 0.08, "triangle");
    renderMatch();
    maybeStartCountdown();
  }

  function confirmUserAction() {
    const match = state.match;
    if (!match || match.phase !== "aim" || match.userConfirmed) return;
    if (!match.userAim) {
      showToast("Önce hedef alanına dokun.", "orange");
      return;
    }
    match.userConfirmed = true;
    els.ballHandle.classList.add("is-confirmed");
    els.gestureHint.classList.add("is-hidden");
    els.opponentStatusText.textContent = "Oyuncu bekleniyor…";
    playTone(720, 0.1, "square");
    renderMatch();
    maybeStartCountdown();
  }

  function maybeStartCountdown() {
    const match = state.match;
    if (!match || match.phase !== "aim" || !match.userConfirmed || !match.botConfirmed) return;
    match.phase = "countdown";
    renderMatch();
    els.countdownOverlay.hidden = false;
    const sequence = [
      { number: "3", word: "HAZIR OL", duration: 620 },
      { number: "2", word: "HAZIR OL", duration: 520 },
      { number: "1", word: "HAZIR OL", duration: 520 },
      { number: "VUR!", word: "ŞUT!", duration: 580 },
    ];
    sequence.forEach((item, index) => {
      const timer = window.setTimeout(() => {
        els.countdownNumber.textContent = item.number;
        els.countdownWord.textContent = item.word;
        els.countdownNumber.classList.remove("countdown-number--pulse");
        void els.countdownNumber.offsetWidth;
        els.countdownNumber.classList.add("countdown-number--pulse");
        playTone(index === 3 ? 950 : 560 + index * 70, index === 3 ? 0.13 : 0.06, "square");
        if (index === sequence.length - 1) {
          els.countdownOverlay.hidden = true;
          resolveRound();
        }
      }, index === 0 ? 80 : sequence.slice(0, index).reduce((sum, entry) => sum + entry.duration, 0));
      countdownTimers.push(timer);
    });
  }

  function resolveRound() {
    const match = state.match;
    if (!match) return;
    match.phase = "resolving";
    const shot = userIsStriker() ? match.userAim : match.botAim;
    const keeperAim = userIsStriker() ? match.botAim : match.userAim;
    let result = "goal";
    if (!shot || shot.type === "miss") result = "miss";
    else if (keeperAim?.type !== "miss" && Number(shot.cell) === Number(keeperAim.cell)) result = "save";

    match.lastResult = { result, shot, keeperAim };
    animateShot(shot, keeperAim, result);
    window.setTimeout(() => {
      if (!state.match || state.match !== match) return;
      const strikerIndex = userIsStriker() ? 0 : 1;
      const goalkeeperIndex = strikerIndex === 0 ? 1 : 0;
      match.attempts[strikerIndex].push(result);
      if (result === "goal") match.score[strikerIndex] += 1;
      if (result === "save") match.saves[goalkeeperIndex] += 1;
      match.phase = "result";
      renderMatch();
      showScoreFeedback(result);
      showShotResult(result, strikerIndex, goalkeeperIndex);
    }, 620);
  }

  function animateShot(shot, keeperAim, result) {
    const match = state.match;
    if (!match) return;
    els.pitch.classList.add("is-resolving");
    els.opponentStatusText.textContent = result === "goal" ? "Top ağlara gidiyor…" : result === "save" ? "Kalecinin eli üstünde!" : "Şut dışarı gidiyor…";
    const point = getAimPoint(shot);
    const pitchRect = els.pitch.getBoundingClientRect();
    const ballRect = els.ballHandle.getBoundingClientRect();
    const startX = ballRect.left + ballRect.width / 2 - pitchRect.left;
    const startY = ballRect.top + ballRect.height / 2 - pitchRect.top;
    const dx = point.x - startX;
    const dy = point.y - startY;
    els.football.style.setProperty("--flight-x", `${dx}px`);
    els.football.style.setProperty("--flight-y", `${dy}px`);
    els.football.classList.add("is-flight", `is-flight--${result}`);
    setKeeperAnimation(keeperAim);
    playTone(result === "goal" ? 880 : result === "save" ? 190 : 300, 0.13, result === "goal" ? "triangle" : "sawtooth");
  }

  function setKeeperAnimation(aim) {
    els.keeper.className = "keeper";
    if (!aim || aim.type === "miss") return;
    const column = Number(aim.cell) % 3;
    const row = Math.floor(Number(aim.cell) / 3);
    if (column === 0 && row === 0) els.keeper.classList.add("keeper--dive-high-left");
    else if (column === 2 && row === 0) els.keeper.classList.add("keeper--dive-high-right");
    else if (column === 0 && row === 2) els.keeper.classList.add("keeper--dive-low-left");
    else if (column === 2 && row === 2) els.keeper.classList.add("keeper--dive-low-right");
    else if (column === 0) els.keeper.classList.add("keeper--dive-left");
    else if (column === 2) els.keeper.classList.add("keeper--dive-right");
    else if (row === 0) els.keeper.classList.add("keeper--dive-high");
    else if (row === 2) els.keeper.classList.add("keeper--dive-low");
  }

  function showShotResult(result, strikerIndex, goalkeeperIndex) {
    const match = state.match;
    const userStriker = strikerIndex === 0;
    let title = "GOL!";
    let message = "Harika vuruş!";
    let icon = "sports_soccer";
    if (result === "save") {
      title = userStriker ? "KURTARDI!" : "KURTARDIN!";
      message = userStriker ? "Rakip şutu kurtardı." : "Harika refleks! Kaleyi savundun.";
      icon = "sports_handball";
    } else if (result === "goal" && !userStriker) {
      title = "GOL YEDİM!";
      message = "Rakip golü ağlara götürdü.";
      icon = "sports_soccer";
    } else if (result === "miss") {
      title = userStriker ? "KAÇIRDI!" : "RAKİP KAÇIRDI!";
      message = userStriker ? "Şut dışarı gitti." : "Rakip şutu dışarı gitti.";
      icon = "near_me";
    }
    const regularComplete = !match.suddenDeath && match.round >= 10;
    const suddenPairComplete = match.suddenDeath && match.round % 2 === 0;
    const tied = match.score[0] === match.score[1];
    let action = "next-round";
    if ((regularComplete || suddenPairComplete) && !tied) action = "match-finish";
    else if (regularComplete && tied) action = "start-sudden";
    else if (suddenPairComplete && tied) action = "next-sudden";

    const actionLabels = {
      "next-round": "SONRAKİ VURUŞ",
      "start-sudden": "ALTIN PENALTI",
      "next-sudden": "SONRAKİ ALTIN VURUŞ",
      "match-finish": "SONUÇLARI GÖR",
    };
    state.resultAction = action;
    els.resultCard.className = `result-card result-card--${result}${result === "goal" && !userStriker ? " result-card--conceded" : ""}`;
    els.resultIcon.innerHTML = materialIcon(icon);
    els.resultEyebrow.textContent = match.suddenDeath ? "ALTIN PENALTI" : "VURUŞ SONU";
    els.resultTitle.textContent = title;
    els.resultMessage.textContent = message;
    els.resultScore.textContent = `SEN ${match.score[0]} – ${match.score[1]} RAKİP`;
    els.resultStats.innerHTML = resultStatsMarkup(match);
    els.resultPrimaryButton.innerHTML = `${actionLabels[action]} ${materialIcon("arrow_forward")}`;
    els.resultSecondaryButton.textContent = "LOBİYE ÇIK";
    renderConfetti(result === "goal");
    els.resultOverlay.hidden = false;
    playTone(result === "goal" ? 1050 : result === "save" ? 150 : 220, 0.18, result === "goal" ? "triangle" : "square");
    window.setTimeout(() => {
      if (result === "goal" && !els.resultOverlay.hidden) playTone(1320, 0.12, "sine");
    }, 130);
  }

  function resultStatsMarkup(match) {
    const userGoals = match.score[0];
    const opponentGoals = match.score[1];
    return `
      <div class="result-stat"><strong>${userGoals}</strong><span>GOL</span></div>
      <div class="result-stat"><strong>${match.saves[0]}</strong><span>KURTARIŞ</span></div>
      <div class="result-stat"><strong>${opponentGoals}</strong><span>RAKİP GOLÜ</span></div>
    `;
  }

  function renderConfetti(enabled) {
    els.resultConfetti.innerHTML = enabled
      ? Array.from({ length: 22 }, (_, index) => `<span class="confetti-piece" style="left:${5 + (index * 17) % 90}%;animation-delay:${(index % 7) * 80}ms;transform:rotate(${index * 23}deg)"></span>`).join("")
      : "";
  }

  function handleResultPrimary() {
    const match = state.match;
    if (!match) return;
    const action = state.resultAction;
    els.resultOverlay.hidden = true;
    if (action === "start-sudden") {
      match.suddenDeath = true;
      match.round = 11;
      beginRound();
      return;
    }
    if (action === "next-sudden" || action === "next-round") {
      match.round += 1;
      beginRound();
      return;
    }
    if (action === "match-finish") {
      endMatch();
      return;
    }
    if (action === "replay") {
      startMatch(match.players[0], match.players[1], { tournamentIndex: match.tournamentIndex });
      return;
    }
    if (action === "tournament") {
      showTournament();
    }
  }

  function handleResultSecondary() {
    els.resultOverlay.hidden = true;
    exitToLobby();
  }

  function endMatch() {
    const match = state.match;
    if (!match) return;
    clearMatchTimers();
    match.phase = "finished";
    resetPitchVisuals();
    if (match.tournamentIndex !== null && !match.tournamentRecorded) {
      recordTournamentMatch(match);
    }
    const userWon = match.score[0] > match.score[1];
    const tied = match.score[0] === match.score[1];
    const isTournament = match.tournamentIndex !== null;
    state.resultAction = isTournament ? "tournament" : "replay";
    els.resultCard.className = "result-card";
    els.resultIcon.innerHTML = materialIcon(userWon ? "emoji_events" : tied ? "handshake" : "sports_soccer");
    els.resultEyebrow.textContent = isTournament ? "MAÇ TAMAMLANDI" : tied ? "MAÇ SONU" : userWon ? "ZAFER" : "MAÇ SONUCU";
    els.resultTitle.textContent = userWon ? "KAZANDIN!" : tied ? "DÜELLO BERABERE!" : "KAYBETTİN";
    els.resultMessage.textContent = isTournament ? "Puan tablosundaki yerini gör." : userWon ? "Rakibini yendin. Bir maç daha?" : "Bu kez olmadı. Bir maç daha deneyelim.";
    els.resultScore.textContent = `SEN ${match.score[0]} – ${match.score[1]} RAKİP`;
    els.resultStats.innerHTML = resultStatsMarkup(match);
    els.resultPrimaryButton.innerHTML = `${isTournament ? "TURNUVAYA DÖN" : "TEKRAR OYNA"} ${materialIcon("arrow_forward")}`;
    els.resultSecondaryButton.textContent = "LOBİYE DÖN";
    renderConfetti(userWon);
    els.resultOverlay.hidden = false;
    playTone(userWon ? 1100 : 240, 0.18, userWon ? "triangle" : "sine");
  }

  function exitToLobby() {
    clearMatchTimers();
    hideOverlays();
    state.match = null;
    state.tournament = null;
    state.room = false;
    state.roomCode = "";
    state.players = [];
    setView("lobby");
    renderLobby();
  }

  // Tournament lifecycle
  function startTournament() {
    const source = state.players.length ? state.players : [playerYou(), createBot(BOT_POOL.tournament, 0), createBot(BOT_POOL.tournament, 1)];
    const players = source.map(clonePlayer);
    players[0] = { ...players[0], id: "you", name: "SEN", avatar: "sports_soccer", ready: true, bot: false };
    state.tournament = {
      players,
      currentIndex: 0,
      matches: [
        { id: "m1", a: "you", b: "bot-b", status: "next", score: null },
        { id: "m2", a: "bot-b", b: "bot-c", status: "pending", score: null },
        { id: "m3", a: "you", b: "bot-c", status: "pending", score: null },
      ],
    };
    renderTournament();
    startTournamentMatch(0);
  }

  function tournamentMatchPlayers(match) {
    return [getTournamentPlayer(match.a), getTournamentPlayer(match.b)];
  }

  function getTournamentPlayer(id) {
    return state.tournament?.players.find((player) => player.id === id);
  }

  function startTournamentMatch(index) {
    const tournament = state.tournament;
    if (!tournament || !tournament.matches[index]) return;
    const match = tournament.matches[index];
    if (match.status === "done") return;
    match.status = "live";
    tournament.currentIndex = index;
    const [first, second] = tournamentMatchPlayers(match);
    const hasUser = match.a === "you" || match.b === "you";
    if (!hasUser) {
      simulateTournamentMatch(index);
      renderTournament();
      showToast("Rakiplerin maçı tamamlandı.", "yellow");
      return;
    }
    startMatch(first.id === "you" ? first : second, first.id === "you" ? second : first, { tournamentIndex: index });
  }

  function recordTournamentMatch(match) {
    const tournament = state.tournament;
    if (!tournament || match.tournamentRecorded) return;
    const tournamentMatch = tournament.matches[match.tournamentIndex];
    if (!tournamentMatch || tournamentMatch.status === "done") return;
    const first = getTournamentPlayer(tournamentMatch.a);
    const second = getTournamentPlayer(tournamentMatch.b);
    const score = [...match.score];
    tournamentMatch.score = score;
    tournamentMatch.status = "done";
    first.goals += score[0];
    second.goals += score[1];
    if (score[0] > score[1]) {
      first.wins += 1;
      second.losses += 1;
    } else if (score[1] > score[0]) {
      second.wins += 1;
      first.losses += 1;
    }
    match.tournamentRecorded = true;
  }

  function simulateTournamentMatch(index) {
    const tournament = state.tournament;
    if (!tournament) return;
    const match = tournament.matches[index];
    if (!match || match.status === "done") return;
    const score = index === 1 ? [2, 1] : [1, 2];
    const fakeMatch = {
      score,
      tournamentIndex: index,
      tournamentRecorded: false,
    };
    recordTournamentMatch(fakeMatch);
  }

  function getSortedTournamentPlayers() {
    return [...(state.tournament?.players || [])].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.goals !== a.goals) return b.goals - a.goals;
      return a.losses - b.losses;
    });
  }

  function renderTournament() {
    const tournament = state.tournament;
    if (!tournament) return;
    const doneCount = tournament.matches.filter((match) => match.status === "done").length;
    const nextMatchIndex = tournament.matches.findIndex((match) => match.status !== "done");
    const nextMatch = nextMatchIndex >= 0 ? tournament.matches[nextMatchIndex] : null;
    const players = getSortedTournamentPlayers();
    const allDone = doneCount === tournament.matches.length;

    els.tournamentProgress.innerHTML = tournament.matches.map((match, index) => {
      const status = match.status === "done" ? "done" : index === nextMatchIndex ? "active" : "pending";
      const label = match.status === "done" ? "✓" : String(index + 1);
      return `<div class="progress-step progress-step--${status}"><span>${label}</span><small>MAÇ ${index + 1}</small></div>`;
    }).join("");

    els.tournamentMatches.innerHTML = tournament.matches.map((match, index) => {
      const [first, second] = tournamentMatchPlayers(match);
      const isNext = index === nextMatchIndex;
      const isDone = match.status === "done";
      let result = "—";
      let resultLabel = isNext ? "SIRADAKİ" : "BEKLEMEDE";
      if (isDone) {
        result = `${match.score[0]} – ${match.score[1]}`;
        resultLabel = match.score[0] > match.score[1] ? `${first.name} KAZANDI` : match.score[1] > match.score[0] ? `${second.name} KAZANDI` : "BERABERE";
      }
      return `
        <div class="match-card ${isNext ? "match-card--next" : ""} ${isDone ? "match-card--done" : ""}">
          <div class="match-card-top"><span>MAÇ ${index + 1}</span><span class="match-state ${isDone ? "match-state--done" : ""}">${isDone ? "✓ TAMAMLANDI" : isNext ? "● HAZIR" : "○ BEKLEMEDE"}</span></div>
          <div class="match-card-player"><div class="match-card-avatar">${materialIcon(first.avatar)}</div><div><strong>${escapeHTML(first.name)}</strong><small>${first.wins} G · ${first.losses} B</small></div></div>
          <div class="match-card-result"><strong>${result}</strong><span class="${!isDone ? "match-state--pending" : ""}">${escapeHTML(resultLabel)}</span></div>
          <div class="match-card-player match-card-player--right"><div><strong>${escapeHTML(second.name)}</strong><small>${second.wins} G · ${second.losses} B</small></div><div class="match-card-avatar">${materialIcon(second.avatar)}</div></div>
          <div class="match-card-bottom"><span>${isDone ? "MAÇ TAMAMLANDI" : isNext ? "SIRADAKİ MAÇ" : "TURNUVA SIRA BEKLEMEDE"}</span><span>${isDone ? "✓" : isNext ? "→" : "·"}</span></div>
        </div>
      `;
    }).join("");

    els.leaderboardCard.innerHTML = `
      <div class="leaderboard-head"><div><span class="eyebrow">PUAN TABLOSU</span><h2>Sıralama</h2></div><span>${doneCount}/3 MAÇ</span></div>
      <div class="leaderboard-table-head"><span>#</span><span>OYUNCU</span><span>G</span><span>B</span><span>AG</span></div>
      ${players.map((player, index) => {
        const rankClass = index === 0 ? "rank-number--gold" : index === 1 ? "rank-number--silver" : index === 2 ? "rank-number--bronze" : "";
        return `<div class="leaderboard-row ${player.id === "you" ? "leaderboard-row--you" : ""}"><span class="rank-number ${rankClass}">${index + 1}</span><div class="leaderboard-player"><span class="leaderboard-avatar">${materialIcon(player.avatar)}</span><span>${escapeHTML(player.name)}${player.id === "you" ? " · SEN" : ""}</span></div><span>${player.wins}</span><span>${player.losses}</span><span class="goals-cell">${player.goals}</span></div>`;
      }).join("")}
    `;

    if (allDone) {
      const last = players[players.length - 1];
      els.punishmentCard.hidden = false;
      els.punishmentCard.innerHTML = `
        <div class="punishment-top"><div class="punishment-icon material-symbols-rounded">shopping_cart</div><div><span class="eyebrow">ARKADAŞLIK CEZASI</span><h2>PAZARA ÇIKIYOR!</h2><p>Bugün pazar alışverişi <b>${escapeHTML(last.name)}</b> sende.</p></div></div>
        <div class="punishment-bottom"><span>Gerçek para, bahis veya ödül yok.</span><strong>Sadece arkadaşlık</strong></div>
      `;
    } else {
      els.punishmentCard.hidden = true;
      els.punishmentCard.innerHTML = "";
    }

    els.tournamentNextButton.disabled = false;
    els.tournamentNextButton.innerHTML = allDone
      ? `TURNUVAYI YENİDEN BAŞLAT ${materialIcon("refresh")}`
      : nextMatch && (nextMatch.a === "you" || nextMatch.b === "you")
        ? `SIRADAKİ MAÇI BAŞLAT ${materialIcon("arrow_forward")}`
        : `RAKİPLERİN MAÇINI TAMAMLA ${materialIcon("arrow_forward")}`;
    setView("tournament");
  }

  function showTournament() {
    if (!state.tournament) {
      setView("lobby");
      renderLobby();
      return;
    }
    renderTournament();
  }

  function tournamentNext() {
    if (!state.tournament) return;
    const nextIndex = state.tournament.matches.findIndex((match) => match.status !== "done");
    if (nextIndex === -1) {
      startTournament();
      return;
    }
    const nextMatch = state.tournament.matches[nextIndex];
    if (nextMatch.a === "you" || nextMatch.b === "you") {
      startTournamentMatch(nextIndex);
    } else {
      simulateTournamentMatch(nextIndex);
      renderTournament();
      showToast("B otomatik maçı tamamlandı. Sıra sende!", "yellow");
    }
  }

  function leaveTournament() {
    state.match = null;
    state.tournament = null;
    state.room = false;
    state.players = [];
    state.roomCode = "";
    clearMatchTimers();
    hideOverlays();
    setView("lobby");
    renderLobby();
  }

  // Rules
  function openRules() {
    els.rulesSheet.hidden = false;
  }

  function closeRules() {
    els.rulesSheet.hidden = true;
  }

  // Events
  $$(".mode-button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  els.createRoomButton.addEventListener("click", () => setupDemoRoom());
  els.joinRoomButton.addEventListener("click", () => {
    els.joinPanel.hidden = !els.joinPanel.hidden;
    if (!els.joinPanel.hidden) els.roomCodeInput.focus();
  });
  els.joinConfirmButton.addEventListener("click", joinRoom);
  els.roomCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") joinRoom();
  });
  els.copyCodeButton.addEventListener("click", copyRoomCode);
  els.readyButton.addEventListener("click", toggleReady);
  els.startButton.addEventListener("click", startRoom);
  els.quickDemoButton.addEventListener("click", quickDemo);
  els.leaveMatchButton.addEventListener("click", () => {
    if (state.match?.tournamentIndex !== null && state.match?.tournamentIndex !== undefined) {
      state.match = null;
      clearMatchTimers();
      hideOverlays();
      showTournament();
    } else {
      exitToLobby();
    }
  });
  els.leaveTournamentButton.addEventListener("click", leaveTournament);
  els.tournamentNextButton.addEventListener("click", tournamentNext);
  els.confirmButton.addEventListener("click", confirmUserAction);
  els.opponentActionButton.addEventListener("click", confirmOpponentAction);
  els.targetGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cell]");
    if (button) setAim({ type: "goal", cell: Number(button.dataset.cell) });
  });
  els.opponentTargetGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cell]");
    if (button) setOpponentAim(Number(button.dataset.cell));
  });
  els.resultPrimaryButton.addEventListener("click", handleResultPrimary);
  els.resultSecondaryButton.addEventListener("click", handleResultSecondary);
  els.rulesButton.addEventListener("click", openRules);
  els.closeRulesButton.addEventListener("click", closeRules);
  els.rulesBackdrop.addEventListener("click", closeRules);
  els.brandHome.addEventListener("click", (event) => {
    event.preventDefault();
    if (state.tournament && !state.match) showTournament();
    else exitToLobby();
  });
  els.soundToggle.addEventListener("click", () => {
    state.sound = !state.sound;
    els.soundToggle.setAttribute("aria-pressed", String(state.sound));
    if (state.sound) playTone(600, 0.07);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!els.rulesSheet.hidden) closeRules();
      else if (!els.resultOverlay.hidden) handleResultSecondary();
    }
  });

  updateModeButtons();
  renderLobby();
})();
