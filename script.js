const canvas = document.getElementById('rouletteCanvas');
const ctx = canvas.getContext('2d');
const actionBtn = document.getElementById('actionBtn');
const resultPopup = document.getElementById('resultPopup');
const popupResultText = document.getElementById('popupResultText');
const popupSubText = document.getElementById('popupSubText');

const itemList = document.getElementById('itemList');
const addBtn = document.getElementById('addBtn');
const inputMessage = document.getElementById('inputMessage');
const themeToggleBtn = document.getElementById('themeToggleBtn');

// 설정 패널 엘리먼트 바인딩
const currentRerollCostEl = document.getElementById('currentRerollCost');
const resetRerollBtn = document.getElementById('resetRerollBtn');
const chatCommandInp = document.getElementById('chatCommand'); 
const bgmVolumeInp = document.getElementById('bgmVolume'); 
const volumeValEl = document.getElementById('volumeVal');   
const cheesePerCountInp = document.getElementById('cheesePerCount');
const rerollBaseCostInp = document.getElementById('rerollBaseCost');
const rerollStepCostInp = document.getElementById('rerollStepCost');

// 치지직 연동 모달 창 및 사이드바 버튼 엘리먼트 바인딩
const connectModal = document.getElementById('connectModal');
const openConnectModalBtn = document.getElementById('openConnectModalBtn');
const closeConnectModalBtn = document.getElementById('closeConnectModalBtn');

// 💡 [변경] 스크립트 바인딩 변수 개조
const chzzkClientIdInp = document.getElementById('chzzkClientId');
const chzzkClientSecretInp = document.getElementById('chzzkClientSecret');
const chzzkChannelIdInp = document.getElementById('chzzkChannelId');
const chzzkConnectBtn = document.getElementById('chzzkConnectBtn');
const connectionStatusEl = document.getElementById('connectionStatus');
const sidebarStatusBadge = document.getElementById('sidebarStatusBadge'); 

// ==========================================================
// 📖 [스트리머 전용 축약어 / 동의어 사전 지장소]
// ==========================================================
const SYNONYM_DICT = {
    "민초": "민트초코",
    "민트초코": "민트초코",
    "아아": "아이스아메리카노",
    "아메리카노": "아이스아메리카노",
    "슈붕": "슈크림붕어빵",
    "팥붕": "팥붕어빵",
    "치콜": "치킨콜라"
};

// ==========================================
// 🔧 [개발자 전용 세팅존]
// ==========================================
const DEV_SETTINGS = {
    rouletteSize: 550,      
    popupLockDuration: 3000, 

    initialSpeed: 0.3,      
    baseFriction: 0.996,    
    slowFriction1: 0.991,   
    slowFriction2: 0.985,   
    stopFriction: 0.96      
};

const size = DEV_SETTINGS.rouletteSize;
const center = size / 2; 
const radius = size / 2; 

canvas.width = size;
canvas.height = size;
canvas.parentElement.style.width = `${size}px`;
canvas.parentElement.style.height = `${size}px`;

// 초기 빈 배열
let items = [];

const colors = ["#a3d139", "#6e4f42", "#9b21b7", "#00a3ff", "#8bc34a", "#e91e63", "#3f51b5", "#009688"];
const badgeColors = ["#c5e1a5", "#8d6e63", "#ba68c8", "#29b6f6", "#aed581", "#f06292", "#7986cb", "#4db6ac"];

let currentAngle = 0; 
let isRotating = false; 
let isStopping = false; 
let rotationSpeed = 0; 
let isClickableToClose = false; 

// 시스템 제어 변수
let currentRerollCost = 1000;
let rerollCount = 0;
let lastFocusedIndex = -1;

// 치지직 공식 Socket.IO 인스턴스
let chzzkSocket = null;

// HTML5 오디오 제어 변수군
const bgm = document.getElementById('rouletteBGM');
let fadeInterval = null;

// 원형 돌림판 그리기 함수
function drawRoulette() {
    ctx.clearRect(0, 0, size, size);
    
    if (items.length === 0) {
        ctx.fillStyle = document.body.classList.contains('dark-mode') ? "#888888" : "#666666";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.fillText("방송 연동 후 시청자가 [명령어 + 항목명]을 치거나", center, center - 12);
        ctx.fillText("치즈를 후원하면 자동으로 룰렛에 채워집니다.", center, center + 12);
        return;
    }

    const totalCount = items.reduce((sum, item) => sum + item.count, 0);
    let startAngle = currentAngle;

    for (let i = 0; i < items.length; i++) {
        const arcSize = (items[i].count / totalCount) * (2 * Math.PI);
        
        ctx.beginPath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, startAngle, startAngle + arcSize);
        ctx.lineTo(center, center);
        ctx.fill();

        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(startAngle + arcSize / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = "white";
        ctx.font = `bold ${Math.max(14, size * 0.04)}px Arial`; 
        ctx.fillText(items[i].name, radius - (size * 0.07), 5);
        ctx.restore();

        startAngle += arcSize;
    }
}

function showInputMessage(msg) {
    inputMessage.innerText = msg;
    setTimeout(() => { if(inputMessage.innerText === msg) inputMessage.innerText = ""; }, 3000);
}

// 두 단어의 유사도를 측정하는 레벤슈타인 거리 함수
function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, 
                    matrix[i][j - 1] + 1,     
                    matrix[i - 1][j] + 1      
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// 공백을 제거하고 오타(1글자 차이)를 판별하는 고도화 필터
function isSimilarItem(name1, name2) {
    const clean1 = name1.replace(/\s+/g, '').toLowerCase();
    const clean2 = name2.replace(/\s+/g, '').toLowerCase();
    if (clean1 === clean2) return true;
    const distance = getLevenshteinDistance(clean1, clean2);
    if (distance <= 1) return true;
    return false;
}

// 항목 제어 및 방향키 포커싱 핸들러
window.handleItemNameChange = function(index, element) {
    const value = element.value.trim();
    if (value === "") { showInputMessage("❌ 공백 문자는 항목 이름으로 지정할 수 없습니다."); element.value = items[index].name; return; }
    if (items.some((item, idx) => item.name === value && idx !== index)) { showInputMessage("❌ 이미 사용 중인 항목 이름입니다."); element.value = items[index].name; return; }
    items[index].name = value; inputMessage.innerText = ""; drawRoulette();
};

window.changeItemCount = function(index, amount) {
    if (isRotating || isStopping || rotationSpeed > 0) { showInputMessage("⚠️ 추첨 중에는 점유율을 변경할 수 없습니다."); return; }
    const newCount = items[index].count + amount;
    if (newCount < 1 || newCount > 99) { showInputMessage("⚠️ 점유율은 1에서 99까지만 가능합니다."); return; }
    items[index].count = newCount; updateUI(index);
};

window.handleInputKeyDown = function(event, index, element) {
    if (isRotating || isStopping || rotationSpeed > 0) return;
    if (event.key === 'ArrowUp') { event.preventDefault(); if (index > 0) setTimeout(() => { updateUI(index - 1); }, 0); }
    if (event.key === 'ArrowDown') { event.preventDefault(); const ins = itemList.querySelectorAll('.item-edit-input'); if (index < ins.length - 1) setTimeout(() => { updateUI(index + 1); }, 0); }
};

window.handleInputFocus = function(index) { lastFocusedIndex = index; };

// UI 대시보드 리스트 마운트 렌더러
function updateUI(focusIndex = -1) {
    itemList.innerHTML = "";
    const totalCount = items.reduce((sum, item) => sum + item.count, 0);

    items.forEach((item, index) => {
        const percentage = totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(2) : "0.00";
        const itemNumber = index + 1; 
        if (/^\d+번$/.test(item.name)) item.name = `${itemNumber}번`;

        const li = document.createElement('li');
        li.innerHTML = `
            <div class="badge" style="background-color: ${badgeColors[index % badgeColors.length]}">${itemNumber}</div>
            <input type="text" class="node-input item-edit-input" value="${item.name}" 
                   onfocus="handleInputFocus(${index})"
                   onchange="handleItemNameChange(${index}, this)"
                   onkeydown="handleInputKeyDown(event, ${index}, this)"
                   onkeypress="if(event.key === 'Enter') this.blur();"
                   maxlength="15">
            <div class="count-controller">
                <button class="count-btn" tabindex="-1" onmousedown="event.preventDefault();" onclick="changeItemCount(${index}, -1)">▼</button>
                <div class="item-count">${item.count}</div>
                <button class="count-btn" tabindex="-1" onmousedown="event.preventDefault();" onclick="changeItemCount(${index}, 1)">▲</button>
            </div>
            <div class="item-percent">${percentage}%</div>
            <button class="delete-row-btn" tabindex="-1" onclick="deleteItem(${index}, true)">×</button>
        `;
        itemList.appendChild(li);
    });

    if (items.length < 2) {
        actionBtn.style.opacity = "0.4"; actionBtn.style.cursor = "not-allowed"; actionBtn.innerText = "대기";
    } else {
        actionBtn.style.opacity = "1"; actionBtn.style.cursor = "pointer";
        if (!isRotating && !isStopping) actionBtn.innerText = "시작";
    }

    if (focusIndex !== -1) {
        const currentInputs = itemList.querySelectorAll('.item-edit-input');
        if (currentInputs[focusIndex]) { currentInputs[focusIndex].focus(); currentInputs[focusIndex].select(); }
    }
    currentRerollCostEl.innerText = currentRerollCost.toLocaleString();
    drawRoulette();
}

// 🧀 치즈 후원 실시간 가변 적산 핸들러
function injectDonationData(donatorName, cheeseAmount) {
    const cheesePerCount = parseInt(cheesePerCountInp.value) || 1000;
    const addedCount = Math.floor(cheeseAmount / cheesePerCount);
    if (addedCount < 1) return;

    const existingIndex = items.findIndex(item => item.name === donatorName);
    if (existingIndex !== -1) {
        if (items[existingIndex].count + addedCount > 99) items[existingIndex].count = 99;
        else items[existingIndex].count += addedCount;
        updateUI(existingIndex);
    } else {
        if (items.length >= 24) { showInputMessage("⚠️ 최대 항목 한계치(24개) 초과로 보류되었습니다."); return; }
        items.push({ name: donatorName, count: addedCount });
        updateUI(items.length - 1);
    }
}

// 💬 명령어 감지 시 작동하는 가중치 통제 엔진
function injectChatData(itemName) {
    let standardizedName = itemName.trim();
    if (SYNONYM_DICT[standardizedName]) {
        standardizedName = SYNONYM_DICT[standardizedName]; 
    }

    const existingIndex = items.findIndex(item => {
        let existingStandard = item.name.trim();
        if (SYNONYM_DICT[existingStandard]) {
            existingStandard = SYNONYM_DICT[existingStandard];
        }
        return isSimilarItem(existingStandard, standardizedName);
    });
    
    if (existingIndex !== -1) {
        return; 
    }
    
    if (items.length >= 24) return; 
    items.push({ name: standardizedName, count: 1 });
    updateUI(items.length - 1);
}

// ==========================================================
// 📡 [새로 추가] Client ID & Secret 기반 자동 엑세스 토큰 발급 브릿지
// ==========================================================
async function fetchTokenAndConnect(channelId, clientId, clientSecret) {
    handleChzzkDisconnect();
    connectionStatusEl.innerText = "🟡 토큰 발급 중";
    sidebarStatusBadge.innerText = "🟡 연결 중";
    showInputMessage("📡 치지직 OAuth2 규격에 따라 액세스 토큰 생성 중...");

    const proxy = "https://corsproxy.io/?";
    // 치지직 공식 오리진 토큰 교환 엔드포인트 세션 가공
    const tokenUrl = `${proxy}https://api.chzzk.naver.com/open/v1/oauth2/token`;

    try {
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret
            })
        });

        if (!response.ok) {
            showInputMessage("❌ 토큰 발급 실패! Client ID 또는 Secret을 확인해 주세요.");
            handleChzzkDisconnect();
            return;
        }

        const tokenData = await response.json();
        if (!tokenData || !tokenData.access_token) {
            showInputMessage("❌ 응답 토큰 포맷이 올바르지 않습니다.");
            handleChzzkDisconnect();
            return;
        }

        // 🚀 자동 발급된 액세스 토큰을 들고 실제 라이브 소켓 연결 파이프라인으로 이동
        connectToChzzkLive(channelId, tokenData.access_token);

    } catch (e) {
        showInputMessage("❌ 네트워킹 토큰 브릿지 마운트 오류가 발생했습니다.");
        handleChzzkDisconnect();
    }
}

// 📡 치지직 오픈 API 소켓 세션 실시간 핸드셰이크 망
async function connectToChzzkLive(channelId, accessToken) {
    const proxy = "https://corsproxy.io/?";
    const authApiUrl = `${proxy}https://api.chzzk.naver.com/open/v1/sessions/auth`;

    try {
        const response = await fetch(authApiUrl, {
            method: "GET",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" }
        });

        if (!response.ok) { showInputMessage("❌ 세션 인증 실패 또는 유효하지 않은 액세스 토큰입니다."); handleChzzkDisconnect(); return; }
        const authResult = await response.json();
        if (!authResult || !authResult.url) { showInputMessage("❌ 소켓 URL을 발급받지 못했습니다."); handleChzzkDisconnect(); return; }

        const sessionURL = authResult.url;
        const socketOption = { reconnection: false, 'force new connection': true, 'connect timeout': 3000, transports: ['websocket'] };

        chzzkSocket = io.connect(sessionURL, socketOption);

        chzzkSocket.on('connect', () => {
            connectionStatusEl.innerText = "🟡 핸드셰이크 중"; connectionStatusEl.className = "status-badge disconnected";
            sidebarStatusBadge.innerText = "🟡 연결 중"; sidebarStatusBadge.className = "status-badge disconnected";
        });

        chzzkSocket.on('SYSTEM', async (packet) => {
            if (packet && packet.type === "connected" && packet.data && packet.data.sessionKey) {
                const acquiredSessionKey = packet.data.sessionKey;
                showInputMessage("📡 세션 식별자 획득 성공! 공식 후원 및 채팅 이벤트 멀티 구독 요청 중...");

                const subDonationUrl = `${proxy}https://api.chzzk.naver.com/open/v1/sessions/events/subscribe/donation`;
                const subChatUrl = `${proxy}https://api.chzzk.naver.com/open/v1/sessions/events/subscribe/chat`;

                const [resDonation, resChat] = await Promise.all([
                    fetch(subDonationUrl, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionKey: acquiredSessionKey })
                    }),
                    fetch(subChatUrl, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionKey: acquiredSessionKey })
                    })
                ]);

                if (resDonation.ok && resChat.ok) {
                    connectionStatusEl.innerText = "🟢 연동 성공"; connectionStatusEl.className = "status-badge connected";
                    sidebarStatusBadge.innerText = "🟢 연동 성공"; sidebarStatusBadge.className = "status-badge connected";
                    chzzkConnectBtn.innerText = "연동 끊기"; chzzkConnectBtn.className = "donation-btn connect-action-btn active";
                    showInputMessage("🎉 라이브 연동 성공! 시청자의 명령어 입력과 치즈가 돌림판에 실시간 누적됩니다!");
                } else {
                    showInputMessage("❌ 후원 또는 채팅 스코프 허가 권한 승인에 실패했습니다.");
                    handleChzzkDisconnect();
                }
            }
        });

        chzzkSocket.on('DONATION', (data) => {
            if (data && data.payAmount) {
                const donatorName = data.donatorNickname || "익명의후원자";
                const cheeseAmount = parseInt(data.payAmount) || 0;
                injectDonationData(donatorName, cheeseAmount);
            }
        });

        chzzkSocket.on('CHAT', (data) => {
            if (data && data.content) {
                const msgContent = data.content.trim(); 
                const targetCommand = chatCommandInp.value.trim(); 
                
                if (msgContent.startsWith(targetCommand + " ")) {
                    const extractedItemName = msgContent.substring(targetCommand.length).trim();
                    if (extractedItemName !== "") {
                        injectChatData(extractedItemName);
                    }
                }
            }
        });

        chzzkSocket.on('disconnect', () => { handleChzzkDisconnect(); });
        chzzkSocket.on('connect_error', () => { handleChzzkDisconnect(); showInputMessage("❌ 치지직 소켓 서버 연결 에러"); });

    } catch (e) {
        showInputMessage("❌ 네트워킹 API 브릿지 마운트 오류가 발생했습니다.");
        handleChzzkDisconnect();
    }
}

function handleChzzkDisconnect() {
    connectionStatusEl.innerText = "🔴 연결 끊김"; connectionStatusEl.className = "status-badge disconnected";
    sidebarStatusBadge.innerText = "🔴 연결 끊김"; sidebarStatusBadge.className = "status-badge disconnected";
    chzzkConnectBtn.innerText = "공식 방송 연동 시작"; chzzkConnectBtn.className = "donation-btn connect-action-btn";
    if (chzzkSocket) { chzzkSocket.disconnect(); chzzkSocket = null; }
}

// 리롤 시스템 처리 함수
function executeRerollFromSystem() {
    if (items.length < 2) return;
    if (!isRotating && !isStopping && rotationSpeed === 0) {
        isRotating = true; rotationSpeed = DEV_SETTINGS.initialSpeed; actionBtn.innerText = "정지"; 
        playBGM(); 
        animate();
        rerollCount++;
        const base = parseInt(rerollBaseCostInp.value) || 1000; const step = parseInt(rerollStepCostInp.value) || 500;
        currentRerollCost = base + (rerollCount * step); updateUI();
    }
}

resetRerollBtn.addEventListener('click', () => { rerollCount = 0; currentRerollCost = parseInt(rerollBaseCostInp.value) || 1000; updateUI(); showInputMessage("🔄 리롤 누적 회차 및 비용이 초기화되었습니다."); });
rerollBaseCostInp.addEventListener('change', () => { if (rerollCount === 0) { currentRerollCost = parseInt(rerollBaseCostInp.value) || 1000; updateUI(); } });

function generateNextItem() {
    if (isRotating || isStopping || rotationSpeed > 0) { showInputMessage("⚠️ 추첨 중에는 항목을 추가할 수 없습니다."); return; }
    if (items.length >= 24) { showInputMessage("❌ 항목은 최대 24개까지만 생성 가능합니다."); return; }
    items.push({ name: `${items.length + 1}번`, count: 1 }); updateUI(items.length - 1); 
}

window.deleteItem = function(index, shouldFocusMove) {
    if (isRotating || isStopping || rotationSpeed > 0) { showInputMessage("⚠️ 추첨 중에는 항목을 삭제할 수 없습니다."); return; }
    items.splice(index, 1);
    if (lastFocusedIndex >= items.length) lastFocusedIndex = items.length - 1;
    if (shouldFocusMove) {
        if (items.length === 0) { lastFocusedIndex = -1; updateUI(-1); return; }
        let targetFocusIndex = index >= items.length ? items.length - 1 : index;
        updateUI(targetFocusIndex); 
    } else { updateUI(-1); }
};

addBtn.addEventListener('click', generateNextItem);

window.addEventListener('keydown', (e) => {
    if (isRotating || isStopping || rotationSpeed > 0) return;
    if (!document.activeElement.classList.contains('item-edit-input')) {
        if (e.key === 'ArrowUp' && items.length > 0) { e.preventDefault(); updateUI(0); return; }
        if (e.key === 'ArrowDown' && items.length > 0) { e.preventDefault(); updateUI(items.length - 1); return; }
        if (e.key === 'Enter') generateNextItem();
    }
});

themeToggleBtn.addEventListener('click', () => {
    if (document.body.classList.contains('light-mode')) {
        document.body.classList.remove('light-mode'); document.body.classList.add('dark-mode'); themeToggleBtn.innerText = "☀️ 라이트 모드";
    } else {
        document.body.classList.remove('dark-mode'); document.body.classList.add('light-mode'); themeToggleBtn.innerText = "🌙 다크 모드";
    }
    drawRoulette();
});

function calculateResult() {
    if (items.length === 0) return "없음";
    const totalCount = items.reduce((sum, item) => sum + item.count, 0);
    const normalizedAngle = currentAngle % (2 * Math.PI);
    let targetAngle = (1.5 * Math.PI) - normalizedAngle;
    if (targetAngle < 0) targetAngle += 2 * Math.PI;
    let accumulatedAngle = 0;
    for (let i = 0; i < items.length; i++) {
        const arcSize = (items[i].count / totalCount) * (2 * Math.PI);
        if (targetAngle >= accumulatedAngle && targetAngle <= accumulatedAngle + arcSize) return items[i].name;
        accumulatedAngle += arcSize;
    }
    return items[0].name;
}

function closePopup() {
    isClickableToClose = false; resultPopup.classList.add('hide-animation');
    setTimeout(() => { resultPopup.classList.remove('show-animation', 'hide-animation'); popupSubText.classList.remove('fade-in-text'); actionBtn.innerText = "시작"; actionBtn.style.display = "block"; }, 400);
}

function animate() {
    if (isRotating || rotationSpeed > 0.0002) {
        currentAngle += rotationSpeed; 
        if (isStopping) {
            let dynamicFriction = DEV_SETTINGS.baseFriction; 
            if (rotationSpeed < 0.08) dynamicFriction = DEV_SETTINGS.slowFriction1; 
            if (rotationSpeed < 0.03) dynamicFriction = DEV_SETTINGS.slowFriction2; 
            if (rotationSpeed < 0.01) dynamicFriction = DEV_SETTINGS.stopFriction;  
            rotationSpeed *= dynamicFriction; 
        }
        drawRoulette(); requestAnimationFrame(animate); 
    } else if (isStopping && rotationSpeed > 0) {
        rotationSpeed = 0; isStopping = false;
        
        fadeOutBGM();

        const result = calculateResult(); popupResultText.innerText = result;
        resultPopup.classList.remove('hide-animation'); resultPopup.classList.add('show-animation');
        setTimeout(() => { popupSubText.classList.add('fade-in-text'); isClickableToClose = true; }, DEV_SETTINGS.popupLockDuration);
    }
}

actionBtn.addEventListener('click', (e) => {
    if (items.length < 2) { showInputMessage("⚠️ 항목을 최소 2개 이상 등록해 주세요."); return; }
    e.stopPropagation(); 
    if (!isRotating && !isStopping && rotationSpeed === 0) { 
        isRotating = true; rotationSpeed = DEV_SETTINGS.initialSpeed; actionBtn.innerText = "정지"; 
        playBGM(); 
        animate(); 
    }
    else if (isRotating) { isRotating = false; isStopping = true; actionBtn.style.display = "none"; }
});

// HTML5 순수 오디오 재생 및 볼륨 슬라이더 동기화 제어부
function playBGM() {
    if (fadeInterval) clearInterval(fadeInterval);
    if (bgm) {
        const maxVol = (parseInt(bgmVolumeInp.value) || 0) / 100;
        bgm.volume = maxVol;
        bgm.currentTime = 0; 
        bgm.play().catch(e => console.log("브라우저 보안으로 오디오 자동 재생 대기:", e));
    }
}

function fadeOutBGM() {
    if (!bgm) return;
    if (fadeInterval) clearInterval(fadeInterval);
    
    let currentVolume = bgm.volume;
    const step = currentVolume / 20; 
    
    fadeInterval = setInterval(() => {
        currentVolume -= step;
        if (currentVolume <= 0) {
            clearInterval(fadeInterval);
            bgm.pause(); 
            bgm.volume = 0;
        } else {
            bgm.volume = currentVolume;
        }
    }, 50);
}

bgmVolumeInp.addEventListener('input', () => {
    const vol = bgmVolumeInp.value;
    volumeValEl.innerText = vol; 
    if (bgm && !isStopping && rotationSpeed > 0) {
        bgm.volume = vol / 100;
    }
});

bgmVolumeInp.addEventListener('change', () => {
    localStorage.setItem('chzzk_saved_volume', bgmVolumeInp.value);
});

// 💾 토큰 및 커맨드 인젝션 로컬 메모리 동기화 로드 시스템
function loadSavedConnectionInfo() {
    const savedClientId = localStorage.getItem('chzzk_saved_client_id');
    const savedClientSecret = localStorage.getItem('chzzk_saved_client_secret');
    const savedChannelId = localStorage.getItem('chzzk_saved_channel_id');
    const savedCommand = localStorage.getItem('chzzk_saved_command'); 
    const savedVolume = localStorage.getItem('chzzk_saved_volume'); 
    
    if (savedClientId) chzzkClientIdInp.value = savedClientId;
    if (savedClientSecret) chzzkClientSecretInp.value = savedClientSecret;
    if (savedChannelId) chzzkChannelIdInp.value = savedChannelId;
    if (savedCommand) chatCommandInp.value = savedCommand;
    
    if (savedVolume) {
        bgmVolumeInp.value = savedVolume;
        volumeValEl.innerText = savedVolume;
    }
}

function saveConnectionInfo(clientId, clientSecret, channelId, command) {
    localStorage.setItem('chzzk_saved_client_id', clientId);
    localStorage.setItem('chzzk_saved_client_secret', clientSecret);
    localStorage.setItem('chzzk_saved_channel_id', channelId);
    localStorage.setItem('chzzk_saved_command', command); 
}

chzzkConnectBtn.addEventListener('click', () => {
    const channelId = chzzkChannelIdInp.value.trim();
    const clientId = chzzkClientIdInp.value.trim();
    const clientSecret = chzzkClientSecretInp.value.trim();
    const command = chatCommandInp.value.trim();
    
    if (!chzzkSocket) {
        if (clientId === "" || clientSecret === "" || channelId === "" || command === "") { 
            showInputMessage("❌ ID, Secret, 채널 ID, 명령어를 모두 기입해 주세요."); 
            return; 
        }
        saveConnectionInfo(clientId, clientSecret, channelId, command);
        // 발급 기능 호출
        fetchTokenAndConnect(channelId, clientId, clientSecret);
    } else {
        handleChzzkDisconnect(); showInputMessage("📡 치지직 실시간 라이브 연동이 중단되었습니다.");
    }
});

window.addEventListener('click', (e) => { 
    if (isClickableToClose) closePopup(); 
    if (e.target === connectModal) { connectModal.classList.remove('show'); updateUI(lastFocusedIndex); }
});

openConnectModalBtn.addEventListener('click', () => { connectModal.classList.add('show'); });
closeConnectModalBtn.addEventListener('click', () => { connectModal.classList.remove('show'); updateUI(lastFocusedIndex); });

// 🚀 프로그램 최초 실행부 (가동 시작)
loadSavedConnectionInfo();
updateUI();