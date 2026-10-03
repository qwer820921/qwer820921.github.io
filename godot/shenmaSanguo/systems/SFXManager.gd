## SFXManager.gd
## 音效管理器（Autoload singleton）
## 管理 SFX 播放池 + BGM，支援節省 / 忠實兩種音效模式

extends Node

# ── 冷卻設定（秒）— 僅節省模式套用 ──────────────────────────
const COOLDOWNS: Dictionary = {
	"tower_shoot": 0.15,
	"enemy_hit":   0.08,
	"enemy_die":   0.15,
	"tower_place": 0.0,
	"hero_place":  0.0,
	"upgrade":     0.0,
	"battle_win":  0.0,
	"battle_lose": 0.0,
}

const POOL_SIZE: int = 8

# ── 音效設定（由 Main 從 payload 傳入）───────────────────────
var sfx_enabled:   bool   = true
var sfx_polyphony: String = "single"   # "single" | "faithful"

# ── 內部狀態 ─────────────────────────────────────────────────
var _players:    Array[AudioStreamPlayer] = []
var _bgm_player: AudioStreamPlayer        = null
var _streams:    Dictionary               = {}
var _cooldowns:  Dictionary               = {}
# Web Autoplay Policy: 已經交由 React 端的 window._my_godot_audio_ctx.resume() 全域解鎖
# Web AudioContext 是否已解鎖（影響所有 AudioStreamPlayer）
var _audio_unlocked: bool = false

# ── 背景音樂的下載（網頁版）──────────────────────────────────
# 網頁版的資料包不含背景音樂（匯出設定排除 audio/bgm，啟動時不必下載）；第一次要播放（玩家點擊後、音效開著）時
# 才從遊戲目錄下載同一個檔案。下載中不重複送出，失敗不影響遊戲，也不自動重試（下一次要播放時才再試，最多 BGM_MAX_TRIES 次）
## 遊戲目錄裡的背景音樂檔（和 index.html 並排；匯出後由 tools/postexport.mjs 從 audio/bgm 複製）
const BGM_FILE: String = "bgm_battle.ogg"
const BGM_MAX_TRIES: int = 2
## 資料包裡沒有背景音樂、要下載
var _bgm_remote: bool = false
## 目前應該播放（play_bgm 之後、stop_bgm 之前）：下載完成時只在仍然需要時播放
var _bgm_wanted: bool = false
## 下載中（同時只有一個）
var _bgm_pending: bool = false
var _bgm_http: HTTPRequest = null
## 送出的下載次數（這次開啟）
var _bgm_tries: int = 0
## 下載的方式：有設定時改用它（測試用），參數是完成時呼叫的 Callable(ok: bool, body: PackedByteArray)
var bgm_fetcher: Callable = Callable()

# ═══════════════════════════════════════════
#  初始化
# ═══════════════════════════════════════════
func _ready() -> void:
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)

	_bgm_player = AudioStreamPlayer.new()
	_bgm_player.volume_db = -6.0
	add_child(_bgm_player)
	_bgm_player.finished.connect(_on_bgm_finished)

	_load_streams()
	_reset_cooldowns()
	print("[SFXManager] ready, loaded streams: ", _streams.keys())

func _load_streams() -> void:
	for key in COOLDOWNS:
		var path: String = "res://audio/sfx/" + key + ".ogg"
		if ResourceLoader.exists(path):
			_streams[key] = load(path)
		else:
			print("[SFXManager] missing sfx: ", path)
	var bgm_path: String = "res://audio/bgm/bgm_battle.ogg"
	if ResourceLoader.exists(bgm_path):
		_streams["bgm_battle"] = load(bgm_path)
	elif OS.has_feature("web"):
		_bgm_remote = true
		print("[SFXManager] bgm: not in pck, download on first play: ", BGM_FILE)
	else:
		print("[SFXManager] missing bgm: ", bgm_path)

func _reset_cooldowns() -> void:
	for key in COOLDOWNS:
		_cooldowns[key] = 0.0

# ═══════════════════════════════════════════
#  _process — 冷卻倒計
# ═══════════════════════════════════════════
func _process(delta: float) -> void:
	for key in _cooldowns:
		if _cooldowns[key] > 0.0:
			_cooldowns[key] = max(0.0, _cooldowns[key] - delta)

# ═══════════════════════════════════════════
#  _input — Web Autoplay 解鎖
#  第一次使用者點擊 / 觸碰時：
#    1. 呼叫 JavaScriptBridge resume Web AudioContext
#    2. 補播 pending 的 BGM
# ═══════════════════════════════════════════
func _input(event: InputEvent) -> void:
	if _audio_unlocked:
		return
	if not (event is InputEventMouseButton or event is InputEventScreenTouch):
		return
	_audio_unlocked = true
	if OS.get_name() == "Web":
		# 透過 JavaScriptBridge 呼叫 Godot 引擎建立的 AudioContext.resume()
		# Godot Web export 的 AudioContext 掛在 window.GodotAudio.ctx
		JavaScriptBridge.eval("""
			(function(){
				var ctx = window.GodotAudio && window.GodotAudio.ctx;
				if(!ctx) ctx = window._godot_audio_ctx;
				if(ctx && ctx.state !== 'running') {
					ctx.resume().then(function(){
						console.log('[SFXManager] Web AudioContext resumed');
					});
				}
			})();
		""", true)
		print("[SFXManager] Web AudioContext resume requested")

# ═══════════════════════════════════════════
#  公開 API
# ═══════════════════════════════════════════

## 由 Main 在 payload 解析後呼叫，套用玩家偏好設定
func configure(p_sfx_enabled: bool, p_sfx_polyphony: String) -> void:
	var prev_enabled := sfx_enabled
	sfx_enabled   = p_sfx_enabled
	sfx_polyphony = p_sfx_polyphony
	print("[SFXManager] configure: enabled=", sfx_enabled, " polyphony=", sfx_polyphony)
	if not sfx_enabled:
		stop_bgm()
		for p in _players:
			p.stop()
	elif not _bgm_player.playing:
		play_bgm()

func play(sfx_key: String) -> void:
	if not sfx_enabled or _players.is_empty():
		return
	if sfx_polyphony == "single" and _cooldowns.get(sfx_key, 0.0) > 0.0:
		return
	var stream: AudioStream = _streams.get(sfx_key)
	if stream == null:
		return
	var player := _get_free_player()
	if player == null:
		return
	player.stream = stream
	player.play()
	if sfx_polyphony == "single":
		_cooldowns[sfx_key] = COOLDOWNS.get(sfx_key, 0.0)

func play_bgm() -> void:
	if not sfx_enabled:
		return
	_bgm_wanted = true
	var stream: AudioStream = _streams.get("bgm_battle")
	if stream == null:
		if _bgm_remote:
			_request_bgm()
		else:
			print("[SFXManager] play_bgm: stream not found")
		return
	_bgm_player.stream = stream
	_bgm_player.play()
	print("[SFXManager] BGM playing")

func stop_bgm() -> void:
	_bgm_wanted = false
	if _bgm_player:
		_bgm_player.stop()

# ═══════════════════════════════════════════
#  內部
# ═══════════════════════════════════════════
func _get_free_player() -> AudioStreamPlayer:
	if _players.is_empty():
		return null
	for p in _players:
		if not p.playing:
			return p
	var oldest: AudioStreamPlayer = _players[0]
	_players.remove_at(0)
	_players.append(oldest)
	return oldest

func _on_bgm_finished() -> void:
	if sfx_enabled and _bgm_player.stream != null:
		_bgm_player.play()

## 下載背景音樂（網頁版第一次要播放時）：下載中或已用完次數時不送出
func _request_bgm() -> void:
	if _bgm_pending or _bgm_tries >= BGM_MAX_TRIES:
		return
	_bgm_pending = true
	_bgm_tries += 1
	print("[SFXManager] BGM download start (try %d)" % _bgm_tries)
	if bgm_fetcher.is_valid():
		bgm_fetcher.call(_on_bgm_fetched)
		return
	_bgm_http = HTTPRequest.new()
	add_child(_bgm_http)
	_bgm_http.request_completed.connect(
		func(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
			_on_bgm_fetched(result == HTTPRequest.RESULT_SUCCESS and code == 200, body))
	var url: String = str(JavaScriptBridge.eval("new URL('%s', location.href).href" % BGM_FILE, true))
	if _bgm_http.request(url) != OK:
		_on_bgm_fetched(false, PackedByteArray())

## 下載完成：成功時記住（之後不再下載），仍然需要播放、音效開著而且還沒在播時才開始播放
func _on_bgm_fetched(ok: bool, body: PackedByteArray) -> void:
	_bgm_pending = false
	if _bgm_http != null:
		_bgm_http.queue_free()
		_bgm_http = null
	var stream: AudioStream = null
	if ok and not body.is_empty():
		stream = AudioStreamOggVorbis.load_from_buffer(body)
	if stream == null:
		print("[SFXManager] BGM download failed (try %d), game continues without BGM" % _bgm_tries)
		return
	_streams["bgm_battle"] = stream
	_bgm_remote = false
	print("[SFXManager] BGM downloaded: ", body.size(), " bytes")
	if _bgm_wanted and sfx_enabled and not _bgm_player.playing:
		_bgm_player.stream = stream
		_bgm_player.play()
		print("[SFXManager] BGM playing")
