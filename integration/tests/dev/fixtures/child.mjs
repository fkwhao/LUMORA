const options = parseArguments(process.argv.slice(2));
const keepAliveTimer = options.stayAlive
  ? setInterval(() => {}, 60_000)
  : undefined;

process.on("SIGTERM", () => {
  clearInterval(keepAliveTimer);
  process.exit(0);
});

setTimeout(() => {
  process.stdout.write("fixture ");
  setTimeout(() => {
    process.stdout.write("ready\n");
    if (!options.stayAlive) {
      process.exit(options.exitCode);
    }
  }, 15);
}, options.delayMs);

function parseArguments(argumentsList) {
  const options = {
    delayMs: 0,
    exitCode: 0,
    stayAlive: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--stay-alive") {
      options.stayAlive = true;
    } else if (argument === "--delay-ms") {
      options.delayMs = Number(argumentsList[index += 1]);
    } else if (argument === "--exit-code") {
      options.exitCode = Number(argumentsList[index += 1]);
    }
  }

  return options;
}
