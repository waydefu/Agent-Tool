#!/usr/bin/env bash
# Codespaces / Dev Container only; does not install tools on local Windows.
set -euo pipefail
packages=()
command -v rg >/dev/null 2>&1 || packages+=(ripgrep)
if ! command -v fd >/dev/null 2>&1 && ! command -v fdfind >/dev/null 2>&1; then
  packages+=(fd-find)
fi
if (( ${#packages[@]} > 0 )); then
  sudo apt-get update -qq
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${packages[@]}"
fi
if ! command -v fd >/dev/null 2>&1; then
  sudo ln -sf "$(command -v fdfind)" /usr/local/bin/fd
fi
printf 'Tool versions:\n'
rg --version | head -n 1
fd --version
python3 --version
node --version
