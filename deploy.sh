#!/bin/bash
# Deployment script for the Ubuntu AI System Admin Agent

set -e

echo "Starting deployment of the Ubuntu AI System Admin Agent..."

# 1. System Updates and Dependencies
echo "Updating package lists and installing dependencies (git, nodejs, npm)..."
sudo apt-get update
sudo apt-get install -y git nodejs npm

# 2. Clone Repository
REPO_URL="https://github.com/codenlighten/ubuntu-ai.git"
INSTALL_DIR="/opt/ubuntu-ai-agent"

echo "Cloning repository from $REPO_URL into $INSTALL_DIR..."
sudo git clone $REPO_URL $INSTALL_DIR
cd $INSTALL_DIR

# 3. Install Node.js Dependencies
echo "Installing Node.js dependencies..."
sudo npm install

# 4. Create Agent User
AGENT_USER="agent_user"
if id "$AGENT_USER" &>/dev/null; then
    echo "User '$AGENT_USER' already exists."
else
    echo "Creating non-root user '$AGENT_USER' for the agent..."
    sudo useradd -m -s /bin/bash $AGENT_USER
fi

# 5. Configure Sudo Permissions
SUDOERS_FILE="/etc/sudoers.d/91-agent-user-permissions"
echo "Configuring sudo permissions for '$AGENT_USER'..."

# Grant passwordless sudo access for specific, necessary commands
cat << EOF | sudo tee $SUDOERS_FILE
# Permissions for the AI System Admin Agent
$AGENT_USER ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/bin/systemctl, /usr/sbin/ufw, /usr/sbin/useradd, /usr/sbin/usermod, /usr/sbin/userdel, /usr/bin/tee
EOF

sudo chmod 0440 $SUDOERS_FILE

# 6. Set up Environment File
if [ -f ".env" ]; then
    echo ".env file already exists. Skipping creation."
else
    echo "Creating .env file from .env.example..."
    sudo cp .env.example .env
fi

# 7. Set Ownership
echo "Setting ownership of the installation directory to '$AGENT_USER'..."
sudo chown -R $AGENT_USER:$AGENT_USER $INSTALL_DIR


echo ""
echo "Deployment script finished!"
echo ""
echo "ACTION REQUIRED:"
echo "Please edit the .env file with your OpenAI API key and desired goal:"
echo "sudo nano $INSTALL_DIR/.env"
echo ""
echo "After editing, you can set up the systemd service to run the agent in the background."
