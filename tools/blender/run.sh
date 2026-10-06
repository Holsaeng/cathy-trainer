#!/usr/bin/env bash
# Blender 위치를 찾아 make_model.py 실행 (Git Bash / macOS / Linux)
#   bash tools/blender/run.sh            → 설계에 있는 모든 실험체
#   bash tools/blender/run.sh daniel     → 하나만
cd "$(dirname "$0")/../.."
B="${BLENDER:-}"
if [ -z "$B" ]; then
  for c in "/c/Program Files/Blender Foundation"/Blender*/blender.exe "/Applications/Blender.app/Contents/MacOS/Blender" "$(command -v blender 2>/dev/null)"; do
    [ -x "$c" ] && B="$c"
  done
fi
if [ -z "$B" ]; then echo "Blender를 찾지 못했습니다. https://www.blender.org/download/ 에서 설치하거나 BLENDER=경로 로 지정하세요."; exit 1; fi
echo "Blender: $B"
KEYS="${*:-cathy daniel}"
for k in $KEYS; do
  echo "== $k"
  "$B" -b -P tools/blender/make_model.py -- "$k" 2>&1 | grep -E "내보냄|미리보기|Error|Traceback|File \"" | tail -8
done
