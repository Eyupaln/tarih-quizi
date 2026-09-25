(() => {
  "use strict";

  const shared = window.PenaltiShared;
  const submitButton = document.querySelector("#createRoomSubmit");
  const playerNameLabel = document.querySelector("#createRoomPlayerName");
  const playerCountLabel = document.querySelector("#createRoomPlayerCount");
  const roomCopy = document.querySelector("#createRoomCopy");
  const modeButtons = [...document.querySelectorAll("#createRoomModeSwitch [data-mode]")];
  let selectedMode = "duo";

  function selectMode(mode) {
    selectedMode = mode === "tournament" ? "tournament" : "duo";
    const total = selectedMode === "tournament" ? 3 : 2;

    modeButtons.forEach((button) => {
      const isActive = button.dataset.mode === selectedMode;
      button.classList.toggle("mode-button--active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    if (playerCountLabel) playerCountLabel.textContent = `1/${total}`;
    if (roomCopy) {
      roomCopy.textContent = selectedMode === "tournament"
        ? "Üç oyunculu turnuva için 4 haneli oda kodu otomatik oluşturulacak."
        : "Rakibinle paylaşacağın 4 haneli oda kodu otomatik oluşturulacak.";
    }
  }

  async function init() {
    if (!shared.requirePlayerName()) return;
    shared.bindSoundToggle();
    if (playerNameLabel) playerNameLabel.textContent = shared.getPlayerName();

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => selectMode(button.dataset.mode));
    });
    selectMode(selectedMode);

    submitButton?.addEventListener("click", async () => {
      if (submitButton) submitButton.disabled = true;
      const playerName = shared.getPlayerName();
      const roomCode = shared.randomRoomCode();
      const playerId = shared.getPlayerId();
      shared.setRoomState({
        code: roomCode,
        mode: selectedMode,
        hostId: playerId,
        hostName: playerName,
        status: "waiting",
        createdAt: Date.now(),
        isDemo: true,
        players: [{ id: playerId, name: playerName, ready: false, bot: false }],
      });
      await shared.playLoading(450);
      shared.goTo("lobby.html");
    });

    await shared.playLoading(shared.getInitialLoadingDuration());
  }

  init();
})();
