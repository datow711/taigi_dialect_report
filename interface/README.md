# 台語方音錄音資料庫介面

這是一個純靜態資料檢索介面，讀取 `../data_export/*.json`，不需要 Flask、MySQL 或 MongoDB。

## 啟動

請在專案根目錄啟動靜態伺服器：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

再開啟：

```text
http://127.0.0.1:8000/interface/index.html
```

不要直接用 `file://` 開啟，瀏覽器通常會阻擋 JavaScript 讀取 JSON。

## 資料檔

介面使用：

- `data_export/questions.json`
- `data_export/speakers.json`
- `data_export/recordings.json`
- `data_export/annotations.json`
- `data_export/variants.json`
- `data_export/facets.json`
- `data_export/manifest.json`

## 音檔

目前 `recordings.json` 仍使用舊本地路徑：

```json
"audio": {
  "legacyPath": "static/wav/recordings/.../7.wav",
  "googleDriveFileId": null,
  "url": null
}
```

等音檔搬到 Google Drive 後，建議補 `url`，介面會優先播放 `url`，其次才使用 `legacyPath`。

## 目前功能

- 瀏覽 80 題問卷內容
- 依題號、來源地、標註狀態、目標詞、變體選項篩選錄音
- 支援 AND / OR 篩選邏輯
- 查看錄音人匿名 metadata
- 依題號按來源地分組比對錄音
- 以錄音人為單位瀏覽完成度
- 匯出目前篩選結果 JSON

