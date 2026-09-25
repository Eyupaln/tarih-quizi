const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requestedPort = String(process.env.PORT || "3000");
const port = /^\d+$/.test(requestedPort) ? requestedPort : "3000";
const isWindows = process.platform === "win32";
const command = isWindows ? process.env.ComSpec || "cmd.exe" : "npx";
const args = isWindows
  ? ["/d", "/s", "/c", `npx serve -s . -l ${port}`]
  : ["serve", "-s", ".", "-l", port];
const server = spawn(command, args, {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});

server.on("error", (error) => {
  console.error("Statik sunucu başlatılamadı:", error);
  process.exit(1);
});

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
});
