// --- 設定區 ---
const CHANNEL_ACCESS_TOKEN = '您的_CHANNEL_ACCESS_TOKEN'; // 
const SPREADSHEET_ID = '您的_GOOGLE_SHEET_ID'; // 
// --- 主程式開始 ---

function doPost(e) {
  if (!e || !e.postData) {
    return ContentService.createTextOutput("No Data").setMimeType(ContentService.MimeType.TEXT);
  }

  try {
    const json = JSON.parse(e.postData.contents);
    const events = json.events;
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        handleMessage(event);
      }
    }
  } catch (err) {
    // 避免 JSON 解析錯誤導致崩潰
  }

  return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
}

function handleMessage(event) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;
  const source = event.source; // 取得完整來源資料 (修復名字抓取用)
  
  // 關鍵邏輯：根據來源 (群組ID 或 個人ID) 決定寫入哪個工作表
  // 這樣不同群組的訂單才不會混在一起
  const contextId = source.groupId || source.roomId || source.userId;

  // --- 管理指令區 ---

  if (msg === '結單' || msg === '統計') {
    sendSummary(replyToken, contextId);
    return;
  }

  if (msg === '清除' || msg === '清空') {
    clearOrders(replyToken, contextId);
    return;
  }

  if (msg === '取消' || msg === '收回' || msg === '刪除') {
    deleteLastOrder(replyToken, source, contextId);
    return;
  }

  if (msg.startsWith('刪除') || msg.startsWith('移除')) {
    const match = msg.match(/^(刪除|移除)\s*(\d+)$/);
    if (match) {
      deleteSpecificOrder(replyToken, parseInt(match[2]), contextId);
      return;
    }
  }

  if (msg === '說明' || msg === '點餐說明') {
    sendHelp(replyToken);
    return;
  }

  // --- 新增：菜單搜尋功能 ---
  if (msg.startsWith('菜單')) {
    const shopName = msg.replace('菜單', '').trim();
    if (shopName) {
      // 產生 Google 圖片搜尋連結 (&tbm=isch 代表搜尋圖片)
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(shopName + ' 菜單')}&tbm=isch`;
      // 產生 Google Maps 搜尋連結
      const mapUrl = `https://www.google.com/maps/search/${encodeURIComponent(shopName)}`;
      
      const replyMsg = `🔎 幫你找「${shopName}」的資訊：\n\n📜 圖片菜單：\n${searchUrl}\n\n📍 附近店家：\n${mapUrl}`;
      replyLine(replyToken, replyMsg);
    } else {
      replyLine(replyToken, "❓ 想找哪間店的菜單呢？\n請輸入：菜單 店家名稱\n範例：菜單 50嵐");
    }
    return;
  }

  // --- 點餐邏輯區 ---
  
  const lines = msg.split('\n');
  let successMessages = [];
  let hasOrder = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('+1') || trimmedLine.startsWith('＋1')) {
      // 傳遞 source 而不是 userId，以便 getUserProfile 使用
      const resultMsg = processSingleOrder(trimmedLine, source, contextId);
      successMessages.push(resultMsg);
      hasOrder = true;
    }
  }

  if (hasOrder) {
    replyLine(replyToken, successMessages.join('\n'));
  }
}

// --- 核心邏輯區 ---

function processSingleOrder(line, source, contextId) {
  const userName = getUserProfile(source); // 使用強化的抓名字功能
  const rawParts = line.replace(/^(\+|＋)1\s*/, '').split(/\s+/);
  
  if (rawParts.length < 1) {
    return "⚠️ 格式錯誤：未輸入品項";
  }

  // 從品項名稱中提取價格 (處理 "品項$50" 或 "品項$50備註" 格式)
  let item = rawParts[0];
  let itemPrice = "";
  let itemExtraNote = ""; // 價格後面黏著的備註
  
  // 支援 $35 結尾，或 $35 後接任意非數字字元 (中文、-、/ 等)
  const itemPriceMatch = item.match(/[\$＄](\d+)(\D.*)?$/);
  if (itemPriceMatch) {
    itemPrice = itemPriceMatch[1];
    if (itemPriceMatch[2]) {
      // 移除開頭的分隔符 (-/、空白等)
      itemExtraNote = itemPriceMatch[2].replace(/^[-\/、\s]+/, '');
    }
    item = item.replace(/[\$＄]\d+(\D.*)?$/, ''); // 移除品項尾部的價格和備註
  }
  
  const others = rawParts.slice(1);
  
  let sugar = "";
  let ice = "";
  let price = itemPrice; // 優先使用從品項名稱中提取的價格
  let notesArr = [];

  const sugarKeys = "全糖|正常糖|標準糖|少糖|半糖|微糖|無糖|去糖|一分糖|二分糖|\\d+分糖|正常|標準";
  const iceKeys = "正常冰|多冰|少冰|微冰|去冰|完全去冰|常溫|熱|溫|熱飲|溫熱|\\d+分冰";

  const strictSugar = new RegExp(`^(${sugarKeys})$`);
  const strictIce = new RegExp(`^(${iceKeys})$`);
  const strictPrice = /^[\$＄]?\d+$/; // 支援 $ 符號
  
  const searchSugar = new RegExp(`(${sugarKeys})`);
  const searchIce = new RegExp(`(${iceKeys})`);
  const searchPrice = /[\$＄](\d+)/; // 混合模式用的價格搜尋

  others.forEach(part => {
    // 1. 價格 (嚴格模式)
    if (price === "" && strictPrice.test(part)) { 
      price = part.replace(/^[\$＄]/, ''); 
      return; 
    }
    // 2. 甜度 (嚴格模式)
    if (sugar === "" && strictSugar.test(part)) { sugar = part; return; }
    // 3. 冰塊 (嚴格模式)
    if (ice === "" && strictIce.test(part)) { ice = part; return; }

    // 4. 混合拆解
    let tempPart = part;
    let extracted = false;

    // 抓甜度
    let sMatch = tempPart.match(searchSugar);
    if (sugar === "" && sMatch) {
      sugar = sMatch[0];
      tempPart = tempPart.replace(sMatch[0], "");
      extracted = true;
    }

    // 抓冰塊
    let iMatch = tempPart.match(searchIce);
    if (ice === "" && iMatch) {
      ice = iMatch[0];
      tempPart = tempPart.replace(iMatch[0], "");
      extracted = true;
    }

    // 抓價格 (新增：混合模式下允許抓 $55)
    let pMatch = tempPart.match(searchPrice);
    if (price === "" && pMatch) {
      price = pMatch[1];
      tempPart = tempPart.replace(pMatch[0], "");
      extracted = true;
    }

    // 5. 備註處理
    if (extracted) {
      // 移除剩餘的分割符號 (如 /, 空白)
      tempPart = tempPart.replace(/^[\/\s]+|[\/\s]+$/g, '');
      if (tempPart.length > 0) {
        addNoteSafely(notesArr, tempPart);
      }
    } else {
      addNoteSafely(notesArr, part);
    }
  });

  // 將品項價格後面的備註加入 (如 $35-代訂淑美姊 中的 代訂淑美姊)
  if (itemExtraNote) {
    addNoteSafely(notesArr, itemExtraNote);
  }

  const note = notesArr.join(' ');
  const date = new Date();
  
  // 這裡使用您指定的 contextId 來開啟/建立對應的分頁
  const sheet = getOrCreateSheet(contextId);
  sheet.appendRow([date, userName, item, sugar, ice, price, note]);

  let successMsg = `✅ ${userName}：${item}`;
  const opts = [sugar, ice].filter(Boolean).join('/');
  if (opts) successMsg += ` (${opts})`;
  if (price) successMsg += ` $${price}`;
  if (note) successMsg += ` [${note}]`;
  
  return successMsg;
}

function addNoteSafely(arr, text) {
  if (text.startsWith('+') || text.startsWith('＋')) {
    arr.push('加' + text.substring(1));
  } else if (text.startsWith('=')) {
    arr.push("'" + text);
  } else {
    arr.push(text);
  }
}

// --- 功能函式區 ---

function deleteLastOrder(replyToken, source, contextId) {
  const userName = getUserProfile(source); // 改用 source 抓名字
  const sheet = getOrCreateSheet(contextId);
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    replyLine(replyToken, "沒東西可以刪喔！");
    return;
  }
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][1] === userName) {
      const realRowIndex = i + 2;
      const item = sheet.getRange(realRowIndex, 3).getValue();
      sheet.deleteRow(realRowIndex);
      replyLine(replyToken, `🗑️ 已刪除 ${userName} 最後一筆：${item}`);
      return;
    }
  }
  replyLine(replyToken, `找不到 ${userName} 的點餐紀錄。`);
}

function deleteSpecificOrder(replyToken, number, contextId) {
  const sheet = getOrCreateSheet(contextId);
  const lastRow = sheet.getLastRow();
  const targetRow = number + 1;
  
  if (targetRow > lastRow || number < 1) {
    replyLine(replyToken, `⚠️ 找不到編號 ${number}，請先看「統計」。`);
    return;
  }
  
  const rowData = sheet.getRange(targetRow, 1, 1, 7).getValues()[0];
  sheet.deleteRow(targetRow);
  replyLine(replyToken, `🗑️ 已刪除編號 ${number}：${rowData[2]} (${rowData[1]})`);
}

function sendSummary(replyToken, contextId) {
  const sheet = getOrCreateSheet(contextId);
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    replyLine(replyToken, "目前沒有訂單喔！");
    return;
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  let totalPrice = 0;
  let summaryText = "📋 本群組訂單統計：\n------------------\n";
  let count = 1;

  data.forEach(row => {
    const p = parseInt(row[5]) || 0;
    const n = row[6] ? ` (${row[6]})` : '';
    const opt = [row[3], row[4]].filter(Boolean).join('/');
    
    totalPrice += p;
    summaryText += `${count}. ${row[2]} ${opt} $${p}${n} -${row[1]}\n`;
    count++;
  });

  summaryText += "------------------\n";
  summaryText += `💰 總金額：$${totalPrice}\n`;
  summaryText += `🥤 總杯數：${data.length} 杯`;

  replyLine(replyToken, summaryText);
}

function clearOrders(replyToken, contextId) {
  const sheet = getOrCreateSheet(contextId);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
    replyLine(replyToken, "🗑️ 訂單已全數清空！");
  } else {
    replyLine(replyToken, "已經是空的囉！");
  }
}

function sendHelp(replyToken) {
  const helpText = "🥤 點餐機器人：\n\n" +
    "1️⃣ 點餐格式 (可一次多行)：\n" +
    "+1 品項 甜度 冰塊 價格 備註\n" +
    "範例：\n" +
    "+1 綠茶 無糖微冰 30\n" +
    "+1 珍奶 半糖少冰 55 加布丁\n\n" +
    "2️⃣ 找菜單：\n輸入「菜單 店家名稱」\n範例：菜單 50嵐\n\n" +
    "3️⃣ 管理指令：\n" +
    "• 「取消」：刪除你最後一杯\n" +
    "• 「刪除 5」：刪除第5筆\n" +
    "• 「統計/結單」：查看目前訂單\n" + 
    "• 「清除」：刪除所有舊訂單";
  replyLine(replyToken, helpText);
}

// 根據 contextId (Group/User ID) 取得或建立對應的分頁
function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['時間', '姓名', '品項', '甜度', '冰塊', '價格', '備註']);
  }
  return sheet;
}

// 強化版抓名字 (支援 1對1 與 群組，含未加好友)
function getUserProfile(source) {
  try {
    let url = '';
    // 根據不同來源決定 API 網址
    if (source.type === 'group') {
      // 這是關鍵：使用 Group Member API，只要機器人在群組就能抓到名字
      url = `https://api.line.me/v2/bot/group/${source.groupId}/member/${source.userId}`;
    } else if (source.type === 'room') {
      url = `https://api.line.me/v2/bot/room/${source.roomId}/member/${source.userId}`;
    } else {
      // 1對1
      url = `https://api.line.me/v2/bot/profile/${source.userId}`;
    }

    const options = {
      'method': 'get',
      'headers': { 'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN },
      'muteHttpExceptions': true // 防止 1對1 未加好友拿到 404 時崩潰
    };
    
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText()).displayName;
    } else {
      return "某位同事"; // 真的抓不到時的回退值
    }
  } catch (e) {
    return "某位同事";
  }
}

function replyLine(replyToken, text) {
  try {
    const url = 'https://api.line.me/v2/bot/message/reply';
    const payload = {
      'replyToken': replyToken,
      'messages': [{ 'type': 'text', 'text': text }]
    };
    const options = {
      'method': 'post',
      'headers': { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN },
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    // 這裡通常是 Token 失效或 ReplyToken 過期，無法處理
  }
}