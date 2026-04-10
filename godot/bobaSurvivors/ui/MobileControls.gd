extends CanvasLayer

func _ready():
	# 延遲一點點執行，確保節點都已經加載完畢
	call_deferred("_setup_transparency")

func _setup_transparency():
	# CanvasLayer 本身沒有 modulate，我們針對內部的 Control 設定透明度
	if has_node("Control"):
		$Control.modulate.a = 0.5
		print("--- 手機控制台：已設定半透明質感 ---")
