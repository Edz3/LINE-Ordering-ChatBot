# LINE Ordering ChatBot (LINE 點餐機器人)

這是一個基於 Google Apps Script (GAS) 開發的 LINE 點餐機器人。
專為群組點餐設計，能夠自動辨識群組/房間 ID，將不同群組的訂單分流到 Google Sheets 的不同工作表中。支援智慧參數解析（自動判斷冰塊、甜度、價格、備註），並整合了簡單的菜單查詢功能。

## ✨ 主要功能

*   **📝 智慧點餐**：
    *   輸入 `+1 珍奶 半糖少冰 50` 即可自動解析品項、甜度、冰塊與價格。
    *   參數順序不拘，例如 `+1 50嵐 50元 少冰` 也能通。
    *   支援多行同時點餐。
*   **📊 訂單管理**：
    *   **分流紀錄**：依據 LINE 群組 ID 自動建立並切換對應的 Google Sheet 分頁 (`worksheets`)。
    *   **統計結單**：輸入 `結單` 或 `統計` 即可查看目前總杯數與名單。
    *   **刪除功能**：支援 `取消` (刪除自己最後一筆)、`刪除 N` (刪除指定編號) 與 `清空` (刪除全部分頁資料)。
*   **🔎 菜單查詢**：
    *   輸入 `菜單 店家名` (例如 `菜單 50嵐`)，機器人會回傳 Google 圖片搜尋與地圖連結，方便大家找菜單。
*   **👤 自動辨識成員**：
    *   整合 LINE Group/Room Member API，即使未加機器人好友，也能精準抓取群組內成員的顯示名稱 (Display Name)。

## 🚀 快速指令表

| 功能 | 指令範例 | 說明 |
| :--- | :--- | :--- |
| **點餐** | `+1 珍奶 半糖少冰 50` | `+1` 開頭，後接品項與參數 (空格分隔) |
| **加備註** | `+1 綠茶 30 加椰果` | 未被辨識為甜度/冰塊/價格的文字會被當作備註 |
| **查菜單** | `菜單 50嵐` | 搜尋該店家的菜單圖片與地圖 |
| **統計** | `統計` / `結單` | 列出目前所有訂單與總金額 |
| **取消** | `取消` | 移除**自己**點的最後一杯 |
| **指定刪除** | `刪除 5` | 移除訂單列表中的第 5 筆 |
| **清空** | `清空` / `清除` | **(慎用)** 刪除該群組的所有訂單資料 |
| **說明** | `說明` | 顯示指令教學 |

## 🛠️ 安裝與部署 (Deployment)

### 1. 建立 Google Sheets
1. 建立一個新的 Google Sheet。
2. 記下網址中的 `Spreadsheet ID` (例如 `1A2B3C...` 那一長串)。

### 2. 建立 Google Apps Script 專案
1. 前往 Google Sheet 的 `擴充功能` > `Apps Script`。
2. 將 `line_ordering_bot.gs` 的內容複製貼上到編輯器中。
3. 修改程式碼上方的設定變數：
   ```javascript
   const CHANNEL_ACCESS_TOKEN = '您的_CHANNEL_ACCESS_TOKEN';
   const SPREADSHEET_ID = '您的_GOOGLE_SHEET_ID';
   ```

### 3. 設定 LINE Messaging API
1. 前往 [LINE Developers Console](https://developers.line.biz/)。
2. 建立一個 Messaging API Channel。
3. 在 `Messaging API` 頁籤中產生 `Channel Access Token`，填入程式碼中。
4. 關閉 `Auto-reply messages` (自動回應) 與 `Greeting messages` (加入好友問候)，以免干擾機器人運作。

### 4. 部署為 Web App
1. 在 GAS 編輯器右上角點擊 `部署 (Deploy)` > `新增部署 (New deployment)`。
2. 選擇類型：`網頁應用程式 (Web app)`。
3. 設定如下：
   *   **執行身分 (Execute as)**: `我 (Me)`
   *   **誰可以存取 (Who has access)**: `任何人 (Anyone)` (這很重要，否則 LINE 無法呼叫)
4. 點擊部署，複製產生的 `Web App URL`。

### 5. 設定 Webhook
1. 回到 LINE Developers Console 的 `Messaging API` 設定頁面。
2. 將 `Webhook URL` 設定為剛剛複製的 Web App URL。
3. 開啟 `Use webhook` 功能。
4. 點擊 `Verify` 測試連線是否成功。

## ⚠️ 注意事項
*   **群組/房間名稱**：由於 LINE API 隱私限制，機器人**無法直接取得群組名稱**，因此 Google Sheet 的分頁名稱會是 `Group ID` 或 `Room ID`。建議您可以手動重新命名 Sheet 分頁，程式碼會優先尋找既有分頁。
*   **圖片搜尋**：菜單查詢功能是產生 Google 搜尋連結，點擊後會開啟瀏覽器。

## License
MIT License
