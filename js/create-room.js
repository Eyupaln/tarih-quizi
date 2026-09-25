(() => {
  "use strict";

  const shared = window.PenaltiShared;
  const submitButton = document.querySelector("#createRoomSubmit");
  const playerNameLabel = document.querySelector("#createRoomPlayerName");
  const errorLabel = document.querySelector("#createRoomError");

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
    submitButton?.addEventListener("click", createRoom);
    await shared.playLoading(shared.getInitialLoadingDuration());
  }

  init();
})();
