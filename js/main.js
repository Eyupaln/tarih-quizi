(() => {
  "use strict";

  const shared = window.PenaltiShared;
  const nicknameScreen = document.querySelector("#nicknameScreen");
  const mainMenu = document.querySelector("#mainMenu");
  const nicknameForm = document.querySelector("#nicknameForm");
  const nicknameInput = document.querySelector("#nicknameInput");
  const nicknameError = document.querySelector("#nicknameError");
  const nicknameSubmit = document.querySelector("#nicknameSubmit");

  function showNickname() {
    shared.stopMenuMusic();
    if (nicknameScreen) nicknameScreen.hidden = false;
    if (mainMenu) mainMenu.hidden = true;
    window.setTimeout(() => nicknameInput?.focus(), 80);
  }

  function showMainMenu() {
    if (nicknameScreen) nicknameScreen.hidden = true;
    if (mainMenu) mainMenu.hidden = false;
    shared.startMenuMusic();
  }

  async function init() {
    shared.bindSoundToggle();

    document.querySelector("#createRoomButton")?.addEventListener("click", () => shared.goTo("create-room.html"));
    document.querySelector("#joinRoomButton")?.addEventListener("click", () => shared.goTo("join-room.html"));

    nicknameForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = shared.setPlayerName(nicknameInput?.value || "");
      if (!result.valid) {
        if (nicknameError) nicknameError.textContent = result.message;
        nicknameInput?.setAttribute("aria-invalid", "true");
        nicknameInput?.focus();
        return;
      }

      if (nicknameError) nicknameError.textContent = "";
      nicknameInput?.removeAttribute("aria-invalid");
      if (nicknameSubmit) nicknameSubmit.disabled = true;
      await shared.playLoading(450);
      showMainMenu();
      if (nicknameSubmit) nicknameSubmit.disabled = false;
    });

    nicknameInput?.addEventListener("input", () => {
      if (nicknameError) nicknameError.textContent = "";
      nicknameInput.removeAttribute("aria-invalid");
    });

    await shared.playLoading(shared.getInitialLoadingDuration());
    if (shared.getPlayerName()) showMainMenu();
    else showNickname();
  }

  init();
})();
