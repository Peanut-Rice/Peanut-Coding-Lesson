#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "需要 Node.js 18 或更新版本：https://nodejs.org/"
  echo "安装后再双击本文件。"
  read -n 1 -s -r -p "按任意键退出..."
  exit 1
fi
node tools/serve.mjs .
