import dotenv from "dotenv";
dotenv.config();

import { generateStructuredResponse } from "./structuredResponse.js";
import { systemActionSchema } from "./systemActionSchema.js";
import { executeSystemAction } from "./controlPlane.js";
import fs from "fs/promises";

const HISTORY_FILE = "history.json";

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
    const step = await generateStructuredResponse({
      query: "Given the goal and history, decide the next single system configuration step. Be methodical. If you need to read a file, use the 'read_file' action first.",
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
