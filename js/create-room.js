(() => {
  "use strict";

  const shared = window.PenaltiShared;
  const submitButton = document.querySelector("#createRoomSubmit");
  const playerNameLabel = document.querySelector("#createRoomPlayerName");
  const playerCountLabel = document.querySelector("#createRoomPlayerCount");
  const errorLabel = document.querySelector("#createRoomError");
  const modeButtons = [...document.querySelectorAll("#createRoomModeSwitch [data-mode]")];
  let selectedMode = "duo";

  function selectMode(mode) {
    if (mode === "tournament") {
      // The realtime server only fills rooms to two players, so a three player
      // tournament would silently play as a normal duel. Say so instead of
      // creating a room that does not do what it promises.
      if (errorLabel) {
        errorLabel.textContent = "3 kişilik turnuva yakında. Şimdilik 1v1 düello oynayabilirsin.";
      }
      return;
    }
    selectedMode = "duo";
    if (errorLabel) errorLabel.textContent = "";
    modeButtons.forEach((button) => {
      const isActive = button.dataset.mode === selectedMode;
      button.classList.toggle("mode-button--active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    if (playerCountLabel) playerCountLabel.textContent = "1/2";
  }

  async function createRoom() {
    if (submitButton) submitButton.disabled = true;
    if (errorLabel) errorLabel.textContent = "";

    try {
      const response = await shared.emitWithAck("room:create", {
        nickname: shared.getPlayerName(),
        playerToken: shared.getPlayerToken(),
      });
      if (!response?.ok || !response.room) throw new Error(response?.error?.message || "Oda oluşturulamadı.");
      shared.setRoomSnapshot(response.room, response.code);
      await shared.playLoading(350);
      shared.goTo("lobby.html");
    } catch (error) {
      if (errorLabel) errorLabel.textContent = error.message || "Oda oluşturulamadı.";
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function init() {
    if (!shared.requirePlayerName()) return;
    shared.bindSoundToggle();
    if (playerNameLabel) playerNameLabel.textContent = shared.getPlayerName();
    modeButtons.forEach((button) => button.addEventListener("click", () => selectMode(button.dataset.mode)));
    selectMode(selectedMode);
    submitButton?.addEventListener("click", createRoom);
    await shared.playLoading(shared.getInitialLoadingDuration());
  }

  init();
})();
