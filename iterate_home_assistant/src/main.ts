import { ZodError } from "zod";
import { runBridgeForever } from "./bridge.js";
import { loadConfig } from "./config.js";
import { BridgeJournal } from "./journal.js";
import { log } from "./log.js";

const bridgeVersion = process.env.BRIDGE_VERSION ?? "0.1.0";
const shutdown = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    log.info("shutdown requested", { signal });
    shutdown.abort(new Error(`received ${signal}`));
  });
}

try {
  const config = await loadConfig();
  const supervisorToken = process.env.SUPERVISOR_TOKEN;
  if (!supervisorToken) throw new Error("SUPERVISOR_TOKEN is missing");
  const journal = await BridgeJournal.open();

  log.info("starting Iterate Home Assistant", {
    bridgeVersion,
    itxPath: `itx.${config.itxPath.join(".")}`,
    projectSlug: config.projectSlug,
    streamPath: config.streamPath,
  });

  await runBridgeForever({
    bridgeVersion,
    config,
    journal,
    signal: shutdown.signal,
    supervisorToken,
  });
  log.info("Iterate Home Assistant stopped");
} catch (error) {
  const message =
    error instanceof ZodError
      ? error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")
      : error instanceof Error
        ? error.message
        : String(error);
  log.error("Iterate Home Assistant stopped with a terminal error", {
    error: message,
  });
  process.exitCode = 1;
}
