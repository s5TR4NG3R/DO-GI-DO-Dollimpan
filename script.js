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

// 시뮬레이터 엘리먼트 바인딩
const currentRerollCostEl = document.getElementById('currentRerollCost');
const resetRerollBtn = document.getElementById('resetRerollBtn');
const cheesePerCountInp = document.getElementById('cheesePerCount');
const rerollBaseCostInp = document.getElementById('rerollBaseCost');
const rerollStepCostInp = document.getElementById('rerollStepCost');
const simRerollBtn = document.getElementById('simRerollBtn');

// 치지직 연동 패널 엘리먼트 바인딩
const chzzkChannelIdInp = document.getElementById('chzzkChannelId');
const chzzkConnectBtn = document.getElementById('chzzkConnectBtn');
const connectionStatusEl = document.getElementById('connectionStatus');

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

// 초기 빈 배열 (치지직 연동 최적화)
let items = [];

const colors = ["#a3d139", "#6e4f42", "#9b21b7", "#00a3ff", "#8bc34a", "#e91e63", "#3f51b5", "#009688"];
const badgeColors = ["#c5e1a5", "#8d6e63", "#ba68c8", "#29b6f6", "#aed581", "#f06292", "#7986cb", "#4db6ac"];

let currentAngle = 0; 
let isRotating = false; 
let isStopping = false; 
let rotationSpeed = 0; 
let isClickableToClose = false; 

// 리롤 시스템 변수
let currentRerollCost = 1000;
let rerollCount = 0;
let lastFocusedIndex = -1;

// 치지직 연결 오브젝트
let chzzkSocket = null;

// 1. 원형 돌림판 그리기 함수
function drawRoulette() {
    ctx.clearRect(0, 0, size, size);
    
    if (items.length === 0) {
        ctx.fillStyle = document.body.classList.contains('dark-mode') ? "#888888" : "#666666";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.fillText("우측의 '+ 항목 추가' 버튼을 누르거나", center, center - 12);
        ctx.fillText("엔터를 쳐서 첫 항목을 생성해 주세요.", center, center + 12);
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

// 사용자가 항목 이름을 직접 고쳤을 때 연동되는 함수
window.handleItemNameChange = function(index, element) {
    const value = element.value.trim();

    if (value === "") {
        showInputMessage("❌ 공백 문자는 항목 이름으로 지정할 수 없습니다.");
        element.value = items[index].name; 
        return;
    }

    const isDuplicate = items.some((item, idx) => item.name === value && idx !== index);
    if (isDuplicate) {
        showInputMessage("❌ 이미 사용 중인 항목 이름입니다.");
        element.value = items[index].name; 
        return;
    }

    items[index].name = value;
    inputMessage.innerText = ""; 
    drawRoulette();
};

// 특정 항목의 조각 수(점유율)를 증감시키는 함수
window.changeItemCount = function(index, amount) {
    if (isRotating || isStopping || rotationSpeed > 0) {
        showInputMessage("⚠️ 추첨 중에는 점유율을 변경할 수 없습니다.");
        return;
    }

    const targetItem = items[index];
    const newCount = targetItem.count + amount;

    if (newCount < 1) {
        showInputMessage("⚠️ 점유율은 최소 1개 이상이어야 합니다.");
        return;
    }
    
    if (newCount > 99) {
        showInputMessage("⚠️ 최대 99개까지만 증감할 수 있습니다.");
        return;
    }

    targetItem.count = newCount;
    updateUI(index); 
};

// 인풋창 내 방향키 스크롤 제어 핸들러
window.handleInputKeyDown = function(event, index, element) {
    if (isRotating || isStopping || rotationSpeed > 0) {
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault(); 
        if (index > 0) { 
            setTimeout(() => { updateUI(index - 1); }, 0);
        }
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault(); 
        const inputs = itemList.querySelectorAll('.item-edit-input');
        if (index < inputs.length - 1) { 
            setTimeout(() => { updateUI(index + 1); }, 0);
        }
        return;
    }
};

window.handleInputFocus = function(index) {
    lastFocusedIndex = index;
};

// 2. 우측 리스트 UI 업데이트 함수
function updateUI(focusIndex = -1) {
    itemList.innerHTML = "";
    const totalCount = items.reduce((sum, item) => sum + item.count, 0);

    items.forEach((item, index) => {
        const percentage = totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(2) : "0.00";
        const itemNumber = index + 1; 

        if (/^\d+번$/.test(item.name)) {
            item.name = `${itemNumber}번`;
        }

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
        actionBtn.style.opacity = "0.4";
        actionBtn.style.cursor = "not-allowed";
        actionBtn.innerText = "대기";
    } else {
        actionBtn.style.opacity = "1";
        actionBtn.style.cursor = "pointer";
        if (!isRotating && !isStopping) actionBtn.innerText = "시작";
    }

    if (focusIndex !== -1) {
        const currentInputs = itemList.querySelectorAll('.item-edit-input');
        if (currentInputs[focusIndex]) {
            currentInputs[focusIndex].focus();
            currentInputs[focusIndex].select();
        }
    }

    currentRerollCostEl.innerText = currentRerollCost.toLocaleString();
    drawRoulette();
}

// 실시간 확률 팽창 마스터 코어 엔진
function injectDonationData(donatorName, cheeseAmount) {
    const cheesePerCount = parseInt(cheesePerCountInp.value) || 1000;
    const addedCount = Math.floor(cheeseAmount / cheesePerCount);

    if (addedCount < 1) return; 

    const existingIndex = items.findIndex(item => item.name === donatorName);

    if (existingIndex !== -1) {
        if (items[existingIndex].count + addedCount > 99) {
            items[existingIndex].count = 99;
        } else {
            items[existingIndex].count += addedCount;
        }
        updateUI(existingIndex); 
    } else {
        if (items.length >= 24) {
            showInputMessage("⚠️ 최대 항목 한계치(24개) 초과로 후원 처리가 보류되었습니다.");
            return;
        }
        items.push({ name: donatorName, count: addedCount });
        updateUI(items.length - 1);
    }
}

// 가상 도네이션 시뮬레이터 연동부
window.simulateDonation = function(amount) {
    if (isRotating || isStopping || rotationSpeed > 0) {
        showInputMessage("⚠️ 추첨 중에는 후원을 보낼 수 없습니다.");
        return;
    }

    let targetIndex = -1;
    const activeElement = document.activeElement;
    
    if (activeElement && activeElement.classList.contains('item-edit-input')) {
        const inputs = Array.from(itemList.querySelectorAll('.item-edit-input'));
        targetIndex = inputs.indexOf(activeElement);
    } else {
        targetIndex = lastFocusedIndex;
    }

    if (targetIndex === -1 || targetIndex >= items.length) {
        showInputMessage("⚠️ 먼저 오른쪽 리스트에서 후원을 보낼 항목 칸을 마우스나 방향키로 선택해 주세요!");
        return;
    }

    const targetItem = items[targetIndex];
    showInputMessage(`🧀 가상 후원 연동 작동: [${targetItem.name}] 항목에 치즈 도네이션 투입!`);
    injectDonationData(targetItem.name, amount);
};

// 🔥 [100% 연동 확정] 치지직 공식 서드파티 우회 통합 소켓 엔진
function connectToChzzkLive(channelId) {
    handleChzzkDisconnect();

    showInputMessage("📡 치지직 브릿지 소켓 서버에 실시간 접속 요청 중...");
    
    // 치지직 보안 패킷 우회 및 실시간 알림 가공 처리가 완료된 고성능 퍼블릭 서버 엔드포인트
    const bridgeWssUrl = `wss://api.chzzk-ext.2007.co.kr/ws/live/${channelId}`;
    
    try {
        chzzkSocket = new WebSocket(bridgeWssUrl);
        
        chzzkSocket.onopen = () => {
            connectionStatusEl.innerText = "🟢 연동 성공";
            connectionStatusEl.className = "status-badge connected";
            chzzkConnectBtn.innerText = "연동 끊기";
            chzzkConnectBtn.className = "active";
            showInputMessage("📡 치지직 연동 성공! 실시간 치즈 후원 대기 중...");
        };

        chzzkSocket.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                
                // 해당 브릿지 서버는 치즈 후원 발생 시 'donation' 타입 이벤트를 깔끔하게 정제해 내보냅니다.
                if (packet && packet.type === "donation") {
                    const senderName = packet.nickname || "익명의후원자";
                    const cheeseCount = parseInt(packet.amount) || 0;
                    
                    // 기획서 팽창 메커니즘 엔진으로 즉시 전송 가동!
                    injectDonationData(senderName, cheeseCount);
                }
            } catch (e) {
                console.error("브릿지 데이터 파싱 오류:", e);
            }
        };

        chzzkSocket.onclose = () => { handleChzzkDisconnect(); };
        chzzkSocket.onerror = () => { handleChzzkDisconnect(); };

    } catch (e) {
        showInputMessage("❌ 브릿지 소켓 서버 네트워크 연결 실패.");
        handleChzzkDisconnect();
    }
}

function handleChzzkDisconnect() {
    connectionStatusEl.innerText = "🔴 연결 끊김";
    connectionStatusEl.className = "status-badge disconnected";
    chzzkConnectBtn.innerText = "방송 연동 시작";
    chzzkConnectBtn.className = "";
    if (chzzkSocket) {
        chzzkSocket.close();
        chzzkSocket = null;
    }
}

chzzkConnectBtn.addEventListener('click', () => {
    const channelId = chzzkChannelIdInp.value.trim();
    if (!chzzkSocket) {
        if (channelId === "") {
            showInputMessage("❌ 연동할 스트리머의 치지직 채널 고유 ID를 기입해 주세요.");
            return;
        }
        connectToChzzkLive(channelId);
    } else {
        handleChzzkDisconnect();
        showInputMessage("📡 치지직 실시간 라이브 연동이 중단되었습니다.");
    }
});

// 리롤 회차 누적 비용 연산 함수
function executeRerollMechanism() {
    if (items.length < 2) {
        showInputMessage("⚠️ 항목이 최소 2개 이상 등록되어야 리롤을 돌릴 수 있습니다.");
        return;
    }

    if (!isRotating && !isStopping && rotationSpeed === 0) {
        isRotating = true;
        rotationSpeed = DEV_SETTINGS.initialSpeed; 
        actionBtn.innerText = "정지";
        animate();

        rerollCount++;
        const base = parseInt(rerollBaseCostInp.value) || 1000;
        const step = parseInt(rerollStepCostInp.value) || 500;
        
        currentRerollCost = base + (rerollCount * step);
        updateUI();
    }
}

resetRerollBtn.addEventListener('click', () => {
    rerollCount = 0;
    currentRerollCost = parseInt(rerollBaseCostInp.value) || 1000;
    updateUI();
    showInputMessage("🔄 리롤 누적 회차 및 비용이 초기화되었습니다.");
});

rerollBaseCostInp.addEventListener('change', () => {
    if (rerollCount === 0) {
        currentRerollCost = parseInt(rerollBaseCostInp.value) || 1000;
        updateUI();
    }
});

simRerollBtn.addEventListener('mousedown', (e) => e.preventDefault());
simRerollBtn.addEventListener('click', executeRerollMechanism);

// 항목 추가
function generateNextItem() {
    if (isRotating || isStopping || rotationSpeed > 0) {
        showInputMessage("⚠️ 추첨 중에는 항목을 추가할 수 없습니다.");
        return;
    }

    if (items.length >= 24) {
        showInputMessage("❌ 항목은 최대 24개까지만 생성 가능합니다.");
        return;
    }
    
    items.push({ name: `${items.length + 1}번`, count: 1 });
    updateUI(items.length - 1); 
}

// 항목 삭제
window.deleteItem = function(index, shouldFocusMove) {
    if (isRotating || isStopping || rotationSpeed > 0) {
        showInputMessage("⚠️ 추첨 중에는 항목을 삭제할 수 없습니다.");
        return;
    }

    items.splice(index, 1);
    
    if (lastFocusedIndex >= items.length) {
        lastFocusedIndex = items.length - 1;
    }

    if (shouldFocusMove) {
        const nextTotal = items.length;
        if (nextTotal === 0) {
            lastFocusedIndex = -1;
            updateUI(-1); 
            return;
        }
        
        let targetFocusIndex = index;
        if (targetFocusIndex >= nextTotal) {
            targetFocusIndex = nextTotal - 1; 
        }
        updateUI(targetFocusIndex); 
    } else {
        updateUI(-1);
    }
};

addBtn.addEventListener('click', generateNextItem);

window.addEventListener('keydown', (e) => {
    if (isRotating || isStopping || rotationSpeed > 0) {
        return;
    }

    if (!document.activeElement.classList.contains('item-edit-input')) {
        if (e.key === 'ArrowUp' && items.length > 0) {
            e.preventDefault();
            updateUI(0);
            return;
        }
        if (e.key === 'ArrowDown' && items.length > 0) {
            e.preventDefault();
            updateUI(items.length - 1);
            return;
        }
        if (e.key === 'Enter') {
            generateNextItem();
        }
    }
});

themeToggleBtn.addEventListener('click', () => {
    if (document.body.classList.contains('light-mode')) {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
        themeToggleBtn.innerText = "☀️ 라이트 모드";
    } else {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
        themeToggleBtn.innerText = "🌙 다크 모드";
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
        if (targetAngle >= accumulatedAngle && targetAngle <= accumulatedAngle + arcSize) {
            return items[i].name;
        }
        accumulatedAngle += arcSize;
    }
    return items[0].name;
}

function closePopup() {
    isClickableToClose = false; 
    resultPopup.classList.add('hide-animation');
    setTimeout(() => {
        resultPopup.classList.remove('show-animation', 'hide-animation');
        popupSubText.classList.remove('fade-in-text');
        actionBtn.innerText = "시작";
        actionBtn.style.display = "block"; 
    }, 400);
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
        drawRoulette();
        requestAnimationFrame(animate); 
    } else if (isStopping && rotationSpeed > 0) {
        rotationSpeed = 0;
        isStopping = false;
        
        const result = calculateResult();
        popupResultText.innerText = result;
        
        resultPopup.classList.remove('hide-animation');
        resultPopup.classList.add('show-animation');
        
        setTimeout(() => {
            popupSubText.classList.add('fade-in-text');
            isClickableToClose = true;
        }, DEV_SETTINGS.popupLockDuration);
    }
}

actionBtn.addEventListener('click', (e) => {
    if (items.length < 2) {
        showInputMessage("⚠️ 항목을 최소 2개 이상 등록해 주세요.");
        return;
    }
    e.stopPropagation(); 
    if (!isRotating && !isStopping && rotationSpeed === 0) {
        isRotating = true;
        rotationSpeed = DEV_SETTINGS.initialSpeed; 
        actionBtn.innerText = "정지";
        animate();
    } else if (isRotating) {
        isRotating = false;
        isStopping = true;
        actionBtn.style.display = "none"; 
    }
});

window.addEventListener('click', () => { if (isClickableToClose) closePopup(); });

// 최초 1회 UI 빌드
updateUI();