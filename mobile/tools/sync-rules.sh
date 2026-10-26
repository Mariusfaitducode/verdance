#!/bin/sh
# Recopie les règles du jeu (../rules.js, source de vérité) dans public/ : le client et le serveur les importent de là.
set -eu
cd "$(dirname "$0")/.."
cp ../rules.js public/rules.js
echo "rules.js synchronisé -> public/rules.js"
