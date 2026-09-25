(() => {
  "use strict";

  const shared = window.PenaltiShared;
  const launch = shared.getGameLaunch() || shared.getRoomState();
  if (!launch?.code) {
    window.location.replace("index.html");
    return;
  }

  if (!window.PenaltiGame?.launchFromRoom) {
    window.location.replace("lobby.html");
    return;
  }

  window.PenaltiGame.launchFromRoom(launch.code, launch.mode || "duo");
})();
