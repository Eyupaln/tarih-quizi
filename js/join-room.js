(() => {
  "use strict";

  const shared = window.PenaltiShared;
  const form = document.querySelector("#joinRoomForm");
  const codeInput = document.querySelector("#joinRoomCode");
  const errorLabel = document.querySelector("#joinRoomError");
  const submitButton = document.querySelector("#joinRoomSubmit");

  function showError(message) {
    if (errorLabel) errorLabel.textContent = message;
    if (submitButton) submitButton.disabled = false;
  }

  async function joinRoom(event) {
    event.preventDefault();
    if (errorLabel) errorLabel.textContent = "";
    codeInput?.removeAttribute("aria-invalid");

    const code = shared.normalizeRoomCode(codeInput?.value || "");
    if (code.length !== 6) {
      if (errorLabel) errorLabel.textContent = "Geçerli bir 6 haneli oda kodu gir.";
      codeInput?.setAttribute("aria-invalid", "true");
      codeInput?.focus();
      return;
    }

    if (submitButton) submitButton.disabled = true;
    shared.clearRoomState();

    try {
      const response = await shared.emitWithAck("room:join", {
        code,
        nickname: shared.getPlayerName(),
        playerToken: shared.getPlayerToken(),
      });
      if (!response?.ok || !response.room) {
        throw new Error(response?.error?.message || "Odaya katılınamadı.");
      }
      shared.setRoomSnapshot(response.room, response.code);
      await shared.playLoading(350);
      shared.goTo("lobby.html");
    } catch (error) {
      showError(error.message || "Odaya katılınamadı.");
    }
  }

  async function init() {
    if (!shared.requirePlayerName()) return;
    shared.bindSoundToggle();

    codeInput?.addEventListener("input", () => {
      codeInput.value = shared.normalizeRoomCode(codeInput.value);
      if (errorLabel) errorLabel.textContent = "";
    });

    const offError = shared.onSocket("room:error", (error) => {
      if (error?.message) showError(error.message);
    });

    form?.addEventListener("submit", joinRoom);
    await shared.playLoading(shared.getInitialLoadingDuration());
    return offError;
  }

  init();
})();
