import dotenv from "dotenv";
dotenv.config();

import { generateStructuredResponse } from "./StructuredResponse.js";
import { systemActionSchema } from "./systemActionSchema.js";
import { executeSystemAction } from "./controlPlane.js";
import fs from "fs/promises";

const HISTORY_FILE = process.env.HISTORY_FILE || 'history.json';
const STOP_SIGNAL_FILE = process.env.STOP_SIGNAL_FILE || 'STOP';

async function main() {
  const goal = process.env.GOAL;
  if (!goal) throw new Error("Set GOAL in .env");

  let history = [];
  try {
    const historyData = await fs.readFile(HISTORY_FILE, "utf-8");
    history = JSON.parse(historyData);
    console.log(`Resumed with ${history.length} previous actions.`);
  } catch (e) {
    console.log("No previous history found, starting fresh.");
  }

  let done = false;

  while (!done) {
    // Check for stop signal file
    try {
        await fs.access(STOP_SIGNAL_FILE);
        console.log(`Stop signal file '${STOP_SIGNAL_FILE}' found. Shutting down gracefully.`);
        await fs.unlink(STOP_SIGNAL_FILE); // Clean up the file for the next run
        done = true;
        continue;
    } catch (e) {
        // File doesn't exist, continue normally
    }

    const step = await generateStructuredResponse({
      query: "Given the goal and history, decide the next single system configuration step. Be methodical. Your primary tools for achieving goals are 'create_script' and 'execute_script'. If you need information, use 'browse_web' for research or 'read_file' to inspect local files. If an action results in an error, analyze the error message. If a package can't be found, use 'browse_web' to find the correct package name or installation command before trying again. Only for genuinely complex sub-tasks that are different from your current goal should you use 'spawn_agent' to delegate. Do not spawn an agent with the same goal as your own.",
      context: JSON.stringify({ goal, history }),
      schema: systemActionSchema
    });

    console.log("→ Next action:", JSON.stringify(step, null, 2));

    const result = await executeSystemAction(step);

    console.log("← Result:", JSON.stringify(result, null, 2));
    history.push({ ...step, result });

    try {
      await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
      console.error("Error writing history file:", e);
    }

    if (step.action === "finish") {
      console.log("✅ Finished orchestrating:", step.details);
      done = true;
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
