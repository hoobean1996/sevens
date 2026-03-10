// ==================== MAIN GAME CLIENT ====================
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const network = new Network();

// Global mode: 'town' | 'run'
let mode = 'town';

// Town state (temporary, session-scoped only for now)
const defaultTownState = {
    resources: { wood: 0, stone: 0, ore: 0, gold: 0 },
    buildings: {
        hall: 1,
        warehouse: 0,
        lumber: 1,
        quarry: 1,
        mine: 1,
        blacksmith: 0,
        tavern: 0,
        alchemy: 0,
        accessory: 0,
        shop: 0,
    },
    caps: {
        equipSlots: 20,
        materialSlots: 100,
    },
};

let townState = null;
let runTownBonus = { atkMult: 1, hpMult: 1, defMult: 1 };

// ==================== TOWN NUMERIC HELPERS ====================

function townCalcBaseCap(hallLevel) {
    const L = Math.max(1, Math.min(10, hallLevel || 1));
    return 1000 * (1 + 0.3 * (L - 1));
}

function townCalcResCap(hallLevel, warehouseLevel) {
    const base = townCalcBaseCap(hallLevel);
    const Lw = Math.max(0, Math.min(10, warehouseLevel || 0));
    return base * (1 + 0.5 * Lw);
}

function townCalcYield(building, level) {
    const L = Math.max(1, Math.min(10, level || 1));
    switch (building) {
    case 'lumber': {
        const base = 5;
        const alpha = 0.15;
        return base * (1 + alpha * (L - 1));
    }
    case 'quarry': {
        const base = 4;
        const alpha = 0.15;
        return base * (1 + alpha * (L - 1));
    }
    case 'mine': {
        const base = 3;
        const alpha = 0.20;
        return base * (1 + alpha * (L - 1));
    }
    default:
        return 0;
    }
}

const TOWN_UPGRADE_BASE_COST = {
    hall:      { wood: 40, stone: 60, ore: 40, gold: 80 },
    warehouse: { wood: 30, stone: 50, ore: 10, gold: 40 },
    lumber:    { wood: 5,  stone: 20, ore: 5,  gold: 15 },
    quarry:    { wood: 20, stone: 5,  ore: 5,  gold: 15 },
    mine:      { wood: 15, stone: 15, ore: 5,  gold: 20 },
};

function townCalcUpgradeCost(type, level) {
    const base = TOWN_UPGRADE_BASE_COST[type];
    if (!base) return null;
    const L = Math.max(0, Math.min(9, level || 0));
    const mult = (1 + L) * (1 + L);
    return {
        wood: Math.round(base.wood * mult),
        stone: Math.round(base.stone * mult),
        ore: Math.round(base.ore * mult),
        gold: Math.round(base.gold * mult),
    };
}

function townCanAfford(cost) {
    if (!cost || !townState) return false;
    const r = townState.resources;
    return r.wood >= cost.wood && r.stone >= cost.stone && r.ore >= cost.ore && r.gold >= cost.gold;
}

function townSpend(cost) {
    if (!cost || !townState) return;
    townState.resources.wood -= cost.wood;
    townState.resources.stone -= cost.stone;
    townState.resources.ore -= cost.ore;
    townState.resources.gold -= cost.gold;
}

function initTownState() {
    if (!townState) {
        try {
            const saved = sessionStorage.getItem('sevens_town_state');
            if (saved) {
                townState = JSON.parse(saved);
            } else {
                townState = JSON.parse(JSON.stringify(defaultTownState));
            }
        } catch (e) {
            console.warn('Failed to read town state from sessionStorage:', e);
            townState = JSON.parse(JSON.stringify(defaultTownState));
        }
    }
    updateTownUI();
}

function persistTownState() {
    if (!townState) return;
    try {
        sessionStorage.setItem('sevens_town_state', JSON.stringify(townState));
    } catch (e) {
        console.warn('Failed to persist town state to sessionStorage:', e);
    }
}

function updateTownUI() {
    // Simple UI update for resources & building levels
    const resEl = document.getElementById('town-resources');
    if (resEl && townState) {
        const r = townState.resources;
        const caps = townGetResourceCaps();
        resEl.textContent =
            `木材 ${Math.floor(r.wood)} / ${caps.wood} · ` +
            `石材 ${Math.floor(r.stone)} / ${caps.stone} · ` +
            `矿石 ${Math.floor(r.ore)} / ${caps.ore} · ` +
            `金币 ${Math.floor(r.gold)}`;
    }
    const hallEl = document.getElementById('town-b-hall-level');
    if (hallEl && townState) hallEl.textContent = `Lv.${townState.buildings.hall}`;
    const wareEl = document.getElementById('town-b-warehouse-level');
    if (wareEl && townState) wareEl.textContent = `Lv.${townState.buildings.warehouse}`;
    const lumberEl = document.getElementById('town-b-lumber-level');
    if (lumberEl && townState) lumberEl.textContent = `Lv.${townState.buildings.lumber}`;
    const quarryEl = document.getElementById('town-b-quarry-level');
    if (quarryEl && townState) quarryEl.textContent = `Lv.${townState.buildings.quarry}`;
    const mineEl = document.getElementById('town-b-mine-level');
    if (mineEl && townState) mineEl.textContent = `Lv.${townState.buildings.mine}`;

    persistTownState();
}

function townGetResourceCaps() {
    if (!townState) {
        return { wood: 0, stone: 0, ore: 0 };
    }
    const b = townState.buildings;
    const cap = Math.round(townCalcResCap(b.hall, b.warehouse));
    return { wood: cap, stone: cap, ore: cap };
}

function townComputeRunBonus() {
    if (!townState) {
        runTownBonus = { atkMult: 1, hpMult: 1, defMult: 1 };
        return;
    }
    const b = townState.buildings;
    const hall = b.hall || 1;
    const warehouse = b.warehouse || 0;
    const blacksmith = b.blacksmith || 0;

    const hpMult = 1 + 0.01 * (hall - 1) + 0.005 * warehouse;
    const atkMult = 1 + 0.02 * blacksmith;
    const defMult = 1 + 0.01 * (warehouse + hall - 1);

    runTownBonus = {
        atkMult,
        hpMult,
        defMult,
    };
}

function enterTownMode() {
    mode = 'town';
    gameStarted = false;
    const townScreen = document.getElementById('town-screen');
    const startScreen = document.getElementById('start-screen');
    if (townScreen) townScreen.style.display = 'flex';
    if (startScreen) startScreen.style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('skillbar').style.display = 'none';
    canvas.style.cursor = 'default';
}

function onClickStartAdventure() {
    // Switch to hero selection/start screen, but remain in town-aware flow
    mode = 'run';
    const townScreen = document.getElementById('town-screen');
    const startScreen = document.getElementById('start-screen');
    if (townScreen) townScreen.style.display = 'none';
    if (startScreen) startScreen.style.display = 'flex';
}

function townUpgradeBuilding(type) {
    if (!townState) return;
    const b = townState.buildings;
    const current = b[type] ?? 0;
    if (current >= 10) {
        console.log('[Town] building at max level:', type);
        return;
    }
    // Enforce hall cap
    if (type !== 'hall' && current >= b.hall) {
        console.log('[Town] cannot exceed hall level', b.hall);
        return;
    }
    const cost = townCalcUpgradeCost(type, current);
    if (!cost) {
        console.log('[Town] no cost config for building:', type);
        return;
    }
    if (!townCanAfford(cost)) {
        console.log('[Town] not enough resources to upgrade', type, cost);
        return;
    }
    townSpend(cost);
    b[type] = current + 1;
    updateTownUI();
}

let localPlayerID = null;
let mapWidth = 2000, mapHeight = 1500;
let gameStarted = false;
let lastWave = 0;

// Input state
const keys = {};
let mouseX = 0, mouseY = 0;
let mouseWorldX = 0, mouseWorldY = 0;
let moveTargetIndicator = null;

// ==================== INTERPOLATION ====================
// Store two snapshots and interpolate between them for smooth rendering
let prevSnapshot = null;
let currSnapshot = null;
let snapshotTime = 0;       // when currSnapshot arrived
let renderState = null;      // the interpolated state passed to renderer
const SERVER_TICK_MS = 50;   // 1000/20Hz

function onNewSnapshot(snap) {
    prevSnapshot = currSnapshot;
    currSnapshot = snap;
    snapshotTime = performance.now();
}

// Linearly interpolate between prev and curr snapshot
function lerp(a, b, t) {
    return a + (b - a) * t;
}

function buildRenderState(now) {
    if (!currSnapshot) return null;
    if (!prevSnapshot) return currSnapshot;

    // How far along between prev→curr are we?
    // We render slightly behind (one tick) so we always have data to interpolate
    const elapsed = now - snapshotTime;
    const t = Math.min(1, Math.max(0, elapsed / SERVER_TICK_MS));

    const state = {
        type: 'state',
        tick: currSnapshot.tick,
        wave: currSnapshot.wave,
        map_width: mapWidth,
        map_height: mapHeight,
        effects: currSnapshot.effects,
        drops: currSnapshot.drops,
        damage_nums: t < 0.1 ? currSnapshot.damage_nums : [], // only show dmg nums once
    };

    // Interpolate player positions
    state.players = (currSnapshot.players || []).map(cp => {
        const pp = (prevSnapshot.players || []).find(p => p.id === cp.id);
        if (!pp) return cp;
        return {
            ...cp,
            x: lerp(pp.x, cp.x, t),
            y: lerp(pp.y, cp.y, t),
            angle: lerpAngle(pp.angle || 0, cp.angle || 0, t),
        };
    });

    // Interpolate enemy positions
    state.enemies = (currSnapshot.enemies || []).map(ce => {
        const pe = (prevSnapshot.enemies || []).find(e => e.id === ce.id);
        if (!pe) return ce;
        return {
            ...ce,
            x: lerp(pe.x, ce.x, t),
            y: lerp(pe.y, ce.y, t),
        };
    });

    return state;
}

// Interpolate angles correctly (handle wraparound)
function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

// ==================== INPUT HANDLING ====================
let statsPanelOpen = false;
let inventoryOpen = false;

function toggleStatsPanel() {
    statsPanelOpen = !statsPanelOpen;
    document.getElementById('stats-panel').style.display = statsPanelOpen ? 'block' : 'none';
}

function toggleInventory() {
    inventoryOpen = !inventoryOpen;
    document.getElementById('inventory-panel').style.display = inventoryOpen ? 'block' : 'none';
    if (inventoryOpen) updateInventoryUI();
}

let cachedPlayerData = null;

const RARITY_NAMES = ['普通', '优秀', '稀有', '史诗', '传说'];
const RARITY_COLORS = ['#cccccc', '#44ff44', '#4488ff', '#bb44ff', '#ff8800'];
const SLOT_NAMES = { weapon: '武器', armor: '铠甲', helmet: '头盔', boots: '战靴', ring: '戒指', amulet: '项链' };
const SLOT_ICONS = { weapon: '⚔', armor: '🛡', helmet: '⛑', boots: '👢', ring: '💍', amulet: '📿' };

function updateInventoryUI() {
    if (!cachedPlayerData) return;
    const p = cachedPlayerData;

    // Equipped slots
    const slots = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'];
    for (const slot of slots) {
        const el = document.getElementById('eq-' + slot);
        if (!el) continue;
        const eq = p.equipped?.[slot];
        if (eq) {
            el.innerHTML = `<div class="eq-icon" style="color:${RARITY_COLORS[eq.rarity]}">${SLOT_ICONS[slot]}</div>
                <div class="eq-name" style="color:${RARITY_COLORS[eq.rarity]}">${eq.name}</div>
                <div class="eq-level">Lv.${eq.level}</div>`;
            el.style.borderColor = RARITY_COLORS[eq.rarity];
            el.onclick = (ev) => { ev.stopPropagation(); network.send({ type: 'unequip', slot: slot }); };
            el.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); showItemDetail(eq, 'equipped'); };
        } else {
            el.innerHTML = `<div class="eq-icon" style="color:#333">${SLOT_ICONS[slot]}</div>
                <div class="eq-name" style="color:#555">${SLOT_NAMES[slot]}</div>`;
            el.style.borderColor = '#333';
            el.onclick = null;
            el.oncontextmenu = null;
        }
    }

    // Bag items
    const bagEl = document.getElementById('bag-items');
    bagEl.innerHTML = '';
    const inv = p.inventory || [];
    for (const item of inv) {
        const div = document.createElement('div');
        div.className = 'bag-item';
        div.style.borderColor = RARITY_COLORS[item.rarity];
        div.innerHTML = `<span style="color:${RARITY_COLORS[item.rarity]}">${SLOT_ICONS[item.slot] || '?'}</span>
            <span class="bag-name" style="color:${RARITY_COLORS[item.rarity]}">${item.name}</span>
            <span class="bag-slot">${SLOT_NAMES[item.slot]}</span>
            <span class="bag-level">Lv.${item.level}</span>`;
        div.onclick = (ev) => { ev.stopPropagation(); network.send({ type: 'equip', equip_id: item.id }); };
        div.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); showItemDetail(item, 'bag'); };
        bagEl.appendChild(div);
    }
    document.getElementById('bag-count').textContent = `${inv.length}/20`;
}

function showItemDetail(eq, source) {
    const panel = document.getElementById('item-detail');
    const color = RARITY_COLORS[eq.rarity];
    const rarityName = RARITY_NAMES[eq.rarity];

    let statsHTML = '';
    const statList = [
        ['atk', '攻击力', v => `+${v}`],
        ['def', '防御力', v => `+${v}`],
        ['max_hp', '生命上限', v => `+${v}`],
        ['max_mp', '魔力上限', v => `+${v}`],
        ['atk_speed', '攻击速度', v => `+${(v*100).toFixed(0)}%`],
        ['move_speed', '移动速度', v => `+${v.toFixed(0)}`],
        ['crit_rate', '暴击率', v => `+${(v*100).toFixed(1)}%`],
        ['crit_dmg', '暴击伤害', v => `+${(v*100).toFixed(0)}%`],
        ['hp_regen', '生命回复', v => `+${v.toFixed(1)}/s`],
        ['mp_regen', '魔力回复', v => `+${v.toFixed(1)}/s`],
        ['armor', '护甲', v => `+${v}`],
        ['dodge', '闪避率', v => `+${(v*100).toFixed(1)}%`],
        ['life_steal', '生命偷取', v => `+${(v*100).toFixed(1)}%`],
        ['cd_reduce', '冷却缩减', v => `+${(v*100).toFixed(1)}%`],
        ['dmg_bonus', '伤害加成', v => `+${(v*100).toFixed(1)}%`],
        ['dmg_reduce', '伤害减免', v => `+${(v*100).toFixed(1)}%`],
    ];
    for (const [key, label, fmt] of statList) {
        if (eq[key]) {
            statsHTML += `<div class="detail-stat"><span class="detail-stat-label">${label}</span><span class="detail-stat-val" style="color:#4f4">${fmt(eq[key])}</span></div>`;
        }
    }

    let btnHTML = '';
    if (source === 'bag') {
        btnHTML = `<button class="detail-btn detail-btn-equip" onclick="doEquip('${eq.id}')">装备</button>`;
    } else {
        btnHTML = `<button class="detail-btn detail-btn-unequip" onclick="doUnequip('${eq.slot}')">卸下</button>`;
    }

    panel.innerHTML = `
        <div class="detail-header" style="border-color:${color}">
            <div class="detail-icon" style="color:${color}">${SLOT_ICONS[eq.slot] || '?'}</div>
            <div class="detail-title">
                <div class="detail-name" style="color:${color}">${eq.name}</div>
                <div class="detail-sub"><span style="color:${color}">${rarityName}</span> · ${SLOT_NAMES[eq.slot]} · Lv.${eq.level}</div>
            </div>
            <span class="detail-close" onclick="hideItemDetail()">&times;</span>
        </div>
        <div class="detail-stats">${statsHTML}</div>
        <div class="detail-actions">${btnHTML}</div>
    `;
    panel.style.display = 'block';
}

function hideItemDetail() {
    document.getElementById('item-detail').style.display = 'none';
}

function doEquip(eqID) {
    network.send({ type: 'equip', equip_id: eqID });
    hideItemDetail();
}

function doUnequip(slot) {
    network.send({ type: 'unequip', slot: slot });
    hideItemDetail();
}

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;
    if (key === 'i') {
        toggleStatsPanel();
        e.preventDefault();
        return;
    }
    if (key === 'b') {
        toggleInventory();
        e.preventDefault();
        return;
    }
    if (key === 'f' && gameStarted && !e.repeat) {
        network.send({ type: 'pickup' });
        e.preventDefault();
        return;
    }
    if (key === 'escape') {
        if (statsPanelOpen) { toggleStatsPanel(); e.preventDefault(); return; }
        if (inventoryOpen) { toggleInventory(); e.preventDefault(); return; }
    }
    if (gameStarted && localPlayerID) {
        if (['q', 'w', 'e', 'r'].includes(key)) {
            network.sendCast(key, mouseWorldX, mouseWorldY);
            sfx.resume();
            if (key === 'q') sfx.slash();
            else if (key === 'w') sfx.shieldBash();
            else if (key === 'e') sfx.warCry();
            else if (key === 'r') sfx.ultimate();
        }
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'q', 'e', 'r'].includes(key)) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseWorldX = mouseX - canvas.width / 2 + renderer.camera.x;
    mouseWorldY = mouseY - canvas.height / 2 + renderer.camera.y;
});

window.addEventListener('mousedown', (e) => {
    if (!gameStarted || !localPlayerID) return;
    // Don't handle clicks on UI panels
    if (e.target.closest('#inventory-panel, #stats-panel, #item-detail, #start-screen')) return;
    if (e.button === 0) {
        // 左键：移动
        network.send({ type: 'move', target_x: mouseWorldX, target_y: mouseWorldY });
        moveTargetIndicator = { x: mouseWorldX, y: mouseWorldY, life: 0.6 };
    }
    // 右键不再绑定攻击，仍由 contextmenu 逻辑屏蔽浏览器菜单
});

window.addEventListener('contextmenu', (e) => {
    if (gameStarted && !e.target.closest('#inventory-panel, #stats-panel, #item-detail')) {
        e.preventDefault();
    }
});

window.addEventListener('resize', () => renderer.resize());
renderer.resize();

// ==================== PICKUP NOTIFICATIONS ====================
const pickupNotifs = []; // { text, color, timer }

function showPickupNotif(name, rarity, slot) {
    const color = RARITY_COLORS[rarity] || '#ccc';
    const rarityName = RARITY_NAMES[rarity] || '';
    const slotName = SLOT_NAMES[slot] || '';
    const container = document.getElementById('pickup-notifs');

    const div = document.createElement('div');
    div.className = 'pickup-notif';
    div.style.color = color;
    div.style.textShadow = `0 0 8px ${color}`;
    div.textContent = `获得 [${rarityName}] ${name} (${slotName})`;
    container.appendChild(div);

    // Keep max 5
    while (container.children.length > 5) {
        container.removeChild(container.firstChild);
    }

    // Auto remove after 3s with fade
    setTimeout(() => { div.style.opacity = '0'; }, 2500);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 3000);
}

// ==================== NETWORK HANDLERS ====================
network.onPickup = (msg) => {
    showPickupNotif(msg.name, msg.rarity, msg.slot);
    sfx.pickupRare(msg.rarity);
};

network.onJoined = (msg) => {
    localPlayerID = msg.player_id;
    mapWidth = msg.map_width;
    mapHeight = msg.map_height;
    gameStarted = true;
    document.getElementById('hud').style.display = 'block';
    document.getElementById('skillbar').style.display = 'flex';
};

network.onState = (msg) => {
    onNewSnapshot(msg);

    mouseWorldX = mouseX - canvas.width / 2 + renderer.camera.x;
    mouseWorldY = mouseY - canvas.height / 2 + renderer.camera.y;

    const localPlayer = msg.players?.find(p => p.id === localPlayerID);
    if (localPlayer) {
        cachedPlayerData = localPlayer;
        updateHUD(localPlayer);
        if (inventoryOpen) updateInventoryUI();
    }

    if (msg.wave && msg.wave !== lastWave) {
        lastWave = msg.wave;
        showWaveAnnounce(msg.wave);
    }
};

// ==================== HUD ====================
let lastHP = null;
let lastLevel = null;

function updateHUD(p) {
    // Sound feedback for HP loss and level up
    if (lastHP !== null && p.hp < lastHP) sfx.playerHurt();
    if (lastLevel !== null && p.level > lastLevel) sfx.levelUp();
    lastHP = p.hp;
    lastLevel = p.level;
    const displayMaxHP = Math.round(p.max_hp * runTownBonus.hpMult);
    const displayHP = Math.min(displayMaxHP, p.hp);
    document.getElementById('hp-bar').style.width = (displayHP / displayMaxHP * 100) + '%';
    document.getElementById('mp-bar').style.width = (p.mp / p.max_mp * 100) + '%';
    document.getElementById('hp-text').textContent = `${displayHP} / ${displayMaxHP}`;
    document.getElementById('mp-text').textContent = `${p.mp} / ${p.max_mp}`;
    document.getElementById('lv-val').textContent = p.level;
    document.getElementById('wave-val').textContent = lastWave;
    document.getElementById('xp-bar').style.width = '0%';

    // Update stats panel if open
    if (statsPanelOpen && p.attrs) {
        const a = p.attrs;
        const heroNames = { warrior: '战神·裂天' };
        document.getElementById('stat-name').textContent = p.name || '-';
        document.getElementById('stat-hero').textContent = heroNames[p.hero] || p.hero;
        document.getElementById('stat-level').textContent = p.level;
        document.getElementById('stat-hp').textContent = `${displayHP} / ${displayMaxHP}`;
        document.getElementById('stat-mp').textContent = `${p.mp} / ${p.max_mp}`;
        document.getElementById('stat-atk').textContent = Math.round(a.atk * runTownBonus.atkMult);
        document.getElementById('stat-def').textContent = Math.round(a.def * runTownBonus.defMult);
        document.getElementById('stat-atkspd').textContent = a.atk_speed.toFixed(2) + 'x';
        document.getElementById('stat-movespd').textContent = Math.round(a.move_speed);
        document.getElementById('stat-crit').textContent = (a.crit_rate * 100).toFixed(1) + '%';
        document.getElementById('stat-critdmg').textContent = (a.crit_dmg * 100).toFixed(0) + '%';
        document.getElementById('stat-hpregen').textContent = a.hp_regen.toFixed(1) + '/s';
        document.getElementById('stat-mpregen').textContent = a.mp_regen.toFixed(1) + '/s';
        document.getElementById('stat-armor').textContent = a.armor;
        document.getElementById('stat-dodge').textContent = (a.dodge * 100).toFixed(1) + '%';
        document.getElementById('stat-lifesteal').textContent = (a.life_steal * 100).toFixed(1) + '%';
        document.getElementById('stat-cdreduce').textContent = (a.cd_reduce * 100).toFixed(1) + '%';
        document.getElementById('stat-dmgbonus').textContent = (a.dmg_bonus * 100).toFixed(1) + '%';
        document.getElementById('stat-dmgreduce').textContent = (a.dmg_reduce * 100).toFixed(1) + '%';
    }

    if (p.skills) {
        for (const [slot, sk] of Object.entries(p.skills)) {
            const el = document.getElementById(`skill-${slot}`);
            if (!el) continue;
            const cdEl = el.querySelector('.skill-cd');
            if (sk.cd_remain > 0) {
                cdEl.style.display = 'flex';
                cdEl.textContent = Math.ceil(sk.cd_remain);
                el.style.borderColor = '#333';
            } else {
                cdEl.style.display = 'none';
                el.style.borderColor = slot === 'r' ? '#ffd700' : '#888';
            }
        }
    }
}

function showWaveAnnounce(waveNum) {
    const el = document.getElementById('wave-announce');
    const isBoss = waveNum % 5 === 0;
    el.textContent = isBoss ? `⚠ BOSS WAVE ${waveNum} ⚠` : `WAVE ${waveNum}`;
    el.style.color = isBoss ? '#ff4400' : '#ffd700';
    el.style.textShadow = isBoss ? '0 0 40px rgba(255,68,0,0.6)' : '0 0 40px rgba(255,215,0,0.6)';
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 2500);
    if (isBoss) sfx.bossWave(); else sfx.waveStart();
}

// ==================== GAME LOOP ====================
let lastTime = performance.now();
let sendTickCounter = 0;
let lastSentKeys = null;
let loopStarted = false;
let townResAccum = 0;
let autoAttackAccum = 0;

function gameLoop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Town resource ticking
    if (mode === 'town' && townState) {
        townResAccum += dt;
        if (townResAccum >= 10) {
            const ticks = Math.floor(townResAccum / 10);
            townResAccum -= ticks * 10;
            townApplyResourceTicks(ticks);
        }
    }

    if (gameStarted) {
        sendTickCounter++;

        const curKeys = {
            w: !!keys['arrowup'], a: !!keys['arrowleft'],
            s: !!keys['arrowdown'], d: !!keys['arrowright'],
        };
        const keysChanged = !lastSentKeys ||
            curKeys.w !== lastSentKeys.w || curKeys.a !== lastSentKeys.a ||
            curKeys.s !== lastSentKeys.s || curKeys.d !== lastSentKeys.d;

        if (keysChanged || sendTickCounter >= 6) {
            network.sendInput(curKeys);
            lastSentKeys = curKeys;
            sendTickCounter = 0;
        }

        if (sendTickCounter === 3) {
            network.send({
                type: 'mouse',
                target_x: mouseWorldX,
                target_y: mouseWorldY,
            });
        }

        // 自动攻击：每 2 秒触发一次普通攻击
        autoAttackAccum += dt;
        while (autoAttackAccum >= 2.0) {
            autoAttackAccum -= 2.0;
            if (localPlayerID) {
                network.sendCast('auto', mouseWorldX, mouseWorldY);
                sfx.resume();
                sfx.slash();
            }
        }
    }

    if (moveTargetIndicator) {
        moveTargetIndicator.life -= dt;
        if (moveTargetIndicator.life <= 0) moveTargetIndicator = null;
    }

    // Build interpolated render state
    renderState = buildRenderState(now);

    renderer.render(renderState, localPlayerID, mouseWorldX, mouseWorldY, dt, moveTargetIndicator);

    requestAnimationFrame(gameLoop);
}

function townApplyResourceTicks(ticks) {
    if (!townState || ticks <= 0) return;
    const b = townState.buildings;
    const caps = townGetResourceCaps();
    const r = townState.resources;

    const addWood = townCalcYield('lumber', b.lumber) * ticks;
    const addStone = townCalcYield('quarry', b.quarry) * ticks;
    const addOre = townCalcYield('mine', b.mine) * ticks;

    r.wood = Math.min(caps.wood, r.wood + addWood);
    r.stone = Math.min(caps.stone, r.stone + addStone);
    r.ore = Math.min(caps.ore, r.ore + addOre);

    updateTownUI();
}

function startMainLoopOnce() {
    if (loopStarted) return;
    loopStarted = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// ==================== START ====================
function selectHero(hero) {
    document.getElementById('start-screen').style.display = 'none';
    canvas.style.cursor = 'none';
    townComputeRunBonus();
    sfx.init();
    sfx.resume();
    network.connect();

    const tryJoin = () => {
        if (network.connected) {
            network.sendJoin(hero, '勇士' + Math.floor(Math.random() * 999));
        } else {
            setTimeout(tryJoin, 100);
        }
    };
    tryJoin();
}

window.addEventListener('load', () => {
    initTownState();
    enterTownMode();
    renderer.resize();
    startMainLoopOnce();
});
