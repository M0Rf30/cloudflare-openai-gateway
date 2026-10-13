#!/usr/bin/env bash
# Compares the TTS models; writes the generated audio to a temp dir.
set -euo pipefail

API_URL="${API_URL:-http://localhost:8787}"
AUTH_TOKEN="${AUTH_TOKEN:-your_token_here}"
OUT_DIR="${OUT_DIR:-$(mktemp -d)}"

TEXT="The quick brown fox jumps over the lazy dog"

synth() {
    local label="$1" model="$2" out="$3"
    printf '\n%s (%s)\n' "$label" "$model"
    curl -fsS -X POST "$API_URL/v1/audio/speech" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -d "{\"model\": \"$model\", \"input\": \"$TEXT\", \"voice\": \"alloy\"}" \
      --output "$OUT_DIR/$out"
    [ -s "$OUT_DIR/$out" ] || { echo "   empty audio for $model" >&2; exit 1; }
    echo "   Generated: $(wc -c < "$OUT_DIR/$out") bytes"
}

echo "========================================"
echo "TTS Models Comparison Test"
echo "========================================"

synth "1. MeloTTS" "@cf/myshell-ai/melotts" melotts.mp3
synth "2. Deepgram Aura" "@cf/deepgram/aura-1" deepgram.mp3
synth "3. OpenAI compatible (maps to MeloTTS)" "tts-1" openai_tts.mp3

echo "========================================"
echo "All TTS models working. Audio saved in $OUT_DIR"
