#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rustup target add wasm32-unknown-unknown
cargo build --manifest-path engine/Cargo.toml --release --target wasm32-unknown-unknown --locked
wasm-bindgen engine/target/wasm32-unknown-unknown/release/canvas_xlsx_engine.wasm --target web --out-dir engine/pkg
