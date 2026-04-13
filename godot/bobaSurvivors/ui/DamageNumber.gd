extends Marker2D

func set_values(amount: float, color: Color):
	var label = get_node_or_null("Label")
	if not label: return
	
	# 處理顯示文字
	label.text = str(int(amount))
	label.modulate = color
	
	# 啟動補間動畫 (Tween)
	var tween = create_tween()
	tween.set_parallel(true) # 讓位移、縮放、透明度同時進行
	
	# 1. 向上噴發飄移 (帶有一點隨機橫移)
	var random_x = randf_range(-60, 60)
	var target_pos = position + Vector2(random_x, -120)
	tween.tween_property(self, "position", target_pos, 0.7).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	
	# 2. 彈出縮放效果 (Pop Effect)
	scale = Vector2(0.3, 0.3)
	tween.tween_property(self, "scale", Vector2(1.2, 1.2), 0.15).set_trans(Tween.TRANS_BACK)
	
	# 3. 延遲淡出
	var fade_tween = create_tween()
	fade_tween.set_parallel(true)
	fade_tween.tween_interval(0.4) # 先停留一下
	fade_tween.chain().tween_property(self, "modulate:a", 0.0, 0.3)
	fade_tween.parallel().tween_property(self, "scale", Vector2(0.7, 0.7), 0.3)
	
	# 4. 動畫結束後自動銷毀
	fade_tween.finished.connect(queue_free)
