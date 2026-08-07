# 經典畫框材質（長條形）

請把長條材質 WebP 放在這個資料夾。

## 檔名

| 角色 | 檔名 |
|------|------|
| 外框 | `classic-1.webp`, `classic-2.webp`, … |
| 內框 | `inner-1.webp`, `inner-2.webp`, … |

## 建議規格

- 尺寸：`2560 × 256`（長邊為紋理方向）
- 格式：WebP

App 會沿相框四邊鋪貼，轉角旋轉 90°，同一邊不做拼接。

## 上傳後

GitHub → **Actions** → **Sync F5 frame manifests** → **Run workflow**  
（或本機：`node scripts/sync-frame-texture-manifests.mjs`）
