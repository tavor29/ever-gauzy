#!/usr/bin/env bash
# Convert the merged Hugging Face model to GGUF, quantize it, and register it with Ollama.
# Usage: ./export_gguf.sh out/merged [Q4_K_M]
set -euo pipefail

MERGED_DIR="${1:?path to merged model}"
QUANT="${2:-Q4_K_M}"           # Q4_K_M ~4.4 GB; Q5_K_M or Q8_0 for higher quality
NAME="pm-mistral"
EXPORT_DIR="$(dirname "$0")/export"
LLAMA_CPP="${LLAMA_CPP:-$HOME/llama.cpp}"

mkdir -p "$EXPORT_DIR"

if [ ! -d "$LLAMA_CPP" ]; then
  git clone --depth 1 https://github.com/ggml-org/llama.cpp "$LLAMA_CPP"
  pip install -r "$LLAMA_CPP/requirements.txt"
  cmake -S "$LLAMA_CPP" -B "$LLAMA_CPP/build" -DGGML_CUDA=ON && cmake --build "$LLAMA_CPP/build" -j --target llama-quantize
fi

python "$LLAMA_CPP/convert_hf_to_gguf.py" "$MERGED_DIR" --outtype f16 --outfile "$EXPORT_DIR/$NAME.f16.gguf"
"$LLAMA_CPP/build/bin/llama-quantize" "$EXPORT_DIR/$NAME.f16.gguf" "$EXPORT_DIR/$NAME.$QUANT.gguf" "$QUANT"
rm "$EXPORT_DIR/$NAME.f16.gguf"

sed "s/__QUANT__/$QUANT/" "$(dirname "$0")/Modelfile" > "$EXPORT_DIR/Modelfile"

# The export dir is mounted read-only into the ollama container at /models.
docker compose exec ollama ollama create "$NAME" -f /models/Modelfile
echo "registered Ollama model '$NAME'"
