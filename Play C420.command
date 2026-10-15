#!/bin/zsh
# Double-click this file to play the built game on this Mac.
cd "${0:A:h}"
export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
game_url='http://127.0.0.1:4173/c420-sim/'

if curl --silent --fail "$game_url" | grep -q 'C420'; then
  open "$game_url"
  exit 0
fi

node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort &
game_server_pid=$!
trap 'kill "$game_server_pid" 2>/dev/null' EXIT INT TERM

for attempt in {1..30}; do
  if curl --silent --fail "$game_url" | grep -q 'C420'; then
    open "$game_url"
    print 'C420 is running. Keep this window open while you sail.'
    wait "$game_server_pid"
    exit $?
  fi
  sleep 0.2
done

print 'The game could not start. Ask Codex to check the local C420 setup.'
read '?Press Return to close this window.'
