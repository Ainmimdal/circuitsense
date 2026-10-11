#!/usr/bin/env bash
# Double-click (or run) to start Elera and open it in your browser.
cd "$(dirname "$0")" || exit 1

# Pick up Node from nvm if it is installed that way.
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
fi

pause_and_exit() {
    printf '\nPress Enter to close this window.'
    read -r _
    exit "$1"
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo
    echo "Elera needs Node.js, which is not installed on this computer."
    echo "Download the LTS version from https://nodejs.org , install it,"
    echo "then start Elera again."
    if command -v open >/dev/null 2>&1; then
        open "https://nodejs.org/"
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "https://nodejs.org/" >/dev/null 2>&1
    fi
    pause_and_exit 1
fi

if [ ! -d node_modules ]; then
    echo "Installing Elera for the first time. This can take a minute..."
    if ! npm install; then
        echo
        echo "Installing failed. Check your internet connection and try again."
        pause_and_exit 1
    fi
fi

echo "Starting Elera. Your browser will open shortly."
echo "Close this window (or press Ctrl+C) to stop Elera."
npm run dev -- --open
