// File: ui.js — Antflow App Store Edition
'use strict';

/* ================= ネイティブ課金・広告ブリッジ（Capacitor接続用） ================= */
const AppBridge = {
  isNative() { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); },
  buyProduct(productId, title, priceLabel, onSuccess) {
    // Webプロトタイプ時は確認ダイアログで即テスト購入可能（本番はIAP SDKへ差し替え）
    if (confirm('【テスト課金】\n' + title + '（' + priceLabel + '）を購入しますか？')) {
      onSuccess();
      toast('🎉 ' + title + ' を購入しました！', 2600);
    }
  },
  showRewardAd(label, onReward) {
    // Webプロトタイプ時は動画広告視聴をシミュレート（本番はAdMob Rewardedへ差し替え）
    toast('🎬 広告を再生中…（' + label + '）', 1200);
    setTimeout(() => {
      onReward();
    }, 900);
  }
};

/* ================= セーブデータ＆ライフ・経済管理 ================= */
const HEART_MAX = 5;
const HEART_REGEN_MS = 20 * 60 * 1000; // 20分で1回復

const APP_DEF = {
  coins: 500,
  hearts: HEART_MAX,
  heartAt: 0,
  infHeartUntil: 0,
  noAds: false,
  streak: 0,
  firstWins: 0,
  name: 'Player',
  bst: { slot: 1, shuffle: 1, pickup: 1, tornado: 1 },
  daily: { day: '', step: 0 },
  boughtOnce: {}
};

function initAppSave() {
  for (const k in APP_DEF) {
    if (save[k] == null || typeof save[k] !== typeof APP_DEF[k]) {
      save[k] = JSON.parse(JSON.stringify(APP_DEF[k]));
    }
  }
  for (const b of ['slot', 'shuffle', 'pickup', 'tornado']) {
    if (typeof save.bst[b] !== 'number') save.bst[b] = 1;
  }
  if (!save.settings) save.settings = { bgm: true, sfx: true, vib: true, cb: false, wash: true, dim: true, info: false, talk: true, steps: false };
  save.settings.wash = true;
  save.settings.dim = true;
  if (!save.skin) save.skin = 'none';
}
initAppSave();

function isInfHeart() { return (save.infHeartUntil || 0) > Date.now(); }

function syncHearts() {
  if (isInfHeart()) { save.hearts = HEART_MAX; save.heartAt = 0; return; }
  if (save.hearts >= HEART_MAX) { save.hearts = HEART_MAX; save.heartAt = 0; return; }
  const now = Date.now();
  if (!save.heartAt) save.heartAt = now;
  const elapsed = now - save.heartAt;
  if (elapsed >= HEART_REGEN_MS) {
    const add = Math.floor(elapsed / HEART_REGEN_MS);
    save.hearts = Math.min(HEART_MAX, save.hearts + add);
    save.heartAt = save.hearts >= HEART_MAX ? 0 : save.heartAt + add * HEART_REGEN_MS;
    persist();
  }
}

function spendHeart() {
  if (isInfHeart()) return;
  syncHearts();
  if (save.hearts > 0) {
    if (save.hearts === HEART_MAX) save.heartAt = Date.now();
    save.hearts--;
    persist();
  }
  updateTopBar();
}

function refillHearts(n) {
  save.hearts = Math.min(HEART_MAX, save.hearts + n);
  if (save.hearts >= HEART_MAX) save.heartAt = 0;
  persist();
  updateTopBar();
}

function addInfHeartMinutes(min) {
  const base = Math.max(Date.now(), save.infHeartUntil || 0);
  save.infHeartUntil = base + min * 60 * 1000;
  save.hearts = HEART_MAX;
  save.heartAt = 0;
  persist();
  updateTopBar();
}

/* ================= ゲーム状態（render.js 互換） ================= */
G.overlay = '';
G.pickupMode = false;
G.pressJ = -1;
G.waitIds = new Set();
G.lastTapT = 0;
G.bgmBanner = null;

const Tut = {
  wantCol: () => -1,
  busy: () => false,
  blocking: () => false,
  update: () => {},
  levelStart: () => {}
};

let toastTm = null;
function toast(msg, ms) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTm);
  toastTm = setTimeout(() => el.classList.remove('show'), ms || 2200);
}

function showOv(name) {
  document.querySelectorAll('.ov').forEach(el => el.classList.remove('show'));
  const el = $('#ov-' + name);
  if (el) el.classList.add('show');
  G.overlay = name || '';
}

function hideOv() {
  document.querySelectorAll('.ov').forEach(el => el.classList.remove('show'));
  G.overlay = '';
}

/* ================= ハブ＆画面切り替え ================= */
function enterHub(tab) {
  hideOv();
  $('#app').classList.remove('show');
  $('#hub').classList.add('show');
  Sound.stopAll && Sound.stopAll();
  switchTab(tab || 'home');
  updateTopBar();
  updateHomeUI();
}

function enterGame() {
  $('#hub').classList.remove('show');
  $('#app').classList.add('show');
  $('#adBanner').classList.toggle('hidden', !!save.noAds);
  layout();
}

function switchTab(tab) {
  document.querySelectorAll('.hub-pane').forEach(p => p.classList.remove('show'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const pane = $('#pane-' + tab);
  if (pane) pane.classList.add('show');
  if (tab === 'shop') renderShop();
  else if (tab === 'album') renderAlbum();
  else if (tab === 'rank') renderRank();
  else if (tab === 'home') updateHomeUI();
}

function fmtTimer(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return m + 'm' + (r < 10 ? '0' : '') + r + 's';
}

function updateTopBar() {
  syncHearts();
  $('#hubCoins').textContent = (save.coins || 0).toLocaleString();
  const inf = isInfHeart();
  $('#hubHearts').textContent = inf ? '∞' : save.hearts;
  if (inf) {
    $('#hubHeartTimer').textContent = fmtTimer(save.infHeartUntil - Date.now());
  } else if (save.hearts < HEART_MAX && save.heartAt) {
    $('#hubHeartTimer').textContent = fmtTimer(HEART_REGEN_MS - (Date.now() - save.heartAt));
  } else {
    $('#hubHeartTimer').textContent = 'MAX';
  }
}

function updateHomeUI() {
  const pos = posOf(save.level || 1);
  $('#playLvNum').textContent = pos;
  $('#homeStreak').textContent = '🔥 ' + (save.streak || 0) + ' 連勝中';
  const nextMile = Math.ceil(pos / 5) * 5;
  const pct = ((pos % 5) || 5) / 5 * 100;
  $('#mileFill').style.width = pct + '%';
  $('#mileTxt').textContent = 'Level ' + nextMile + ' まであと ' + (nextMile - pos + 1);
  const art = ARTS[idAt(pos) - 1];
  $('#homeArtHint').textContent = art ? 'つぎの絵：' + art.n : '';
  const today = new Date().toISOString().slice(0, 10);
  const dailyDone = save.daily.day === today && save.daily.step >= 5;
  $('#dailyDot').style.display = dailyDone ? 'none' : 'grid';
  $('#bFloatNoAds').style.display = save.noAds ? 'none' : 'flex';
}

/* ================= ショップ（ライバル準拠バンドル） ================= */
const SHOP_BUNDLES = [
  { id: 'noads_bundle', tag: '一番人気', title: 'No Ads Bundle', desc: '広告完全削除 + 🪙1,000 + 全ブースター×1 + ∞❤️2h', price: '¥2,000', ico: '📺🚫', cls: '', once: true, grant() { save.noAds = true; save.coins += 1000; addAllBoosters(1); addInfHeartMinutes(120); } },
  { id: 'noads_only', tag: '', title: 'No Ads（広告削除）', desc: 'プレイ中バナー＆強制広告をずっと非表示', price: '¥1,300', ico: '🚫', cls: 'noads-only', once: true, grant() { save.noAds = true; } },
  { id: 'limited', tag: 'BEST SELLER', title: 'Limited Bundle', desc: '🪙2,000 + 全ブースター×2 + ∞❤️1h', price: '¥800', ico: '🎁', cls: 'best', once: false, grant() { save.coins += 2000; addAllBoosters(2); addInfHeartMinutes(60); } },
  { id: 'small', tag: '', title: 'Small Bundle', desc: '🪙5,000 + 全ブースター×1 + ∞❤️3h', price: '¥1,500', ico: '👜', cls: '', once: false, grant() { save.coins += 5000; addAllBoosters(1); addInfHeartMinutes(180); } },
  { id: 'medium', tag: '', title: 'Medium Bundle', desc: '🪙10,000 + 全ブースター×3 + ∞❤️6h', price: '¥3,000', ico: '🧰', cls: '', once: false, grant() { save.coins += 10000; addAllBoosters(3); addInfHeartMinutes(360); } },
  { id: 'ultra', tag: '', title: 'Ultra Bundle', desc: '🪙25,000 + 全ブースター×6 + ∞❤️12h', price: '¥6,000', ico: '🏦', cls: '', once: false, grant() { save.coins += 25000; addAllBoosters(6); addInfHeartMinutes(720); } },
  { id: 'legendary', tag: 'BEST VALUE', title: 'Legendary Bundle', desc: '🪙70,000 + 全ブースター×18 + ∞❤️24h', price: '¥15,000', ico: '👑', cls: 'best', once: false, grant() { save.coins += 70000; addAllBoosters(18); addInfHeartMinutes(1440); } }
];

const COIN_PACKS = [
  { id: 'c1000', coins: 1000, price: '¥300' },
  { id: 'c5000', coins: 5000, price: '¥1,300' },
  { id: 'c10000', coins: 10000, price: '¥2,500' },
  { id: 'c25000', coins: 25000, price: '¥5,000' },
  { id: 'c50000', coins: 50000, price: '¥9,000' },
  { id: 'c100000', coins: 100000, price: '¥15,000' }
];

function addAllBoosters(n) {
  save.bst.slot += n;
  save.bst.shuffle += n;
  save.bst.pickup += n;
  save.bst.tornado += n;
}

function renderShop() {
  const el = $('#shopScroll');
  let html = '';
  for (const b of SHOP_BUNDLES) {
    const bought = b.once && save.boughtOnce[b.id];
    html += '<div class="shop-card ' + b.cls + '">' +
      (b.tag ? '<span class="shop-tag">' + b.tag + '</span>' : '') +
      '<div class="shop-row">' +
        '<div class="shop-ico">' + b.ico + '</div>' +
        '<div class="shop-info"><b>' + b.title + '</b><small>' + b.desc + '</small></div>' +
        '<button type="button" class="shop-buy ' + (bought ? 'done' : '') + '" data-bundle="' + b.id + '" ' + (bought ? 'disabled' : '') + '>' + (bought ? '購入済' : b.price) + '</button>' +
      '</div></div>';
  }
  html += '<div class="coin-grid">';
  for (const c of COIN_PACKS) {
    html += '<button type="button" class="coin-pack" data-cpack="' + c.id + '">' +
      '<div>🪙</div><b>' + c.coins.toLocaleString() + '</b><span>' + c.price + '</span></button>';
  }
  html += '</div>';
  el.innerHTML = html;

  el.querySelectorAll('[data-bundle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = SHOP_BUNDLES.find(x => x.id === btn.dataset.bundle);
      if (!b) return;
      AppBridge.buyProduct(b.id, b.title, b.price, () => {
        b.grant();
        if (b.once) save.boughtOnce[b.id] = 1;
        persist(); updateTopBar(); updateHomeUI(); renderShop();
        $('#adBanner').classList.toggle('hidden', !!save.noAds);
      });
    });
  });

  el.querySelectorAll('[data-cpack]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = COIN_PACKS.find(x => x.id === btn.dataset.cpack);
      if (!c) return;
      AppBridge.buyProduct(c.id, '🪙 ' + c.coins.toLocaleString() + ' コイン', c.price, () => {
        save.coins += c.coins;
        persist(); updateTopBar();
      });
    });
  });
}

/* ================= アルバム・ランキング ================= */
function renderAlbum() {
  const grid = $('#albumGrid');
  let clearedCount = 0;
  grid.innerHTML = '';
  for (let p = 1; p <= TOTAL; p++) {
    const id = idAt(p), art = ARTS[id - 1], ok = !!save.cleared[id];
    if (ok) clearedCount++;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'acard' + (ok ? '' : ' lock');
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    if (ok && art) drawArtThumb(cv, id);
    const b = document.createElement('b');
    b.textContent = ok && art ? art.n : 'Lv.' + p;
    card.appendChild(cv); card.appendChild(b);
    if (ok) card.addEventListener('click', () => openView(id));
    grid.appendChild(card);
  }
  $('#albumSum').textContent = clearedCount + ' / ' + TOTAL;
  $('#albumSumBar').style.width = Math.round(clearedCount / TOTAL * 100) + '%';
}

function drawArtThumb(cv, id) {
  const g = cv.getContext('2d');
  const rast = getArt(id);
  const W = rast.W, H = rast.H, s = Math.floor(Math.min(56 / W, 56 / H));
  const ox = (64 - W * s) / 2, oy = (64 - H * s) / 2;
  g.clearRect(0, 0, 64, 64);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = rast.grid[y * W + x];
    if (c >= 0) { g.fillStyle = HEX[c]; g.fillRect(ox + x * s, oy + y * s, s, s); }
  }
}

function openView(id) {
  const art = ARTS[id - 1];
  if (!art) return;
  G.viewId = id;
  $('#viewName').textContent = art.n;
  drawArtThumb($('#viewCv'), id);
  $('#viewInfo').textContent = 'Level ' + posOf(id) + ' のピクセルアート';
  showOv('view');
}

function renderRank() {
  const myLv = posOf(save.level || 1);
  const rows = [
    { name: 'Emi', lv: Math.max(120, myLv + 40) },
    { name: 'Haru', lv: Math.max(85, myLv + 18) },
    { name: 'Mina', lv: Math.max(50, myLv + 6) },
    { name: save.name + '（あなた）', lv: myLv, me: true },
    { name: 'Ken', lv: Math.max(1, myLv - 3) }
  ].sort((a, b) => b.lv - a.lv);
  $('#rankList').innerHTML = rows.map((r, i) =>
    '<div class="rank-item ' + (r.me ? 'me' : '') + '">' +
      '<div class="rank-num">#' + (i + 1) + '</div>' +
      '<div class="rank-name">' + r.name + '</div>' +
      '<div class="rank-lv">Lv.' + r.lv + '</div>' +
    '</div>'
  ).join('');
}

/* ================= ステージ読み込み＆コアパズル ================= */
function loadLevel(id) {
  syncHearts();
  if (!isInfHeart() && save.hearts <= 0) {
    openLifeModal();
    return;
  }
  SLOT_COUNT = 5; // 毎回5枠で開始（Extra Slotで6枠になる）
  id = clamp(id, 1, TOTAL);
  enterGame();
  G.loading = true; G.clearShown = false; G.pendingWin = false; G.pendingJam = false; G.jamDismissed = false;
  G.pickupMode = false;
  const tok = ++G.loadTok;
  const tm = setTimeout(() => { if (tok === G.loadTok && G.loading) showOv('load'); }, 120);
  ensureLevel(id, L => {
    if (tok !== G.loadTok) return;
    clearTimeout(tm);
    applyLevel(id, L);
    if (G.overlay === 'load') hideOv();
  });
}

function applyLevel(id, L) {
  G.levelId = id; G.level = L; G.s = makeState(L);
  G.undo = []; G.moves = []; G.queued = null;
  G.antSpeed = clamp((L.W + L.H) * 0.36, 8, 42) * 0.54;
  G.run = { started: false, done: false, time: 0, candies: 0, maxCombo: 0 };
  G.par = parTimes(L); G.waitIds = new Set();
  endFever();
  G.gold = new Set();
  G.pickFlashes = []; G.newReachFlashes = []; G.assignFlashes = [];
  G.recCol = -1; G.hintCol = -1; G.lastTapT = G.rt;
  save.level = id; persist();
  layout(); resetVisual();
  G.loading = false;
  Sound.setBgm(L.name, L.theme);
  updateHUD();
  updateBoosterBar();
}

function headCounts(s) {
  const out = new Array(s.cols.length).fill(0);
  for (let j = 0; j < s.cols.length; j++) {
    if (s.heads[j] >= s.cols[j].length) continue;
    const t = cloneState(s), b = place(t, j, null);
    out[j] = b.n - b.rem;
  }
  return out;
}

function resetVisual() {
  G.vgrid = G.s.grid.slice(); G.vver++; G.boardDirty = true;
  G.pgrid = G.vgrid.slice(); G.pver++;
  G.ants = []; G.parts = []; G.bubbles = []; G.popups = []; G.vboxes = []; G.assignFlashes = []; G.skillFx = [];
  G.parades = []; G.lastOut = new Array(SLOT_COUNT).fill(null);
  G.vslots = new Array(SLOT_COUNT).fill(null);
  G.trayOff = new Array(G.s.cols.length).fill(0);
  G.rc = reachableCounts(G.s); G.hc = null;
  G.hudDirty = true;
}

function onTapCol(j, anyRow) {
  if (G.overlay || !G.s || G.pendingWin || G.loading) return;
  const s = G.s;
  if (s.heads[j] >= s.cols[j].length) return;
  if (s.boxes.length >= SLOT_COUNT) {
    G.shake = { j, t: 0.24 }; G.slotFlash = 0.4; Sound.deny(); haptic(20);
    return;
  }
  const free = G.vslots.indexOf(null);
  if (free < 0) return;
  if (G.run && !G.run.started) G.run.started = true;
  G.moves.push(j);
  const ev = [];
  place(s, j, ev);
  let newId = -1, got = 0, assignOrd = 0;
  for (const e of ev) {
    if (e.type === 'place') {
      const vb = { id: e.id, c: e.c, total: e.n, dispatched: 0, picked: 0, queue: [], slot: free, state: 'fly', t: 0, logicalDone: false, nextT: 0, fx: trayX(j), fy: trayHeadY, fs: headSize };
      G.vboxes.push(vb); G.vslots[free] = vb;
      newId = e.id;
    } else {
      const vb = G.vboxes.find(v => v.id === e.id);
      if (!vb) continue;
      if (e.type === 'assign') {
        vb.queue.push(...e.cells);
        for (let ci = 0; ci < e.cells.length; ci++) {
          G.assignFlashes.push({ idx: e.cells[ci], c: vb.c, t0: G.rt + Math.min(0.18, assignOrd * 0.015), dur: 0.36 });
          assignOrd++;
        }
        if (e.id === newId) got += e.cells.length;
      } else {
        vb.logicalDone = true;
      }
    }
  }
  if (G.fever.t <= 0) {
    G.fever.g = Math.min(1, G.fever.g + got * 0.005);
    if (G.fever.g >= 1) startFever();
  }
  G.trayOff[j] = trayGap;
  G.rc = reachableCounts(s); G.hc = null; G.boardDirty = true; G.lastTapT = G.rt;
  Sound.tap(); haptic(8);
  G.hudDirty = true;
  if (s.left === 0 && !G.pendingWin) { G.pendingWin = true; G.endT = 0; if (G.run) G.run.done = true; }
  else if (isJam(s)) { G.pendingJam = true; G.endT = 0; }
}

function updateHUD() {
  G.hudDirty = false;
  if (!G.s) return;
  const pos = posOf(G.levelId);
  $('#lvNum').textContent = 'Level ' + pos;
  $('#lvName').textContent = G.level ? G.level.name : '';
  const pct = G.level.total ? Math.round((G.level.total - G.s.left) / G.level.total * 100) : 0;
  $('#progBar').style.width = pct + '%';
  $('#leftTxt').textContent = G.s.left;
}

/* ================= 4つのブースター（課金・消費ポイント） ================= */
const BST_INFO = {
  slot: { title: 'Extra Slot（枠+1）', desc: 'スロットを1枠増やします（6枠になります）', price: 1600, ico: '📥' },
  shuffle: { title: 'Shuffle（シャッフル）', desc: '待機列のボックスをシャッフルします', price: 1400, ico: '🔀' },
  pickup: { title: 'Pick Up（ピックアップ）', desc: '待機列のどのボックスでも1つ選んで出せます', price: 1600, ico: '🦾' },
  tornado: { title: 'Tornado（1色けし）', desc: '盤面で一番多い色のキャンディを一気に片づけます', price: 1800, ico: '🌀' }
};
let buyingBst = null;

function updateBoosterBar() {
  for (const k of ['slot', 'shuffle', 'pickup', 'tornado']) {
    const n = save.bst[k] || 0;
    const el = $('#cnt' + k[0].toUpperCase() + k.slice(1));
    if (el) el.textContent = n > 0 ? n : '+';
  }
  $('#bBstPickup').classList.toggle('active', !!G.pickupMode);
}

function triggerBooster(k) {
  if (G.overlay || !G.s || G.pendingWin) return;
  if ((save.bst[k] || 0) <= 0) {
    openBuyBooster(k);
    return;
  }
  if (k === 'slot') {
    if (SLOT_COUNT >= 6) { toast('すでに6枠に拡張済みです！', 1800); return; }
    expandSlotByOne();
    save.bst.slot--;
    toast('📥 スロットが6枠になりました！', 1800);
  } else if (k === 'shuffle') {
    shuffleQueueBoxes();
    save.bst.shuffle--;
    toast('🔀 ボックスをシャッフルしました！', 1800);
  } else if (k === 'pickup') {
    G.pickupMode = !G.pickupMode;
    toast(G.pickupMode ? '🦾 待機列から好きな列をタップしよう！' : 'ピックアップをキャンセル', 2000);
  } else if (k === 'tornado') {
    useTornado();
    save.bst.tornado--;
  }
  persist();
  updateBoosterBar();
}

function expandSlotByOne() {
  SLOT_COUNT = 6;
  G.vslots.push(null);
  G.lastOut.push(null);
  G.pendingJam = false;
  G.jamDismissed = false;
  layout();
  Sound.tap();
}

function shuffleQueueBoxes() {
  const pool = [];
  for (let j = 0; j < G.s.cols.length; j++) {
    for (let i = G.s.heads[j]; i < G.s.cols[j].length; i++) pool.push(G.s.cols[j][i]);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[r]] = [pool[r], pool[i]];
  }
  let idx = 0;
  for (let j = 0; j < G.s.cols.length; j++) {
    for (let i = G.s.heads[j]; i < G.s.cols[j].length; i++) G.s.cols[j][i] = pool[idx++];
  }
  G.hc = null; G.boardDirty = true; Sound.tap();
}

function useTornado() {
  const counts = new Map();
  for (let i = 0; i < G.s.grid.length; i++) {
    const c = G.s.grid[i];
    if (c >= 0) counts.set(c, (counts.get(c) || 0) + 1);
  }
  let bestC = -1, bestN = 0;
  counts.forEach((n, c) => { if (n > bestN) { bestN = n; bestC = c; } });
  if (bestC < 0) return;
  let removed = 0;
  for (let i = 0; i < G.s.grid.length; i++) {
    if (G.s.grid[i] === bestC) { G.s.grid[i] = -1; G.vgrid[i] = -1; G.pgrid[i] = -1; removed++; }
  }
  G.s.left = Math.max(0, G.s.left - removed);
  G.vver++; G.pver++; G.boardDirty = true; G.hudDirty = true;
  G.rc = reachableCounts(G.s); G.hc = null;
  if (typeof Sound.fever === 'function') Sound.fever();
  toast('🌀 ' + removed + 'このキャンディを一掃！', 2000);
  if (G.s.left === 0 && !G.pendingWin) { G.pendingWin = true; G.endT = 0; }
}

function openBuyBooster(k) {
  buyingBst = k;
  const info = BST_INFO[k];
  $('#bstTitle').textContent = info.title;
  $('#bstIco').textContent = info.ico;
  $('#bstDesc').textContent = info.desc;
  $('#bBstBuy').textContent = '🪙 ' + info.price.toLocaleString();
  showOv('booster');
}

/* ================= クリア・失敗（Out of slots ＋ Fail Offer） ================= */
function showClear() {
  if (G.clearShown) return;
  G.clearShown = true;
  endFever();
  const R = G.run || { time: 30 };
  const stars = timeStars(R.time, G.par);
  save.cleared[G.levelId] = Math.max(save.cleared[G.levelId] || 0, stars);
  save.streak = (save.streak || 0) + 1;
  if (!G.jamDismissed) save.firstWins = (save.firstWins || 0) + 1;
  const reward = 25 + stars * 5 + Math.min(20, save.streak * 2);
  save.coins += reward;
  const nextId = G.levelId < TOTAL ? idAt(posOf(G.levelId) + 1) : G.levelId;
  save.level = nextId;
  persist();
  updateTopBar();
  $('#clearName').textContent = G.level ? G.level.name : '';
  $('#clearStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('#clearReward').textContent = '🪙 +' + reward + (save.streak >= 2 ? '（🔥' + save.streak + '連勝）' : '');
  drawArtThumb($('#revealCv'), ARTS[G.levelId]);
  Fx.rain(60);
  Sound.win && Sound.win();
  showOv('clear');
}

function showJam() {
  if (G.overlay) return;
  Sound.deny && Sound.deny();
  showOv('jam');
}

function rescueContinue(freeCost) {
  if (!freeCost) {
    if (save.coins < 900) {
      toast('🪙 コインが足りません！（900必要）', 2000);
      enterHub('shop');
      return;
    }
    save.coins -= 900;
  }
  // 枠を6に拡張（すでに6なら先頭のスロットを1つ待機列へ戻す）
  if (SLOT_COUNT < 6) {
    expandSlotByOne();
  } else {
    const vb = G.vslots[0];
    if (vb) {
      G.s.boxes = G.s.boxes.filter(b => b.id !== vb.id);
      G.vboxes = G.vboxes.filter(v => v.id !== vb.id);
      G.vslots[0] = null;
    }
    G.pendingJam = false; G.jamDismissed = false;
  }
  persist(); updateTopBar(); hideOv();
  toast('✨ 復活！つづきから遊べます', 1800);
}

/* ================= ライフ・デイリー・設定モーダル ================= */
function openLifeModal() {
  syncHearts();
  $('#lifeVal').textContent = isInfHeart() ? '∞' : save.hearts;
  $('#lifeNextTxt').textContent = isInfHeart()
    ? '無制限あと ' + fmtTimer(save.infHeartUntil - Date.now())
    : (save.hearts >= HEART_MAX ? 'MAX（満タン）' : '次の回復まで：' + fmtTimer(HEART_REGEN_MS - (Date.now() - save.heartAt)));
  showOv('life');
}

const DAILY_STEPS = [
  { label: '🪙 50 コイン', ad: false, grant() { save.coins += 50; } },
  { label: '🪙 100 コイン', ad: true, grant() { save.coins += 100; } },
  { label: '🪙 150 コイン', ad: true, grant() { save.coins += 150; } },
  { label: '♾️❤️ 15分 無制限', ad: true, grant() { addInfHeartMinutes(15); } },
  { label: '🪙 200 コイン', ad: true, grant() { save.coins += 200; } }
];

function openDaily() {
  const today = new Date().toISOString().slice(0, 10);
  if (save.daily.day !== today) { save.daily.day = today; save.daily.step = 0; persist(); }
  renderDaily();
  showOv('daily');
}

function renderDaily() {
  const step = save.daily.step || 0;
  $('#dailyList').innerHTML = DAILY_STEPS.map((d, i) => {
    const done = i < step, cur = i === step;
    const btnCls = done ? 'done' : (d.ad ? 'ad' : '');
    const btnTxt = done ? '受取済' : (cur ? (d.ad ? '🎬 受取る' : '無料受取') : '🔒');
    return '<div class="daily-row"><b>' + d.label + '</b>' +
      '<button type="button" class="daily-btn ' + btnCls + '" data-dstep="' + i + '" ' + (cur ? '' : 'disabled') + '>' + btnTxt + '</button></div>';
  }).join('');
  $('#dailyList').querySelectorAll('[data-dstep]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.dstep;
      const d = DAILY_STEPS[i];
      const claim = () => {
        d.grant();
        save.daily.step = i + 1;
        persist(); updateTopBar(); updateHomeUI(); renderDaily();
        toast('🎁 ' + d.label + ' を獲得！', 1800);
      };
      if (d.ad) AppBridge.showRewardAd(d.label, claim);
      else claim();
    });
  });
}

function updateSettingsUI() {
  $('#tBgm').classList.toggle('off', !save.settings.bgm);
  $('#tSfx').classList.toggle('off', !save.settings.sfx);
  $('#tVib').classList.toggle('off', !save.settings.vib);
  $('#tCb').classList.toggle('off', !save.settings.cb);
}

/* ================= マスコット描画 ================= */
function drawMascot(cv, t) {
  if (!cv) return;
  const g = cv.getContext('2d');
  if (cv.width !== 240) { cv.width = 240; cv.height = 240; }
  g.clearRect(0, 0, 240, 240);
  g.save();
  g.translate(120, 128 + Math.sin(t * 3) * 6);
  g.scale(1.6, 1.6);
  drawAntShape(g, 28, 2, 'walk', Math.floor(t * 6) % 2, 'none');
  g.restore();
}

/* ================= 入力イベント（キャンバス） ================= */
const gameCv = $('#game');
function canvasPos(e) {
  const r = gameCv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function hitTrayCol(x, y) {
  if (!G.s) return -1;
  for (let j = 0; j < G.s.cols.length; j++) {
    if (G.s.heads[j] >= G.s.cols[j].length) continue;
    const cx = trayX(j);
    if (Math.abs(x - cx) <= headSize * 0.56 && y >= trayHeadY - headSize * 0.55 && y <= trayHeadY + headSize * 0.65) {
      return j;
    }
  }
  return -1;
}

gameCv.addEventListener('pointerdown', e => {
  const p = canvasPos(e);
  const j = hitTrayCol(p.x, p.y);
  if (j >= 0) {
    G.pressJ = j; G.press = { j, x: p.x, y: p.y, t: G.rt };
  }
});

gameCv.addEventListener('pointerup', e => {
  const p = canvasPos(e);
  const j = hitTrayCol(p.x, p.y);
  if (j >= 0 && G.pressJ === j) {
    if (G.pickupMode) {
      G.pickupMode = false;
      save.bst.pickup = Math.max(0, (save.bst.pickup || 0) - 1);
      persist(); updateBoosterBar();
    }
    onTapCol(j);
  }
  G.press = null; G.pressJ = -1;
});

/* ================= ボタン結線 ================= */
function on(sel, fn) { const el = $(sel); if (el) el.addEventListener('click', fn); }

document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
on('#bPlay', () => loadLevel(save.level || 1));
on('#bTopCoin', () => switchTab('shop'));
on('#bTopHeart', openLifeModal);
on('#bFloatNoAds', () => switchTab('shop'));
on('#bFloatDaily', openDaily);
on('#bProfile', () => {
  $('#profName').textContent = save.name || 'Player';
  $('#profLv').textContent = 'Level ' + posOf(save.level || 1);
  $('#achGrid').innerHTML =
    '<div class="ach-box"><b>' + (save.firstWins || 0) + '</b><small>一発クリア</small></div>' +
    '<div class="ach-box"><b>' + (save.streak || 0) + '</b><small>現在の連勝</small></div>' +
    '<div class="ach-box"><b>' + Object.keys(save.cleared || {}).length + '</b><small>クリア数</small></div>' +
    '<div class="ach-box"><b>' + TOTAL + '</b><small>全ステージ</small></div>';
  showOv('profile');
});
on('#bSet', () => { updateSettingsUI(); showOv('settings'); });

on('#bPause', () => showOv('pause'));
on('#bPauseClose', hideOv);
on('#bPauseResume', hideOv);
on('#bPauseRetry', () => { hideOv(); spendHeart(); save.streak = 0; persist(); loadLevel(G.levelId); });
on('#bPauseHome', () => { spendHeart(); save.streak = 0; persist(); enterHub('home'); });

on('#bSpeed', () => {
  G.spdMul = G.spdMul > 1 ? 1 : 2;
  $('#bSpeed').textContent = G.spdMul > 1 ? '⏩ 2x' : '⏩ 1x';
  $('#bSpeed').classList.toggle('on', G.spdMul > 1);
});

on('#bBstSlot', () => triggerBooster('slot'));
on('#bBstShuffle', () => triggerBooster('shuffle'));
on('#bBstPickup', () => triggerBooster('pickup'));
on('#bBstTornado', () => triggerBooster('tornado'));
on('#bBstClose', hideOv);
on('#bBstBuy', () => {
  if (!buyingBst) return;
  const info = BST_INFO[buyingBst];
  if (save.coins < info.price) {
    hideOv();
    toast('🪙 コインが足りません！ショップで補充しよう', 2200);
    enterHub('shop');
    return;
  }
  save.coins -= info.price;
  save.bst[buyingBst] = (save.bst[buyingBst] || 0) + 3;
  persist(); updateTopBar(); updateBoosterBar(); hideOv();
  toast(info.ico + ' ×3 を購入しました！', 1800);
});

on('#bNext', () => { hideOv(); loadLevel(save.level || 1); });
on('#bClearHome', () => enterHub('home'));

on('#bJamClose', () => { G.jamDismissed = true; hideOv(); });
on('#bJamContinue', () => rescueContinue(false));
on('#bFailOffer', () => {
  AppBridge.buyProduct('fail_offer', 'Fail Offer（復活＋2,700🪙＋ブースター）', '¥1,000', () => {
    save.coins += 2700;
    save.bst.shuffle++; save.bst.pickup++; save.bst.tornado++;
    rescueContinue(true);
  });
});
on('#bJamGiveUp', () => {
  spendHeart(); save.streak = 0; persist();
  enterHub('home');
});

on('#bLifeClose', hideOv);
on('#bLifeCoin', () => {
  if (save.coins < 800) { toast('🪙 コインが足りません', 1800); hideOv(); switchTab('shop'); return; }
  save.coins -= 800;
  refillHearts(HEART_MAX);
  hideOv();
  toast('❤️ ハートが満タンになりました！', 1800);
});
on('#bLifeAd', () => {
  AppBridge.showRewardAd('❤️ +1 回復', () => {
    refillHearts(1);
    hideOv();
    toast('❤️ ハートが +1 回復しました！', 1800);
  });
});

on('#bDailyClose', hideOv);
on('#bProfClose', hideOv);
on('#bSetClose', hideOv);
on('#bViewClose', hideOv);
on('#bViewPlay', () => { hideOv(); loadLevel(G.viewId); });
on('#bBannerRemove', () => {
  if (confirm('プレイ中の広告を消すにはショップへ移動しますか？（このステージを中断します）')) enterHub('shop');
});

on('#tBgm', () => { save.settings.bgm = !save.settings.bgm; persist(); updateSettingsUI(); Sound.syncBgm && Sound.syncBgm(); });
on('#tSfx', () => { save.settings.sfx = !save.settings.sfx; persist(); updateSettingsUI(); });
on('#tVib', () => { save.settings.vib = !save.settings.vib; persist(); updateSettingsUI(); });
on('#tCb', () => { save.settings.cb = !save.settings.cb; persist(); updateSettingsUI(); G.boardDirty = true; });
on('#bSetPrivacy', () => alert('プライバシーポリシー：プレイデータは端末内に保存されます。'));
on('#bSetRestore', () => toast('購入履歴を確認しました（最新です）', 2000));
on('#bReset', () => {
  if (confirm('進行状況とコインをすべてリセットしますか？')) {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }
});

/* ================= メインループ ================= */
let lastT = performance.now(), lastDrawT = 0, lastTopT = 0;
function frame(now) {
  const rdt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
  lastT = now;
  const dt = rdt * (G.spdMul || 1);
  G.rt += rdt;

  if (now - lastTopT > 900) {
    lastTopT = now;
    if ($('#hub').classList.contains('show')) updateTopBar();
  }

  if ($('#app').classList.contains('show') && G.s && CW > 0) {
    G.time += dt;
    if (G.run && G.run.started && !G.run.done && !G.overlay && !G.loading) G.run.time += rdt;
    if (G.fever.t > 0 && !G.overlay) { G.fever.t -= rdt; if (G.fever.t <= 0) endFever(); }
    updateBoxes(dt); updateAnts(dt, rdt); updateParts(dt);
    for (let j = 0; j < G.trayOff.length; j++) { G.trayOff[j] *= Math.exp(-rdt * 16); if (G.trayOff[j] < 0.3) G.trayOff[j] = 0; }
    G.nestBounce = Math.max(0, G.nestBounce - rdt * 5);
    G.slotFlash = Math.max(0, G.slotFlash - rdt);
    G.jamShake = Math.max(0, G.jamShake - rdt);
    if (G.shake) { G.shake.t -= rdt; if (G.shake.t <= 0) G.shake = null; }
    checkEnd(rdt);
    if (G.hudDirty) updateHUD();
    if ((!G.overlay || G.boardDirty) && now - lastDrawT >= 15) {
      lastDrawT = now;
      draw();
    }
  } else if ($('#hub').classList.contains('show') && !G.overlay) {
    drawMascot($('#mascot'), G.rt);
  }
  if (G.overlay === 'load') drawMascot($('#loadCv'), G.rt * 1.6);
  Fx.update(rdt); Fx.draw();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  if ($('#app').classList.contains('show')) layout();
  Fx.resize();
});

Fx.resize();
enterHub('home');
requestAnimationFrame(frame);

AF_LOADED.push('ui.js');
