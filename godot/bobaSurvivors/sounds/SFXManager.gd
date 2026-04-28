extends Node

# ── 音效節點 ──────────────────────────────────────────────────────
var bgm_player: AudioStreamPlayer
var sfx_players: Array[AudioStreamPlayer] = []
const MAX_SFX_PLAYERS = 8 # 最大同時播放音效數量

# ── 音檔快取 ──────────────────────────────────────────────────────
var sounds: Dictionary = {}

func _ready() -> void:
	# 即使遊戲暫停（如三選一介面），音效管理器依然持續運作
	process_mode = Node.PROCESS_MODE_ALWAYS
	
	# 建立 BGM Player
	bgm_player = AudioStreamPlayer.new()
	bgm_player.bus = "Master"
	add_child(bgm_player)
	
	# 建立 SFX Players (Pool)
	for i in range(MAX_SFX_PLAYERS):
		var p = AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		sfx_players.append(p)
		
	# 預載音效
	_load_sound("battle_bgm", "res://sounds/battle_bgm.ogg")
	_load_sound("shoot_pearl", "res://sounds/shoot_pearl.ogg")
	_load_sound("player_hit", "res://sounds/player_hit.ogg")

func _load_sound(sound_name: String, path: String) -> void:
	if ResourceLoader.exists(path):
		var stream = load(path)
		# 若是 bgm 則設定循環播放 (針對 .ogg)
		if sound_name == "battle_bgm" and stream is AudioStreamOggVorbis:
			stream.loop = true
		sounds[sound_name] = stream
	else:
		push_error("[SFXManager] 找不到音效檔案: " + path)

func play_bgm(sound_name: String = "battle_bgm") -> void:
	if not sounds.has(sound_name):
		return
	bgm_player.stream = sounds[sound_name]
	bgm_player.volume_db = -5.0 # BGM 稍微調小聲
	bgm_player.play()

func stop_bgm() -> void:
	bgm_player.stop()

func play_sfx(sound_name: String) -> void:
	if not sounds.has(sound_name):
		return
		
	# 找尋一個有空的 Player
	for p in sfx_players:
		if not p.playing:
			p.stream = sounds[sound_name]
			p.play()
			return
			
	# 如果全滿了，就中斷最前面的直接播（簡單策略）
	var fallback = sfx_players[0]
	fallback.stream = sounds[sound_name]
	fallback.play()
