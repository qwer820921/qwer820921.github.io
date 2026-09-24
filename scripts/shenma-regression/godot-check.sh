#!/usr/bin/env bash
# 神馬三國 Godot 端檢查：暫存目錄匯入 → debug 匯出 → 與交付產物核對 → headless 生命週期測試
# 任一步失敗都以非零結束：Godot log 有 ERROR／SCRIPT ERROR／Parse Error、產物有不允許的差異、
# 測試失敗或沒有輸出結果、Godot 逾時。全程不寫入倉庫，也不刪除任何檔案或目錄。
#
# 用法（Git Bash）：
#   GODOT="/path/to/Godot_v4.6.2-stable_win64_console.exe" bash scripts/shenma-regression/godot-check.sh [工作目錄]
#   模板需放在編輯器 self-contained 目錄：<編輯器目錄>/editor_data/export_templates/4.6.2.stable/
#
# 工作目錄：省略時用 mktemp 建立唯一的新目錄。指定時必須「不存在」或「是空目錄」，
#   而且不能是倉庫本身、倉庫的上層目錄或倉庫內的目錄，否則直接拒絕（結束碼 2）。
# 選用環境變數：
#   PUBLIC_DIR    要核對的交付產物目錄（預設：工作區的 public/games/shenmaSanguo）
#   TEST_SCRIPT   要執行的測試（預設：res://__regression__/lifecycle_test.gd；失敗 fixture 見 README）
#   COMPARE_HEAD  設為 1 時另外列出與 HEAD 版 public/ 的差異（僅供診斷，不影響結果）
set -uo pipefail

die() { echo "拒絕：$*" >&2; exit 2; }
: "${GODOT:?請設定 GODOT 為 Godot 4.6.2 console 執行檔路徑}"
[ -x "$GODOT" ] || die "找不到 Godot 執行檔：$GODOT"
win() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
# 絕對路徑、解析 .. 與符號連結；Windows 上統一成 C:/… 格式（/c/… 與 C:/… 視為同一路徑）
canon() {
  local p
  p=$(realpath -m -- "$1") || return 1
  if command -v cygpath >/dev/null 2>&1; then p=$(cygpath -m -- "$p") || return 1; fi
  printf '%s' "${p%/}"
}
REPO_RAW=$(git rev-parse --show-toplevel) || die "請在倉庫內執行"
REPO=$(canon "$REPO_RAW")
PUBLIC_DIR=${PUBLIC_DIR:-"$REPO/public/games/shenmaSanguo"}
TEST_SCRIPT=${TEST_SCRIPT:-res://__regression__/lifecycle_test.gd}
TOOLS="$REPO/scripts/shenma-regression/tools"

# ── 工作目錄：先驗證，驗證通過前不做任何寫入 ──
# Windows 路徑不分大小寫，比對前一律轉小寫
lc() { case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) printf '%s' "$1" | tr '[:upper:]' '[:lower:]';; *) printf '%s' "$1";; esac; }
if [ $# -ge 1 ]; then
  [ -n "$1" ] || die "工作目錄不可為空字串"
  WORK=$(canon "$1") || die "無法解析路徑：$1"
  case "$WORK" in ""|[A-Za-z]:) die "不可使用根目錄：$1";; esac
  w=$(lc "$WORK"); r=$(lc "$REPO")
  case "$r/" in "$w"/*) die "工作目錄是倉庫本身或倉庫的上層：$WORK";; esac
  case "$w/" in "$r"/*) die "工作目錄在倉庫內：$WORK";; esac
  if [ -e "$WORK" ] || [ -L "$WORK" ]; then
    [ -d "$WORK" ] && [ ! -L "$WORK" ] || die "已存在且不是一般目錄：$WORK"
    [ -z "$(ls -A -- "$WORK")" ] || die "目錄已存在且不是空的：$WORK（請指定新的目錄）"
  fi
  mkdir -p -- "$WORK" || die "無法建立工作目錄：$WORK"
else
  WORK=$(mktemp -d "${TMPDIR:-/tmp}/shenma-godot-check.XXXXXX") || die "mktemp 失敗"
fi

failures=()
fail() { echo "✗ $*"; failures+=("$*"); }

echo "== 工作目錄：$WORK"
ver=$("$GODOT" --version 2>/dev/null | tr -d '\r')
echo "== Godot 版本：$ver"
case "$ver" in 4.6.2.stable.*) ;; *) fail "Godot 版本不是 4.6.2-stable（$ver），模板與產物無法對應";; esac

# ── 複製版本控制中的 Godot 檔案（取工作區內容），不帶入 .godot/ 或未追蹤檔 ──
mkdir -p "$WORK/project" "$WORK/export"
(cd "$REPO/godot/shenmaSanguo" && git ls-files -z . | xargs -0 -I{} cp --parents "{}" "$WORK/project/") \
  || fail "複製 Godot 專案失敗"
untracked=$(cd "$REPO/godot/shenmaSanguo" && git ls-files --others --exclude-standard .)
[ -z "$untracked" ] || echo "注意：godot/shenmaSanguo 有未追蹤檔案，沒有複製（未 git add 的檔案不會進入匯出）：$untracked"

run_godot() { # $1=log 名稱 $2=逾時秒數，其餘為 Godot 參數
  local log="$WORK/$1.log" limit=$2; shift 2
  timeout "$limit" "$GODOT" --headless "$@" > "$log" 2>&1
  local code=$?
  [ $code -eq 124 ] && fail "Godot 逾時（${limit} 秒）：$1"
  return $code
}

echo "== 匯入"
run_godot import 600 --path "$(win "$WORK/project")" --import || fail "匯入結束碼非 0"
node "$(win "$TOOLS/check-log.mjs")" import "$(win "$WORK/import.log")" || fail "匯入 log 有錯誤"

echo "== debug 匯出（與目前正式產物相同的 web_nothreads_debug 模板）"
run_godot export 600 --path "$(win "$WORK/project")" --export-debug "Web" "$(win "$WORK/export/index.html")" \
  || fail "匯出結束碼非 0"
node "$(win "$TOOLS/check-log.mjs")" export "$(win "$WORK/export.log")" || fail "匯出 log 有錯誤"

echo "== 產物核對（本次匯出 vs 交付產物）"
node "$(win "$TOOLS/verify-export.mjs")" "$(win "$WORK/export")" "$(win "$PUBLIC_DIR")" || fail "產物與交付產物不一致"

if [ "${COMPARE_HEAD:-}" = "1" ]; then
  echo "== 診斷：HEAD 版 public/index.pck vs 本次匯出（不影響結果）"
  mkdir -p "$WORK/head-public"
  git -C "$REPO" show "HEAD:public/games/shenmaSanguo/index.pck" > "$WORK/head-public/index.pck"
  node "$(win "$TOOLS/pck-diff.mjs")" "$(win "$WORK/head-public/index.pck")" "$(win "$WORK/export/index.pck")"
fi

echo "== headless 測試：$TEST_SCRIPT（測試檔只放在另一份暫存專案，不會進入匯出產物）"
cp -r "$WORK/project" "$WORK/test-project"
mkdir -p "$WORK/test-project/__regression__"
cp -r "$REPO/scripts/shenma-regression/godot/." "$WORK/test-project/__regression__/"
run_godot test 900 --path "$(win "$WORK/test-project")" --script "$TEST_SCRIPT"
code=$?
grep -aE '^(PASS|FAIL)  ' "$WORK/test.log"
[ $code -eq 0 ] || fail "測試結束碼 $code"
node "$(win "$TOOLS/check-log.mjs")" test "$(win "$WORK/test.log")" || fail "測試 log 未通過"

echo "== 總結（log 與產物：$WORK）"
if [ ${#failures[@]} -gt 0 ]; then
  printf '失敗 %d 項：\n' "${#failures[@]}"
  printf '  - %s\n' "${failures[@]}"
  exit 1
fi
echo "全部通過"
