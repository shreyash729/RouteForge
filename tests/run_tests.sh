#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# 1. Recompile test binary incrementally (compiler logs redirected to stderr)
if [ ! -d build ]; then
  cmake -B build -S . -DCMAKE_BUILD_TYPE=Release 1>&2
fi
cmake --build build --target challenge_tests -j2 1>&2

# 2. Execute test binary (stdout prints pure JSON)
exec ./build/challenge_tests
