#!/bin/bash
# Update script for the Ubuntu AI System Admin Agent

set -e

INSTALL_DIR="/opt/ubuntu-ai-agent"

echo "Starting update of the Ubuntu AI System Admin Agent..."

if [ ! -d "$INSTALL_DIR" ]; then
    echo "Error: Installation directory $INSTALL_DIR not found."
    echo "Please run the deploy.sh script first."
    exit 1
fi

cd $INSTALL_DIR

echo "Pulling latest changes from the repository..."
sudo git pull

echo "Installing/updating Node.js dependencies..."
sudo npm install --production

echo "Clearing old history file for a fresh start..."
sudo rm -f history.json

echo "Restarting the ubuntu-agent service..."
sudo systemctl restart ubuntu-agent.service

echo ""
echo "Update complete! The agent is now running the latest version."
echo "You can monitor the agent's logs with: journalctl -u ubuntu-agent -f"
