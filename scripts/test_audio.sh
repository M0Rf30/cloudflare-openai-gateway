#!/usr/bin/env bash
# Smoke test for the /v1/audio/* endpoints.
# Synthesizes speech first and feeds it back into transcription, so no fixture file is needed.
# Set AUDIO_FILE to transcribe a specific file instead.
set -euo pipefail

WORKER_URL="${WORKER_URL:-http://localhost:8787/v1}"
AUTH_TOKEN="${AUTH_TOKEN:-change_this_token}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

echo "Testing audio endpoints at $WORKER_URL"

echo "Testing TTS..."
curl -fsS -X POST "$WORKER_URL/audio/speech" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"tts-1","input":"Hello, world!","voice":"alloy"}' \
  -o "$workdir/speech.mp3"
[ -s "$workdir/speech.mp3" ] || { echo "TTS returned an empty body" >&2; exit 1; }

audio_file="${AUDIO_FILE:-$workdir/speech.mp3}"

echo "Testing transcription..."
curl -fsS -X POST "$WORKER_URL/audio/transcriptions" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@$audio_file" \
  -F "model=whisper-1"

printf '\nAll audio tests completed!\n'
