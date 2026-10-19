#!/bin/bash
set -e

REPO="https://github.com/carbonthecoder/KINO.git"
INSTALL_DIR="$HOME/.kino"

echo "KINO — installing..."

if [ -d "$INSTALL_DIR" ]; then
  echo "Updating KINO..."
  cd "$INSTALL_DIR" && git pull --quiet
else
  echo "Cloning to $INSTALL_DIR..."
  git clone --quiet "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
npm install --silent 2>/dev/null
npm run build --silent 2>/dev/null

# Create symlink / wrapper binary
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/kino" << 'EOF'
#!/bin/bash
exec node "$HOME/.kino/dist/cli.js" "$@"
EOF
chmod +x "$HOME/.local/bin/kino"

# Also symlink strm alias if desired
cat > "$HOME/.local/bin/strm" << 'EOF'
#!/bin/bash
exec node "$HOME/.kino/dist/cli.js" "$@"
EOF
chmod +x "$HOME/.local/bin/strm"

# Add to PATH if needed
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
  if ! grep -q '$HOME/.local/bin' "$SHELL_RC" 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
    export PATH="$HOME/.local/bin:$PATH"
  fi
fi

echo ""
echo "✓ KINO installed!"
echo "  Run: kino"
echo "  Or:  ~/.local/bin/kino"
