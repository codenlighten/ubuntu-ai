# AI System Administrator

This project is an AI-powered agent designed to manage and administer an Ubuntu system. It uses OpenAI's GPT models to reason about a high-level goal, and then executes specific, structured actions to achieve it. The agent is designed for continuous operation, with persistent history and a focus on security.

## Core Features

- **Autonomous Operation:** The agent runs in a continuous loop to achieve its goal, effectively operating in a fully autonomous "auto mode."
- **Owner Control:** The owner can gracefully stop the agent at any time by sending a simple signal, without needing to kill the process.
- **Self-Improvement via Scripting:** The agent can write and execute its own shell scripts to perform complex tasks or create new tools for itself, operating within a secure `scripts/` directory.
- **Inter-Agent Communication:** The agent can spawn sub-agents to delegate complex tasks, allowing for parallel work and hierarchical problem-solving. Each sub-agent operates with its own independent history.
- **Goal-Oriented Operation:** Provide a high-level goal (e.g., "Harden system security and install monitoring tools"), and the agent will devise and execute a plan.
- **Persistent History:** The agent saves its action history in `history.json`, allowing it to learn from past actions and resume its work after a restart.
- **Secure Execution:** Actions are executed by a designated, non-root user (`AGENT_USER`) where possible, minimizing security risks.
- **Structured Actions:** The agent operates on a strict, predefined schema of actions, preventing arbitrary command execution and ensuring predictable behavior.
- **Extensible:** New capabilities can be added by defining them in the `systemActionSchema.js` and implementing them in `controlPlane.js`.

## Deployment

Deploying the agent to a fresh Ubuntu server is automated with the `deploy.sh` script.

1.  **Run the Deployment Script:**

    On your new server, download and run the deployment script:

    ```bash
    wget https://raw.githubusercontent.com/codenlighten/ubuntu-ai/main/deploy.sh
    chmod +x deploy.sh
    sudo ./deploy.sh
    ```

    This script will:
    - Install all necessary dependencies (Node.js, npm, git).
    - Clone the repository into `/opt/ubuntu-ai-agent`.
    - Install Node.js packages.
    - Create a secure, non-root `agent_user`.
    - Configure the necessary `sudo` permissions for the agent.
    - Create a `.env` file from the example.

2.  **Configure the Agent:**

    You must add your OpenAI API key and set the agent's high-level goal in the `.env` file:

    ```bash
    sudo nano /opt/ubuntu-ai-agent/.env
    ```

3.  **Install and Start the Service:**

    To run the agent persistently in the background, install and enable the provided `systemd` service:

    ```bash
    # Copy the service file to the systemd directory
    sudo cp /opt/ubuntu-ai-agent/service/ubuntu-agent.service /etc/systemd/system/

    # Reload the systemd daemon, enable the service to start on boot, and start it now
    sudo systemctl daemon-reload
    sudo systemctl enable ubuntu-agent.service
    sudo systemctl start ubuntu-agent.service
    ```

4.  **Monitor the Agent:**

    You can check the agent's status and view its logs using `systemctl` and `journalctl`:

    ```bash
    # Check status
    sudo systemctl status ubuntu-agent.service

    # View live logs
    sudo journalctl -u ubuntu-agent.service -f
    ```

## Local Development

1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment:** Copy `.env.example` to `.env` and set the required values:
    - `OPENAI_API_KEY`: Your API key for the OpenAI service.
    - `GOAL`: The high-level objective for the agent.
    - `AGENT_USER`: (Optional) The local system user the agent should run as. Defaults to `root` if not set.
    - `STOP_SIGNAL_FILE`: (Optional) The name of the file used to signal a shutdown. Defaults to `STOP`.

4.  **Run the Agent:**
    ```bash
    npm start
    ```

For continuous operation, it is recommended to run the orchestrator as a `systemd` service (see `overview.md` for an example).

## Auto Mode and Owner Control

The agent is designed to run autonomously in a continuous loop. To stop the agent, you don't need to find and kill the process. Instead, you can create a signal file in the agent's directory. By default, this file is named `STOP`.

To stop the agent, simply run this command in the project directory:
```bash
touch STOP
```
On its next cycle, the agent will detect this file, shut down gracefully, and remove the file so it's ready for the next run.

## Supported Actions

The agent can perform the following actions:

- `update_system`: Updates all system packages.
- `install_package`: Installs a software package using `apt`.
- `create_user`: Creates a new user on the system.
- `configure_file`: Writes content to a specified file.
- `read_file`: Reads the content of a specified file.
- `get_system_stats`: Retrieves current disk, memory, and load statistics.
- `browse_web`: Fetches the textual content of a given URL.
- `create_script`: Creates a new executable script in the `scripts/` directory.
- `execute_script`: Runs a script from the `scripts/` directory.
- `spawn_agent`: Deploys a new, independent agent with a specific goal.
- `enable_service`: Enables and starts a `systemd` service.
- `open_port`: Opens a port in the UFW firewall.
- `run_cmd`: Executes a shell command.
- `finish`: Terminates the orchestration loop upon completing the goal.
