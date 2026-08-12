// 全域狀態
let gameState = {
    isPlaying: false,
    mode: 'zh', // 'zh' 或 'en'
    bookId: '',
    bookName: '',
    bookContent: '', // 原始文章內容 (包含換行 \n)
    totalTime: 300,  // 測驗時間 (秒)
    timeLeft: 300,
    timerId: null,
    
    // 即時統計
    totalKeys: 0,    // 總輸入擊數/字數
};

// 網頁載入時初始化
document.addEventListener('DOMContentLoaded', () => {
    loadBooks();
    loadSelectedBook();
    setupFileInput();
    setupTimeSelect();
    setupKeyboardListeners();
});

// 載入題庫選單
function loadBooks() {
    const select = document.getElementById('book-select');
    select.innerHTML = '';
    
    // 預設題庫
    for (let key in window.DEFAULT_BOOKS) {
        let book = window.DEFAULT_BOOKS[key];
        let opt = document.createElement('option');
        opt.value = "default_" + key;
        opt.textContent = book.name + " (" + (book.mode === 'zh' ? '中文' : '英文') + ")";
        select.appendChild(opt);
    }
    
    // 從 localStorage 載入自訂題庫
    let customBooks = JSON.parse(localStorage.getItem('custom_books') || '{}');
    for (let key in customBooks) {
        let book = customBooks[key];
        let opt = document.createElement('option');
        opt.value = "custom_" + key;
        opt.textContent = book.name + " (" + (book.mode === 'zh' ? '中文' : '英文') + ") [自訂]";
        select.appendChild(opt);
    }
}

// 選擇題庫並載入
function loadSelectedBook() {
    if (gameState.isPlaying) return;
    
    const select = document.getElementById('book-select');
    const val = select.value;
    if (!val) return;
    
    let book = null;
    if (val.startsWith("default_")) {
        let key = val.replace("default_", "");
        book = window.DEFAULT_BOOKS[key];
        gameState.bookId = key;
    } else {
        let key = val.replace("custom_", "");
        let customBooks = JSON.parse(localStorage.getItem('custom_books') || '{}');
        book = customBooks[key];
        gameState.bookId = key;
    }
    
    if (book) {
        gameState.bookName = book.name;
        
        // 統一規格：將預設 Windows 換行 \r\n 轉為 \n
        gameState.bookContent = book.content.replace(/\r\n/g, '\n');
        
        // 切換對應的模式
        setMode(book.mode);
        
        // 預覽題庫內容
        renderPreview();
    }
}

// 切換模式 (zh 或 en)
function setMode(mode) {
    gameState.mode = mode;
    
    // 按鈕高亮
    const btnZh = document.getElementById('btn-mode-zh');
    const btnEn = document.getElementById('btn-mode-en');
    
    if (mode === 'zh') {
        btnZh.classList.add('active');
        btnEn.classList.remove('active');
        document.getElementById('speed-label').textContent = "即時速度";
        document.getElementById('stat-speed').textContent = "0 字/分";
    } else {
        btnZh.classList.remove('active');
        btnEn.classList.add('active');
        document.getElementById('speed-label').textContent = "即時速度 (WPM)";
        document.getElementById('stat-speed').textContent = "0 WPM";
    }
}

// 題庫匯入處理
function setupFileInput() {
    document.getElementById('btn-import-trigger').addEventListener('click', () => {
        document.getElementById('file-import').click();
    });

    document.getElementById('file-import').addEventListener('change', (e) => {
        let file = e.target.files[0];
        if (!file) return;
        
        let reader = new FileReader();
        reader.onload = function(evt) {
            let text = evt.target.result.replace(/\r\n/g, '\n');
            // 檢查中文字元比例以判斷模式
            let zhCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
            let enCount = (text.match(/[a-zA-Z]/g) || []).length;
            let mode = (zhCount > enCount) ? 'zh' : 'en';
            
            // 依照使用者要求，為自訂匯入的段落加上對應的縮排
            let paragraphs = text.split('\n');
            let indentedParagraphs = paragraphs.map(p => {
                let trimmed = p.trim();
                if (trimmed.length === 0) return "";
                if (mode === 'zh') {
                    // 中文加 2 個全形空格
                    return "　　" + trimmed;
                } else {
                    // 英文加 5 個半形空格
                    return "     " + trimmed;
                }
            });
            text = indentedParagraphs.filter(p => p.length > 0).join('\n');
            
            let bookName = file.name.replace(/\.[^/.]+$/, ""); // 去掉副檔名
            let bookId = "custom_" + Date.now();
            
            let customBooks = JSON.parse(localStorage.getItem('custom_books') || '{}');
            customBooks[bookId] = {
                name: bookName,
                mode: mode,
                content: text
            };
            localStorage.setItem('custom_books', JSON.stringify(customBooks));
            
            loadBooks();
            document.getElementById('book-select').value = "custom_" + bookId;
            loadSelectedBook();
            
            alert("成功匯入題庫: " + bookName + " (" + (mode === 'zh' ? '中文' : '英文') + ")，已自動為段落補上縮排！");
        };
        reader.readAsText(file, 'UTF-8');
    });
}

// 選擇時間處理
function setupTimeSelect() {
    const timeSelect = document.getElementById('time-select');
    const customSection = document.getElementById('custom-time-section');
    
    timeSelect.addEventListener('change', () => {
        if (timeSelect.value === 'custom') {
            customSection.classList.remove('hidden');
        } else {
            customSection.classList.add('hidden');
        }
    });
}

// 渲染文章字元 Spans (中英文共用即時高亮邏輯)
function renderPreview() {
    const displayBox = document.getElementById('text-display');
    displayBox.innerHTML = '';
    
    const text = gameState.bookContent;
    for (let i = 0; i < text.length; i++) {
        let span = document.createElement('span');
        span.className = 'en-char';
        span.id = `char-${i}`;
        
        if (text[i] === '\n') {
            span.classList.add('char-newline');
            span.textContent = '\n';
        } else {
            span.textContent = text[i];
        }
        displayBox.appendChild(span);
    }
}

// 開始測驗
function startGame() {
    if (gameState.isPlaying) return;
    
    // 計算測驗時間
    const timeSelect = document.getElementById('time-select');
    let minutes = 5;
    if (timeSelect.value === 'custom') {
        minutes = parseFloat(document.getElementById('custom-time-input').value) || 1;
    } else {
        minutes = parseInt(timeSelect.value);
    }
    
    gameState.totalTime = minutes * 60;
    gameState.timeLeft = gameState.totalTime;
    
    // 初始化統計
    gameState.isPlaying = true;
    gameState.totalKeys = 0;
    
    // UI 控制
    document.getElementById('settings-section').classList.add('hidden');
    document.getElementById('custom-time-section').classList.add('hidden');
    document.getElementById('status-section').classList.remove('hidden');
    document.getElementById('typing-area').classList.remove('hidden');
    
    // 渲染打字區域
    renderPreview();
    
    // 清空並聚焦大輸入框
    const inputBox = document.getElementById('typing-input-box');
    inputBox.value = '';
    inputBox.focus();
    
    // 更新狀態列顯示
    updateStatusBar();
    
    // 啟動計時器
    gameState.timerId = setInterval(tick, 1000);
}

// 計時器每秒觸發
function tick() {
    gameState.timeLeft--;
    updateStatusBar();
    
    if (gameState.timeLeft <= 0) {
        stopGame(false); // 時間到結束
    }
}

// 結束測驗
function stopGame(userStopped) {
    if (!gameState.isPlaying) return;
    
    clearInterval(gameState.timerId);
    gameState.isPlaying = false;
    
    // 計算成績並彈出 Modal
    calculateAndShowResults();
}

// 重新開始
function restartGame() {
    closeResultModal();
    startGame();
}

// 實時字元打字高亮與比對 (中英文通用)
function handleTyping() {
    const inputBox = document.getElementById('typing-input-box');
    const inputVal = inputBox.value;
    const srcVal = gameState.bookContent;
    
    gameState.totalKeys = inputVal.length;
    
    // 遍歷所有原稿 spans
    for (let i = 0; i < srcVal.length; i++) {
        let span = document.getElementById(`char-${i}`);
        if (!span) continue;
        
        if (i < inputVal.length) {
            if (inputVal[i] === srcVal[i]) {
                span.className = span.classList.contains('char-newline') ? 'en-char char-newline correct' : 'en-char correct';
            } else {
                span.className = span.classList.contains('char-newline') ? 'en-char char-newline incorrect' : 'en-char incorrect';
            }
        } else if (i === inputVal.length) {
            span.className = span.classList.contains('char-newline') ? 'en-char char-newline current' : 'en-char current';
            // 滾動使當前游標處置中
            span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            span.className = span.classList.contains('char-newline') ? 'en-char char-newline' : 'en-char';
        }
    }
    
    // 若全部打完，自動結束
    if (inputVal.length >= srcVal.length) {
        stopGame(false);
    }
    
    updateStatusBar();
}

// 狀態列更新
function updateStatusBar() {
    // 剩餘時間
    const m = Math.floor(gameState.timeLeft / 60);
    const s = Math.floor(gameState.timeLeft % 60);
    document.getElementById('stat-time').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    
    // 實際經過時間 (分鐘)
    let timeElapsedMin = (gameState.totalTime - gameState.timeLeft) / 60;
    if (timeElapsedMin <= 0.01) timeElapsedMin = 0.01;
    
    const inputBox = document.getElementById('typing-input-box');
    const inputVal = inputBox.value;
    const srcVal = gameState.bookContent;
    
    // 即時計算正確字數
    let correctCount = 0;
    let minLen = Math.min(inputVal.length, srcVal.length);
    for (let i = 0; i < minLen; i++) {
        if (inputVal[i] === srcVal[i]) correctCount++;
    }
    
    document.getElementById('stat-keys').textContent = inputVal.length;
    
    if (gameState.mode === 'zh') {
        // 中文即時速度 = 輸入字數 / 時間
        let speed = Math.round(inputVal.length / timeElapsedMin);
        document.getElementById('stat-speed').textContent = `${speed} 字/分`;
        
        // 估算錯誤次數 (錯打字數 + 多打字數)
        let rawErrors = 0;
        for (let i = 0; i < minLen; i++) {
            if (inputVal[i] !== srcVal[i]) rawErrors++;
        }
        if (inputVal.length > srcVal.length) {
            rawErrors += (inputVal.length - srcVal.length);
        }
        document.getElementById('stat-errors').textContent = rawErrors;
    } else {
        // 英文即時速度 (WPM)
        // WPM = (總字元 - 錯字*50) / 5 / 分鐘
        let rawErrors = 0;
        for (let i = 0; i < minLen; i++) {
            if (inputVal[i] !== srcVal[i]) rawErrors++;
        }
        if (inputVal.length > srcVal.length) {
            rawErrors += (inputVal.length - srcVal.length);
        }
        
        let wpm = Math.round(((inputVal.length - rawErrors * 50) / 5) / timeElapsedMin);
        if (wpm < 0) wpm = 0;
        
        document.getElementById('stat-speed').textContent = `${wpm} WPM`;
        document.getElementById('stat-errors').textContent = Math.round(rawErrors / 5);
    }
    
    // 進度
    let progress = 0;
    if (srcVal.length > 0) {
        progress = Math.min(100, Math.round((inputVal.length / srcVal.length) * 100));
    }
    document.getElementById('stat-progress').style.width = `${progress}%`;
}

// 鍵盤監聽設定
function setupKeyboardListeners() {
    const inputBox = document.getElementById('typing-input-box');
    
    inputBox.addEventListener('keydown', function(e) {
        if (!gameState.isPlaying) return;
        
        // 阻擋 Tab 鍵，改為插入縮排空格
        if (e.key === 'Tab') {
            e.preventDefault();
            let start = this.selectionStart;
            let end = this.selectionEnd;
            let val = this.value;
            
            let spaces = "";
            if (gameState.mode === 'zh') {
                spaces = "　　"; // 中文: 2個全形空格
            } else {
                spaces = "     "; // 英文: 5個半形空格
            }
            
            this.value = val.substring(0, start) + spaces + val.substring(end);
            this.selectionStart = this.selectionEnd = start + spaces.length;
            handleTyping();
        }
    });
    
    inputBox.addEventListener('input', () => {
        if (!gameState.isPlaying) return;
        handleTyping();
    });
}

// 安全地 escape HTML 特殊字元
function escapeHtml(text) {
    if (!text) return "";
    return text
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

/* ==========================================
   Damerau-Levenshtein 鄰字交換演算法 (中文全局)
   ========================================== */
function alignChineseGlobal(source, input) {
    let M = source.length;
    let N = input.length;
    
    // 建立 DP 矩陣
    let dp = Array(M + 1).fill(null).map(() => Array(N + 1).fill(0));
    for (let i = 0; i <= M; i++) dp[i][0] = i;
    for (let j = 0; j <= N; j++) dp[0][j] = j;
    
    for (let i = 1; i <= M; i++) {
        for (let j = 1; j <= N; j++) {
            let cost = (source[i-1] === input[j-1]) ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i-1][j] + 1,       // Deletion (漏打)
                dp[i][j-1] + 1,       // Insertion (多打)
                dp[i-1][j-1] + cost   // Substitution (錯打)
            );
            
            // Transposition (相鄰交換/顛倒)
            if (i > 1 && j > 1 && source[i-1] === input[j-2] && source[i-2] === input[j-1]) {
                dp[i][j] = Math.min(dp[i][j], dp[i-2][j-2] + 1);
            }
        }
    }
    
    // 回溯重建全局對齊路徑
    let i = M, j = N;
    let path = [];
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && source[i-1] === input[j-1]) {
            path.push({ type: 'match', srcChar: source[i-1], inpChar: input[j-1] });
            i--;
            j--;
        } else {
            let score = dp[i][j];
            
            // 顛倒字
            if (i > 1 && j > 1 && source[i-1] === input[j-2] && source[i-2] === input[j-1] && score === dp[i-2][j-2] + 1) {
                // 將顛倒的兩字拆為一個 trans 標誌放入路徑，並對應兩個原稿字元
                path.push({ type: 'trans', srcChar: source[i-2] + source[i-1], inpChar: input[j-2] + input[j-1] });
                i -= 2;
                j -= 2;
                continue;
            }
            
            // 漏打字 (Deletion)
            if (i > 0 && score === dp[i-1][j] + 1) {
                path.push({ type: 'del', srcChar: source[i-1], inpChar: "" });
                i--;
                continue;
            }
            
            // 多打字 (Insertion)
            if (j > 0 && score === dp[i][j-1] + 1) {
                path.push({ type: 'ins', srcChar: "", inpChar: input[j-1] });
                j--;
                continue;
            }
            
            // 錯打字 (Substitution)
            if (i > 0 && j > 0 && score === dp[i-1][j-1] + 1) {
                path.push({ type: 'sub', srcChar: source[i-1], inpChar: input[j-1] });
                i--;
                j--;
                continue;
            }
            
            // Fallback
            if (i > 0) {
                path.push({ type: 'del', srcChar: source[i-1], inpChar: "" });
                i--;
            } else if (j > 0) {
                path.push({ type: 'ins', srcChar: "", inpChar: input[j-1] });
                j--;
            }
        }
    }
    
    path.reverse();
    return path;
}

/* ==========================================
   LCS 單字級對齊演算法 (英文)
   ========================================== */
function alignEnglishWords(sourceText, inputText) {
    let sourceWords = sourceText.match(/\S+\s*/g) || [];
    let inputWords = inputText.match(/\S+\s*/g) || [];
    
    let M = sourceWords.length;
    let N = inputWords.length;
    
    let dp = Array(M + 1).fill(null).map(() => Array(N + 1).fill(0));
    for (let i = 0; i <= M; i++) dp[i][0] = i;
    for (let j = 0; j <= N; j++) dp[0][j] = j;
    
    for (let i = 1; i <= M; i++) {
        for (let j = 1; j <= N; j++) {
            let cost = (sourceWords[i-1] === inputWords[j-1]) ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i-1][j] + 1,       // Deletion
                dp[i][j-1] + 1,       // Insertion
                dp[i-1][j-1] + cost   // Substitution
            );
        }
    }
    
    let i = M, j = N;
    let path = [];
    let errors = 0;
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && sourceWords[i-1] === inputWords[j-1]) {
            path.push({ type: 'match', word: sourceWords[i-1] });
            i--;
            j--;
        } else {
            let score = dp[i][j];
            if (i > 0 && score === dp[i-1][j] + 1) {
                path.push({ type: 'del', word: sourceWords[i-1] });
                errors++;
                i--;
            } else if (j > 0 && score === dp[i][j-1] + 1) {
                path.push({ type: 'ins', word: inputWords[j-1] });
                errors++;
                j--;
            } else if (i > 0 && j > 0 && score === dp[i-1][j-1] + 1) {
                path.push({ type: 'sub', orig: sourceWords[i-1], input: inputWords[j-1] });
                errors++;
                i--;
                j--;
            } else {
                if (i > 0) {
                    path.push({ type: 'del', word: sourceWords[i-1] });
                    errors++;
                    i--;
                } else if (j > 0) {
                    path.push({ type: 'ins', word: inputWords[j-1] });
                    errors++;
                    j--;
                }
            }
        }
    }
    
    path.reverse();
    
    let alignedHtml = "";
    path.forEach(item => {
        if (item.type === 'match') {
            alignedHtml += `<span class="char-match">${escapeHtml(item.word)}</span>`;
        } else if (item.type === 'sub') {
            alignedHtml += `<span class="char-sub" title="原稿: ${escapeHtml(item.orig)}">${escapeHtml(item.input)}</span>`;
        } else if (item.type === 'ins') {
            alignedHtml += `<span class="char-ins">${escapeHtml(item.word)}</span>`;
        } else if (item.type === 'del') {
            alignedHtml += `<span class="char-del">${escapeHtml(item.word)}</span>`;
        }
    });
    
    return {
        errors: errors,
        alignedHtml: alignedHtml
    };
}

/* ==========================================
   計算成績並顯示結果 Modal
   ========================================== */
function calculateAndShowResults() {
    // 隱藏打字區與狀態列，回到初始
    document.getElementById('typing-area').classList.add('hidden');
    document.getElementById('status-section').classList.add('hidden');
    document.getElementById('settings-section').classList.remove('hidden');
    
    // 計算測驗實際時間 (分鐘)
    let timeElapsedSec = gameState.totalTime - gameState.timeLeft;
    if (timeElapsedSec <= 1) timeElapsedSec = 1;
    let timeElapsedMin = timeElapsedSec / 60;
    
    document.getElementById('res-duration').textContent = timeElapsedMin.toFixed(2);
    document.getElementById('res-book-name').textContent = gameState.bookName;
    
    const compareBox = document.getElementById('compare-result-box');
    compareBox.innerHTML = '';
    
    const inputBox = document.getElementById('typing-input-box');
    let finalInputText = inputBox.value;
    
    if (gameState.mode === 'zh') {
        // 中文結算
        document.getElementById('result-zh').classList.remove('hidden');
        document.getElementById('result-en').classList.add('hidden');
        
        // 1. 全局對齊比對
        let globalPath = alignChineseGlobal(gameState.bookContent, finalInputText);
        
        // 2. 依照原稿每一列 (\n) 將對齊路徑切分成各列的統計
        // 我們將原稿依 \n 拆分成列。每一列可能包含 \n。
        // 原稿拆分
        let sourceLines = gameState.bookContent.split('\n');
        
        // 統計各列結果的容器
        let linesResults = [];
        let currentLinePath = [];
        let lineIdx = 0;
        
        globalPath.forEach(node => {
            currentLinePath.push(node);
            
            // 判斷是否為原稿中的換行符
            // 注意：如果原稿字元中包含 \n，或者是顛倒字中包含 \n，這都代表此列結束
            if (node.srcChar.includes('\n')) {
                linesResults.push(analyzeLinePath(currentLinePath, sourceLines[lineIdx] ? sourceLines[lineIdx].length : 0));
                currentLinePath = [];
                lineIdx++;
            }
        });
        
        // 把剩餘的節點歸入最後一列
        if (currentLinePath.length > 0 || linesResults.length === 0) {
            linesResults.push(analyzeLinePath(currentLinePath, sourceLines[lineIdx] ? sourceLines[lineIdx].length : 0));
        }
        
        // 3. 匯總各列結果
        let totalOrigChars = 0;
        let totalMatched = 0;
        let totalErrors = 0;
        let totalSub = 0;
        let totalIns = 0;
        let totalDel = 0;
        let totalTrans = 0;
        let sumNetChars = 0; // 淨字數之總和
        let combinedHtml = "";
        
        linesResults.forEach((res, idx) => {
            // 每列淨字數 = 該列正確字數 - (錯誤次數 * 0.5)
            // 淨字數最低為 0
            let net = Math.max(0, res.matched - res.errors * 0.5);
            sumNetChars += net;
            
            totalOrigChars += res.sourceLength;
            totalMatched += res.matched;
            totalErrors += res.errors;
            totalSub += res.sub;
            totalIns += res.ins;
            totalDel += res.del;
            totalTrans += res.trans;
            
            combinedHtml += `<div class="zh-aligned-line">[列 ${idx+1}] ${res.alignedHtml}</div>`;
        });
        
        compareBox.innerHTML = combinedHtml;
        
        // 錯誤率 = 總錯誤次數 ÷ 應輸入字數 (總原稿字數)
        // 應輸入字數過濾掉換行符以求精確
        let pureOrigCharsLength = gameState.bookContent.replace(/\n/g, '').length;
        if (pureOrigCharsLength === 0) pureOrigCharsLength = 1;
        
        let errRate = totalErrors / pureOrigCharsLength;
        let isPass = errRate < 0.1; // 錯誤率 < 10%
        
        // 每分鐘平均字數 = 每列淨字數之總和 ÷ 測驗時間 (分鐘)
        let avgSpeed = sumNetChars / timeElapsedMin;
        if (isNaN(avgSpeed) || !isFinite(avgSpeed)) {
            avgSpeed = 0.0;
        }
        
        // 渲染統計結果
        document.getElementById('res-zh-speed').textContent = avgSpeed.toFixed(1);
        document.getElementById('res-zh-err-rate').textContent = (errRate * 100).toFixed(1) + "%";
        
        const statusEl = document.getElementById('res-zh-status');
        if (isPass) {
            statusEl.textContent = "合格";
            statusEl.className = "card-unit badge-success";
        } else {
            statusEl.textContent = "不予計算 (錯誤率 ≧ 10%)";
            statusEl.className = "card-unit badge-fail";
        }
        
        document.getElementById('res-zh-chars').textContent = `${pureOrigCharsLength} / ${totalMatched}`;
        document.getElementById('res-zh-errors').textContent = `${totalErrors} (${(totalErrors * 0.5).toFixed(1)})`;
        
        // 錯誤類型細項
        document.getElementById('break-sub').textContent = totalSub;
        document.getElementById('break-ins').textContent = totalIns;
        document.getElementById('break-del').textContent = totalDel;
        document.getElementById('break-trans').textContent = totalTrans;
        
    } else {
        // 英文結算
        document.getElementById('result-zh').classList.add('hidden');
        document.getElementById('result-en').classList.remove('hidden');
        
        let res = alignEnglishWords(gameState.bookContent, finalInputText);
        compareBox.innerHTML = res.alignedHtml;
        
        let totalKeys = finalInputText.length;
        let penalty = res.errors * 50;
        
        // WPM = (總擊數 - 錯誤次數*50) / 5 / 測驗時間
        let wpm = ((totalKeys - penalty) / 5) / timeElapsedMin;
        if (isNaN(wpm) || !isFinite(wpm) || wpm < 0) {
            wpm = 0.0;
        }
        
        document.getElementById('res-en-wpm').textContent = wpm.toFixed(1);
        document.getElementById('res-en-keys').textContent = totalKeys;
        document.getElementById('res-en-errors').textContent = res.errors;
        document.getElementById('res-en-penalty').textContent = penalty;
    }
    
    // 顯示 Modal
    document.getElementById('result-modal').classList.remove('hidden');
}

// 輔助函數：分析單列的對齊路徑，計算該列的統計指標與生成高亮 HTML
function analyzeLinePath(linePath, sourceLength) {
    let matched = 0;
    let sub = 0;
    let ins = 0;
    let del = 0;
    let trans = 0;
    let alignedHtml = "";
    
    linePath.forEach(node => {
        // 忽略單獨的 \n 節點以求精確字數統計
        let isSrcNewline = node.srcChar === '\n';
        let isInpNewline = node.inpChar === '\n';
        
        if (node.type === 'match') {
            if (!isSrcNewline) {
                alignedHtml += `<span class="char-match">${escapeHtml(node.srcChar)}</span>`;
                matched++;
            } else {
                alignedHtml += `<span class="char-match char-newline">\n</span>`;
            }
        } else if (node.type === 'sub') {
            if (!isSrcNewline && !isInpNewline) {
                alignedHtml += `<span class="char-sub" title="原稿: ${escapeHtml(node.srcChar)}">${escapeHtml(node.inpChar)}</span>`;
                sub++;
            } else if (isSrcNewline) {
                alignedHtml += `<span class="char-sub char-newline" title="原稿: 換行">${escapeHtml(node.inpChar)}</span>`;
                sub++;
            } else {
                alignedHtml += `<span class="char-sub" title="原稿: ${escapeHtml(node.srcChar)}">↵</span>`;
                sub++;
            }
        } else if (node.type === 'ins') {
            if (!isInpNewline) {
                alignedHtml += `<span class="char-ins">${escapeHtml(node.inpChar)}</span>`;
                ins++;
            } else {
                alignedHtml += `<span class="char-ins">↵</span>`;
                ins++;
            }
        } else if (node.type === 'del') {
            if (!isSrcNewline) {
                alignedHtml += `<span class="char-del">${escapeHtml(node.srcChar)}</span>`;
                del++;
            } else {
                alignedHtml += `<span class="char-del char-newline">\n</span>`;
                del++; // 漏打換行符也計入漏打字
            }
        } else if (node.type === 'trans') {
            // 顛倒字：包含兩個字元
            alignedHtml += `<span class="char-trans">${escapeHtml(node.inpChar)}</span>`;
            trans++;
            matched += 2; // 這兩個字都對，只是顛倒，算正確字 2 個
        }
    });
    
    let errors = sub + ins + del + trans;
    
    return {
        sourceLength: sourceLength,
        errors: errors,
        matched: matched,
        sub: sub,
        ins: ins,
        del: del,
        trans: trans,
        alignedHtml: alignedHtml
    };
}

// 關閉結算 Modal
function closeResultModal() {
    document.getElementById('result-modal').classList.add('hidden');
    renderPreview(); // 重置顯示區
}
