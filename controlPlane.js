import { exec, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import { searchGoogle } from "./google-search.js";
import RelevantResults from "./RelevantResults.js";

// Get the directory of the current module to build absolute paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Define a secure, absolute path for scripts
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

// A helper function to promisify exec
const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        // Don't reject, resolve with the error details
        // so the orchestrator can decide how to proceed.
        resolve({ status: 'error', error, stdout, stderr });
        return;
      }
      resolve({ status: 'success', stdout, stderr });
    });
  });
};

export async function executeSystemAction(step) {
  const { action, details } = step;
  let result;

  // System-level commands require root privileges.
  const sudo = 'sudo';

  switch (action) {
    case "update_system":
      result = await execPromise(`${sudo} apt-get update && ${sudo} apt-get -y upgrade`);
      break;

    case "install_package":
      result = await execPromise(`${sudo} apt-get install -y ${details.pkg}`);
      break;

    case "create_user":
      // This action still needs higher privileges
      result = await execPromise(`sudo useradd -m -d ${details.home} ${details.user}`);
      break;

    case "configure_file":
      try {
        await fs.writeFile(details.path, details.content);
        result = { status: 'success', message: `File ${details.path} written` };
      } catch(e) {
        result = { status: 'error', message: e.message };
      }
      break;

    case "read_file":
      try {
        const filePath = details.path || details.filename;
        const content = await fs.readFile(filePath, 'utf-8');
        result = { status: 'success', content };
      } catch(e) {
        result = { status: 'error', message: e.message };
      }
      break;

    case "enable_service":
      result = await execPromise(`${sudo} systemctl enable --now ${details.service}`);
      break;

    case "open_port":
      result = await execPromise(`${sudo} ufw allow ${details.port}`);
      break;

    case "run_cmd":
      // Note: Running arbitrary commands is powerful but risky.
      // The AGENT_USER helps contain the potential impact.
      result = await execPromise(details.cmd);
      break;

    case "browse_web":
      try {
        const response = await axios.get(details.url, { timeout: 5000 });
        // Basic HTML tag stripping
        const textContent = response.data.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
        result = { status: 'success', content: textContent.substring(0, 4000) }; // Truncate to avoid huge context
      } catch (error) {
        result = { status: 'error', message: error.message };
      }
      break;

    case "search_web":
      try {
        const { query, topic, subTopic } = details;
        if (!query) {
          throw new Error("Search query is required for the 'search_web' action.");
        }

        // 1. Perform the search
        const rawResults = await searchGoogle(query, 10); // Get top 10 results

        if (!rawResults || rawResults.length === 0) {
          result = { status: 'success', content: 'No search results found.' };
          break;
        }

        // 2. Filter for relevance
        const relevanceFilter = new RelevantResults(process.env.OPENAI_API_KEY);
        const relevantResults = await relevanceFilter.filterByRelevance(
          topic || query, // Fallback topic to query
          subTopic || '', // Sub-topic can be empty
          rawResults,
          5 // Get top 5 most relevant
        );

        // 3. Format and return the results
        if (relevantResults && relevantResults.length > 0) {
          const formattedResults = relevantResults.map(item => {
            return `Title: ${item.title}\nLink: ${item.link}\nSnippet: ${item.snippet}\nRelevance: ${item.relevanceScore}/10`;
          }).join('\n\n---\n\n');
          result = { status: 'success', content: formattedResults };
        } else {
          // If filtering returns nothing, provide the top raw results as a fallback
          const fallbackResult = rawResults.slice(0, 3).map(item => {
             return `Title: ${item.title}\nLink: ${item.link}\nSnippet: ${item.snippet}`;
          }).join('\n\n---\n\n');
          result = { status: 'success', content: `Could not determine relevance, providing top raw results:\n\n${fallbackResult}` };
        }
      } catch (error) {
        result = { status: 'error', message: `Search failed: ${error.message}` };
      }
      break;

    case "create_script":
      try {
        let filename = details.filename;
        let content = details.content;

        // If a 'cmd' is provided instead, create a script from it
        if (details.cmd && !content) {
          filename = `script-${Date.now()}.sh`;
          content = `#!/bin/bash\n${details.cmd}`;
        }

        // Ensure the absolute scripts directory exists
        await fs.mkdir(SCRIPTS_DIR, { recursive: true });

        const scriptPath = path.join(SCRIPTS_DIR, path.basename(filename));
        // Security check to prevent path traversal
        if (!scriptPath.startsWith(SCRIPTS_DIR)) {
          throw new Error(`Attempted to write script outside of the designated scripts directory: ${scriptPath}`);
        }
        await fs.writeFile(scriptPath, content);
        await fs.chmod(scriptPath, '755'); // Make it executable
        result = { status: 'success', filename: filename, message: `Script '${filename}' created.` };
      } catch (error) {
        result = { status: 'error', message: error.message };
      }
      break;

    case "spawn_agent":
      try {
        const newGoal = details.goal;
        if (newGoal === process.env.GOAL) {
          result = { status: 'error', message: 'Error: Cannot spawn a sub-agent with the exact same goal. Please break down the task first.' };
          break;
        }
        const historyFile = `history-${Date.now()}.json`;
        const agentProcess = spawn('node', ['orchestrator.js'], {
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            GOAL: newGoal,
            HISTORY_FILE: historyFile
          }
        });
        agentProcess.unref();
        result = { status: 'success', message: `Spawned new agent with goal: '${newGoal}'. History is in '${historyFile}'.` };
      } catch (e) {
        result = { status: 'error', message: e.message };
      }
      break;

    case "execute_script":
      try {
        const scriptFile = details.path || details.filename;
        const scriptPath = path.join(SCRIPTS_DIR, path.basename(scriptFile));
        // Security check to prevent path traversal
        if (!scriptPath.startsWith(SCRIPTS_DIR)) {
          throw new Error(`Attempted to execute script outside of the designated scripts directory: ${scriptPath}`);
        }
        result = await execPromise(`bash ${scriptPath}`);
      } catch (error) {
        result = { status: 'error', message: error.message };
      }
      break;

    case "get_system_stats":
        const disk = await execPromise("df -h");
        const mem = await execPromise("free -h");
        const load = await execPromise("uptime");
        result = { 
            status: 'success',
            disk: disk.stdout,
            memory: mem.stdout,
            load: load.stdout
        };
        break;

    case "finish":
      console.log("Goal achieved. Terminating agent.");
      process.exit(0);

    default:
      return { status: 'error', message: `Unknown action: ${action}` };
  }
  return result;
}
