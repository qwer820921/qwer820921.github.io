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
	var stream: AudioStream = _streams.get("bgm_battle")
	if stream == null:
		print("[SFXManager] play_bgm: stream not found")
		return
	_bgm_player.stream = stream
	_bgm_player.play()
	print("[SFXManager] BGM playing")

func stop_bgm() -> void:
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
