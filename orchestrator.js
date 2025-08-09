import dotenv from "dotenv";
dotenv.config();

import { generateStructuredResponse } from "./StructuredResponse.js";
import { systemActionSchema } from "./systemActionSchema.js";
import { executeSystemAction } from "./controlPlane.js";
import fs from "fs";

const HISTORY_FILE = process.env.HISTORY_FILE || 'history.json';
const STOP_SIGNAL_FILE = process.env.STOP_SIGNAL_FILE || 'STOP';

async function main() {
  const goal = process.env.GOAL || 'Your main goal is to fully setup and secure the Ubuntu server. This includes updating packages, installing a firewall, setting up monitoring, and implementing security best practices. You are an autonomous agent and must complete this goal without assistance.';

  const historyFilePath = 'history.json';
  const stopSignalFilePath = 'stop-agent.signal';

  function loadHistory() {
    if (fs.existsSync(historyFilePath)) {
      const historyJson = fs.readFileSync(historyFilePath, 'utf8');
      return JSON.parse(historyJson);
    }
    return [];
  }

  function saveHistory(history) {
    fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2));
  }

  console.log(`Starting agent with goal: "${goal}"`);

  let history = loadHistory();
  let lastActionFailed = history.length > 0 && JSON.parse(history[history.length - 1].content).status !== 'success';

  const mainPrompt = "Given the goal and history, decide the next single system configuration step. Before installing a package or configuring a service, first check if it's already installed or configured. Be methodical. Your primary tools are 'create_script' and 'execute_script'. IMPORTANT: When creating a script, if any command inside it requires root privileges, you MUST prefix that command with 'sudo' directly within the script's content. Do not attempt to run the entire script with 'sudo bash'. VERY IMPORTANT for file configuration: To write to a system path like '/etc/' or '/var/', you MUST NOT use the `configure_file` action. Instead, you MUST use `create_script` with a command like `echo '...' | sudo tee /path/to/file`. The `configure_file` action only works for paths the `agent_user` already owns. When you use 'create_script', it will return a 'filename' in its result. Your very next action MUST be to call 'execute_script' and you MUST use the exact 'filename' from the previous step's result in the 'details' of your new action. If you need information, use 'search_web' for research (provide a 'topic' and 'subTopic' for best results) or 'read_file' to inspect local files. Only for genuinely complex sub-tasks that are different from your current goal should you use 'spawn_agent' to delegate. Do not spawn an agent with the same goal as your own. Once you have confirmed that all aspects of the goal are complete, you must call the 'finish' action.";
  const errorPrompt = "The previous action failed. You are an expert Ubuntu system administrator. Your first step is to solve this using your own knowledge. Analyze the error in the history and formulate a new command to fix it. For example, if a package was not found, suggest a common alternative (e.g., for 'apache', suggest 'apache2'). Your next action should be a direct attempt to solve the problem. ONLY if your expert solution fails again should you use 'search_web' as a last resort. If the history shows your last two actions were failed attempts at the same problem, you MUST use 'search_web' to find external solutions. After searching, you must synthesize the results into a new action.";

  while (true) {
    if (fs.existsSync(stopSignalFilePath)) {
      console.log('Stop signal detected. Shutting down agent.');
      fs.unlinkSync(stopSignalFilePath);
      break;
    }

    const currentPrompt = lastActionFailed ? errorPrompt : mainPrompt;

    const step = await generateStructuredResponse({
      query: currentPrompt,
      context: JSON.stringify({ goal, history }),
      schema: systemActionSchema
    });

    history.push({ role: 'assistant', content: JSON.stringify(step, null, 2) });
    console.log('→ Next action:', JSON.stringify(step, null, 2));

    const result = await executeSystemAction(step);

    history.push({ role: 'user', content: JSON.stringify(result, null, 2) });
    console.log('← Result:', JSON.stringify(result, null, 2));

    lastActionFailed = result.status !== 'success';

    saveHistory(history);

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
