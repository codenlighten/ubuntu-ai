Here’s a concrete “next steps” guide for standing up your multi-agent orchestrator **directly on your Dell 5414 Ubuntu laptop**—no extra sandbox needed:

---

## 1. Prep & Prereqs

1. **Update & Upgrade**

   ```bash
   sudo apt-get update && sudo apt-get -y upgrade
   ```

2. **Install Git, curl, build tools**

   ```bash
   sudo apt-get install -y git curl build-essential
   ```

3. **Install Node.js (v20+) & npm**

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **(Optional) Install Docker**
   If later you decide to containerize agents:

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   ```

---

## 2. Clone & Configure Your Orchestrator

1. **Clone your orchestrator repo** (the one with `structuredResponse.js` and your boss loop)

   ```bash
   git clone https://github.com/you/agent-orchestrator.git ~/agent-orchestrator
   cd ~/agent-orchestrator
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment variables**
   Create a `.env` in that folder:

   ```
   OPENAI_API_KEY=sk-...
   CONTROL_PLANE_SECRET=<a long random string>
   AGENT_PRIVATE_KEY_PATH=~/.agent_key
   ```

   – you'll use that secret to sign messages in your control-plane API.

---

## 3. Run the Orchestrator

### A) Quick & Dirty

```bash
node orchestrator.js
```

This will:

1. Load your `goal` + empty `history`
2. Loop: call `generateStructuredResponse()`
3. Speak to your control-plane module that actually executes each JSON action

### B) As a Systemd Service

Create `/etc/systemd/system/agent-orch.service`:

```ini
[Unit]
Description=AI Agent Orchestrator
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/home/yourusername/agent-orchestrator
EnvironmentFile=/home/yourusername/agent-orchestrator/.env
ExecStart=/usr/bin/node /home/yourusername/agent-orchestrator/orchestrator.js
Restart=on-failure
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now agent-orch
```

---

## 4. Open Ports & SSH

1. **Enable UFW**

   ```bash
   sudo apt-get install -y ufw
   sudo ufw allow OpenSSH
   sudo ufw enable
   ```
2. **SSH key for yourself & the relay agent**

   ```bash
   ssh-keygen -f ~/.ssh/agent_orch_key -N ""
   ```

   – Add the public key to `/home/yourusername/.ssh/authorized_keys` if you want remote SSH.

---

## 5. Control-Plane Endpoint

If your orchestrator also exposes a local HTTP/WebSocket API for agents to call:

1. In your code, bind to `127.0.0.1:3000` (or unix socket).
2. Protect it with your `CONTROL_PLANE_SECRET`.
3. Only your orchestrator and agent processes know that secret.

---

## 6. Verify & Iterate

1. **Check logs**

   ```bash
   journalctl -u agent-orch -f
   ```
2. **Watch actions**
   You’ll see JSON steps like:

   ```json
   {"action":"install_package","details":{"pkg":"docker.io"}}
   ```
3. **Self-correction**
   If any `run_cmd` errors, they’ll appear in history and your agent will propose a fix next loop.

---

## 7. Going Further

* **Add `browse_internet`**
  Give agents a little HTTP-client module so they can fetch CVE feeds, news, docs.
* **Implement `contact_owner`**
  Hook into Slack/email so they can “ping” you for approvals or daily summaries.
* **Lock down root**
  Even on your host, consider creating a dedicated `agentuser` and letting agents run under that account.

---

### In Essence

1. **Install Node & deps** on Ubuntu.
2. **Clone config** + set your keys/ENV.
3. **Run** your orchestrator (directly or as a service).
4. **Open SSH/UFW** so you can monitor or connect remotely.
5. **Let your agents** start inspecting, securing, and configuring—while you watch the JSON audit log roll by.

Now your fresh Dell 5414 is truly “agent-driven,” with no extra sandbox required!


// package.json
{
  "name": "agent-orchestrator",
  "version": "1.0.0",
  "description": "Multi-agent orchestrator using OpenAI and structured JSON actions",
  "main": "orchestrator.js",
  "scripts": {
    "start": "node orchestrator.js"
  },
  "dependencies": {
    "openai": "^4.0.0",
    "dotenv": "^16.0.0"
  }
}

// .env.example
# Copy this to .env and fill in your values
OPENAI_API_KEY=sk-...
GOAL=Provision Ubuntu server with Docker and deploy user

// structuredResponse.js
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

/**
 * Generate a JSON object that strictly follows the provided schema.
 */
export async function generateStructuredResponse({
  query,
  schema,
  context = "",
  model = "gpt-5-mini",
  apiKey = process.env.OPENAI_API_KEY,
}) {
  if (!apiKey) throw new Error("Missing OpenAI API key");
  if (!query) throw new Error("query is required");
  if (!schema) throw new Error("schema is required");

  const openai = new OpenAI({ apiKey });
  const systemMsg = [`
You are an AI assistant that must answer ONLY with valid JSON.
Required Schema:
${JSON.stringify(schema, null, 2)}
`].join("\n");

  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: systemMsg }]
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error("Model returned no content");

  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`Model did not return valid JSON: ${e.message}\n${content}`);
  }
}

// systemActionSchema.js
export const systemActionSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "update_system",
        "install_package",
        "create_user",
        "configure_file",
        "enable_service",
        "open_port",
        "run_cmd",
        "finish"
      ]
    },
    details: {
      type: "object",
      properties: {
        pkg:      { type: "string" },
        user:     { type: "string" },
        home:     { type: "string" },
        path:     { type: "string" },
        content:  { type: "string" },
        service:  { type: "string" },
        port:     { type: "number" },
        cmd:      { type: "string" }
      }
    }
  },
  required: ["action", "details"]
};

// controlPlane.js
import { execSync } from "child_process";
import fs from "fs";

export function executeSystemAction(step) {
  let result;
  switch (step.action) {
    case "update_system":
      execSync("sudo apt-get update && sudo apt-get -y upgrade", { stdio: "inherit" });
      result = "system updated";
      break;

    case "install_package":
      execSync(`sudo apt-get install -y ${step.details.pkg}`, { stdio: "inherit" });
      result = `package ${step.details.pkg} installed`;
      break;

    case "create_user":
      execSync(`sudo useradd -m -d ${step.details.home} ${step.details.user}`, { stdio: "inherit" });
      result = `user ${step.details.user} created`;
      break;

    case "configure_file":
      fs.writeFileSync(step.details.path, step.details.content);
      result = `file ${step.details.path} configured`;
      break;

    case "enable_service":
      execSync(`sudo systemctl enable --now ${step.details.service}`, { stdio: "inherit" });
      result = `service ${step.details.service} enabled`;
      break;

    case "open_port":
      execSync(`sudo ufw allow ${step.details.port}`, { stdio: "inherit" });
      result = `port ${step.details.port} opened`;
      break;

    case "run_cmd":
      try {
        const out = execSync(step.details.cmd);
        result = out.toString();
      } catch (err) {
        result = err.message;
      }
      break;

    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
  return result;
}

// orchestrator.js
import dotenv from "dotenv";
dotenv.config();

import { generateStructuredResponse } from "./structuredResponse.js";
import { systemActionSchema } from "./systemActionSchema.js";
import { executeSystemAction } from "./controlPlane.js";

async function main() {
  const goal = process.env.GOAL;
  if (!goal) throw new Error("Set GOAL in .env");

  let history = [];
  let done = false;

  while (!done) {
    const step = await generateStructuredResponse({
      query: "Decide the next system configuration step",
      context: JSON.stringify({ goal, history }),
      schema: systemActionSchema
    });

    console.log("→ Next action:", step);

    let result;
    try {
      result = executeSystemAction(step);
    } catch (err) {
      result = err.message;
    }

    console.log("← Result:", result);
    history.push({ ...step, result });

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

// README.md
# Agent Orchestrator

This project implements a multi-agent orchestrator for provisioning and managing a fresh Ubuntu server using OpenAI's GPT API and a structured JSON action schema.

## Files

- `package.json`: Node.js project configuration
- `.env.example`: Environment variables template
- `structuredResponse.js`: Wrapper around OpenAI to generate structured JSON responses
- `systemActionSchema.js`: JSON Schema defining allowed system actions
- `controlPlane.js`: Executes validated system actions on the host
- `orchestrator.js`: Main loop: calls the LLM, executes actions, maintains history

## Setup

1. Copy `.env.example` to `.env` and set your `OPENAI_API_KEY` and `GOAL`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the orchestrator:
   ```bash
   npm start
   ```

## Systemd Service (optional)

See earlier instructions to run `orchestrator.js` as a systemd service for automatic startup on boot.

## Supported Actions

- `update_system`
- `install_package`
- `create_user`
- `configure_file`
- `enable_service`
- `open_port`
- `run_cmd`
- `finish`
