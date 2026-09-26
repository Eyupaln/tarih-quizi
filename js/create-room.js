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
    // The tournament mode is not built yet, so its button stays inert: it
    // never activates and never creates a room.
    if (mode === "tournament") return;
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
    modeButtons.forEach((button) => {
      if (button.dataset.mode === "tournament") {
        button.classList.add("mode-button--locked");
        button.setAttribute("aria-disabled", "true");
        return;
      }
      button.addEventListener("click", () => selectMode(button.dataset.mode));
    });
    selectMode(selectedMode);
    submitButton?.addEventListener("click", createRoom);
    await shared.playLoading(shared.getInitialLoadingDuration());
  }

  init();
})();
