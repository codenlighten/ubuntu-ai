import { exec } from "child_process";
import fs from "fs/promises";

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
