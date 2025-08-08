import { exec, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import axios from "axios";

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

  // Use a dedicated user for agent actions where possible
  const AGENT_USER = process.env.AGENT_USER || 'root'; 
  const sudo = AGENT_USER === 'root' ? 'sudo' : `sudo -u ${AGENT_USER}`;

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
            const content = await fs.readFile(details.path, 'utf-8');
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

    case "create_script":
      try {
        const scriptPath = path.join('scripts', path.basename(details.filename));
        if (path.dirname(scriptPath) !== 'scripts') {
          throw new Error('Script path is outside of the scripts directory.');
        }
        await fs.writeFile(scriptPath, details.content);
        await fs.chmod(scriptPath, '755'); // Make it executable
        result = { status: 'success', message: `Script '${details.filename}' created.` };
      } catch (error) {
        result = { status: 'error', message: error.message };
      }
      break;

    case "spawn_agent":
      try {
        const subAgentHistoryFile = `history-${Date.now()}.json`;
        const subAgentGoal = details.goal;

        const subAgent = spawn('node', ['orchestrator.js'], {
          detached: true,
          stdio: 'ignore', // Prevent parent from waiting for child's stdio
          env: {
            ...process.env, // Inherit parent's env
            GOAL: subAgentGoal,
            HISTORY_FILE: subAgentHistoryFile
          }
        });

        subAgent.unref(); // Allow parent to exit independently

        result = { status: 'success', message: `Spawned new agent with goal: '${subAgentGoal}'. History is in '${subAgentHistoryFile}'.` };
      } catch (error) {
        result = { status: 'error', message: error.message };
      }
      break;

    case "execute_script":
      try {
        const scriptPath = path.join('scripts', path.basename(details.filename));
        if (path.dirname(scriptPath) !== 'scripts') {
          throw new Error('Script path is outside of the scripts directory.');
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

    default:
      return { status: 'error', message: `Unknown action: ${action}` };
  }
  return result;
}
