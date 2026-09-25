(() => {
  "use strict";

  const shared = window.PenaltiShared;
  const form = document.querySelector("#joinRoomForm");
  const codeInput = document.querySelector("#joinRoomCode");
  const errorLabel = document.querySelector("#joinRoomError");
  const submitButton = document.querySelector("#joinRoomSubmit");

  async function init() {
    if (!shared.requirePlayerName()) return;
    shared.bindSoundToggle();

    codeInput?.addEventListener("input", () => {
      codeInput.value = shared.normalizeRoomCode(codeInput.value);
      if (errorLabel) errorLabel.textContent = "";
    });

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      shared.clearRoomState();

      const code = shared.normalizeRoomCode(codeInput?.value || "");
      if (code.length !== 4) {
        if (errorLabel) errorLabel.textContent = "Geçerli bir 4 haneli oda kodu gir.";
        codeInput?.setAttribute("aria-invalid", "true");
        codeInput?.focus();
        return;
      }

      if (submitButton) submitButton.disabled = true;
      codeInput?.removeAttribute("aria-invalid");
      if (errorLabel) {
        errorLabel.textContent = "Oda yok. Bu kodla eşleşen bir oda bulunamadı.";
      }

      window.setTimeout(() => shared.goTo("index.html"), 1200);
    });

    await shared.playLoading(shared.getInitialLoadingDuration());
  }

  init();
})();
