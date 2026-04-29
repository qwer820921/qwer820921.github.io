# 神馬三國 — Boss (魔王) 系統實作計畫 (V2.9 Final Safety Specification)

## 1. 資料層設計 (Google Sheets)
| 欄位 | 用途 | 範例 |
| :--- | :--- | :--- |
| **rank** | 位階判定 | `normal`, `elite`, `mini_boss`, `boss` |
| **type** | 基礎兵種 | `grunt`, `cavalry`, `siege`, `mage` |
| **trait** | 特性標籤 | `immune_slow`, `boss_aura`, `regen` |

---

## 2. Godot 實體邏輯 (`Enemy.gd`)

```gdscript
signal boss_hp_changed(current_hp, max_hp, enemy_name, enemy_id)

@onready var sprite = get_node_or_null("Sprite2D") 

func setup(cfg: Dictionary, waypoints: Array) -> void:
    enemy_id   = str(cfg.get("enemy_id", "enemy_default"))
    enemy_name = str(cfg.get("name", "Enemy"))
    enemy_rank = str(cfg.get("rank", "normal"))
    is_boss    = (enemy_rank == "boss")

    max_hp     = int(cfg.get("hp", 100))
    current_hp = max_hp
    armor      = int(cfg.get("armor", 0))

    if is_boss:
        visual_scale = 1.5
        hit_radius   = max(17.0, tile_size * 0.55) 
        if sprite:
            sprite.scale = Vector2(visual_scale, visual_scale)
            sprite.modulate = Color(0.9, 0.2, 0.2) 
        boss_hp_changed.emit(current_hp, max_hp, enemy_name, enemy_id)

func take_damage(amount: float) -> void:
    if current_hp <= 0: return
    var final_damage = max(1, roundi(amount - armor))
    current_hp = max(0, current_hp - final_damage)
    
    if current_hp <= 0:
        _die()
        return
    if is_boss:
        boss_hp_changed.emit(current_hp, max_hp, enemy_name, enemy_id)

func _die() -> void:
    if is_boss:
        boss_hp_changed.emit(0, max_hp, enemy_name, enemy_id)
    queue_free()
```

---

## 3. 系統通訊鏈 (Signal Chain)

### 3-a. WaveManager.gd (具備警告機制的安全連線)
```gdscript
signal boss_hp_changed(hp, max_hp, enemy_name, enemy_id)

func _create_enemy(cfg: Dictionary):
    var enemy = ENEMY_SCENE.instantiate()
    add_child(enemy)

    # 安全連線並提供 Debug 警告，避免腳本掛錯卻無感
    if enemy.has_signal("boss_hp_changed"):
        enemy.boss_hp_changed.connect(_on_enemy_boss_hp_changed)
    else:
        push_warning("Enemy instance missing boss_hp_changed signal: " + str(cfg.get("enemy_id", "unknown")))

    enemy.setup(cfg, waypoints)
    return enemy

func _on_enemy_boss_hp_changed(hp, max_hp, enemy_name, enemy_id):
    boss_hp_changed.emit(hp, max_hp, enemy_name, enemy_id)
```

### 3-b. BattleManager.gd (外發閉環)
```gdscript
func _ready():
    # 確保與 WaveManager 的連線閉合
    if wave_manager and wave_manager.has_signal("boss_hp_changed"):
        wave_manager.boss_hp_changed.connect(_on_boss_hp_changed)

func _on_boss_hp_changed(hp, max_hp, enemy_name, enemy_id):
    web_bridge.send_message("boss_hp_update", {
        "id": enemy_id,
        "name": enemy_name,
        "hp": hp,
        "max_hp": max_hp
    })
```

---

## 4. React UI 層實作 (單魔王模式)

```typescript
type BossInfo = {
  id: string;
  name: string;
  hp: number;
  max_hp: number;
};

const BattlePage = () => {
  const [bossInfo, setBossInfo] = useState<BossInfo | null>(null);

  const bossHpRate = useMemo(() => {
    return bossInfo && bossInfo.max_hp > 0
      ? Math.max(0, Math.min(1, bossInfo.hp / bossInfo.max_hp))
      : 0;
  }, [bossInfo]);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type !== "boss_hp_update") return;
    const payload = event.data.payload;
    if (!payload) return;

    const hp = Number(payload.hp);
    const maxHp = Number(payload.max_hp);

    if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0 || hp <= 0) {
      setBossInfo(null);
    } else {
      setBossInfo({
        id: String(payload.id ?? payload.name ?? "boss"),
        name: String(payload.name ?? "Boss"),
        hp,
        max_hp: maxHp,
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <div>
      {bossInfo && (
        <BossHUD 
          name={bossInfo.name} 
          hp={bossInfo.hp} 
          maxHp={bossInfo.max_hp} 
          rate={bossHpRate} 
        />
      )}
    </div>
  );
};
```

---

## 5. 驗收清單 (Final Verification)
- [ ] **Debug Warning**: 遺失信號時 `WaveManager` 是否會發出 `push_warning`？
- [ ] **BattleManager**: `_ready` 是否包含具備 `has_signal` 保護的連線邏輯？
- [ ] **Type Check**: React 是否已定義 `BossInfo` 型別？
- [ ] **WebBridge Format**: `send_message` 是否實際輸出 `{ type, payload }` 結構？
- [ ] **Single Boss Rule**: 確認 V2.9 同一時間僅顯示一個 Boss HUD？
- [ ] **Initial HUD**: Boss 出場時 React HUD 是否立即顯示滿血？
- [ ] **Armor Logic**: 傷害計算是否正確套用 `roundi` 並落實最低傷害為 1？

---

## 6. 基礎設施調整清單 (Infrastructure)

### 6-a. Google Sheet (`enemies_config` 頁籤)

#### 最終欄位順序 (Final Schema)
請確保 Sheet 的標題列按照此順序排列，以維持戰鬥資料的可讀性：

`enemy_id`, `name`, `type`, `rank`, `level`, `speed`, `hp`, `atk`, `armor`, `attack_range`, `trait`, `notes`, `image`, `attack_image`

#### 欄位定義規則
1.  **rank (位階)**：
    *   放置於 `type` 之後。
    *   **有效值**：`normal`, `elite`, `mini_boss`, `boss`。
    *   *規則：普通小兵填 normal，精英怪填 elite，關卡小魔王填 mini_boss，章節魔王填 boss。*
2.  **trait (特性)**：
    *   放置於 `attack_range` 之後。
    *   **格式**：字串，多個特性用 `|` 分隔（例如：`immune_slow|regen|boss_aura`）。
3.  **type (兵種)**：
    *   維持 `grunt` (步), `cavalry` (騎), `siege` (器械), `mage` (術) 等基礎分類，不與 rank 混用。
4.  **enemy_id (唯一識別碼)**：
    *   Boss 建議格式：`boss_角色名_序號` (例如：`boss_lubu_01`)。

#### 補充規則 (Data Integrity)
*   **mini_boss 顯示規則**：`mini_boss` 目前僅作為位階標籤，**不觸發** React 全域 Boss HUD。只有 `rank = boss` 會觸發大血條顯示。
*   **trait 空值規則**：無特性時請保持**完全空白 (Empty String)**。請勿填寫 `none`、`null`、`-` 或空格，這能確保程式解析時最為穩定。
*   **數值欄位純淨化**：`level`, `hp`, `armor`, `speed`, `atk`, `attack_range` 必須為**純數字**。
    *   ❌ 錯誤：`12000hp`, `快`, `無`, `~80`
    *   ✅ 正確：`12000`, `75`, `0`, `80`
    *   *註：不要在儲存格內加入中文單位或任何說明文字。*

### 6-b. GAS (Google Apps Script) 實作建議

為了避免未來插入欄位導致 Godot/React 抓錯資料，**強烈建議放棄 `row[index]` 的寫法**，改用標題列自動映射：

#### 建議的 GAS 資料轉換函式
```javascript
function getEnemiesData(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim()); // 取得標題並去除前後空格，確保 Key 正確
  const rows = values.slice(1);

  return rows
    .filter(row => String(row[0]).trim() !== "") // 強化過濾，確保 enemy_id 不為空
    .map(row => {
      const obj = {};
      headers.forEach((key, index) => {
        obj[key] = row[index]; // 根據標題自動對應
      });
      return obj;
    });
}
```

#### JSON 輸出確認
確保輸出給前端的 JSON 包含以下穩定 Key：
`enemy_id`, `name`, `type`, `rank`, `level`, `speed`, `hp`, `atk`, `armor`, `attack_range`, `trait`, `notes`, `image`, `attack_image`

### 6-c. 快取與部署
*   **清除快取**：修改 Sheet 標題後，若有使用 `CacheService` 務必清除。
*   **版本發布**：若 GAS 為 Web App，請確保已發布「新版本」或使用 `exec` 連結測試。
*   **前端檢查**：React 端需確認 `ExpeditionPayload` 中的 `enemies_config` 已正確包含 `rank` 與 `trait`。

