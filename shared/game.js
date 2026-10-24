// Kingsfold rules engine. Pure state + actions, shared by the server and the browser.
// apply(state, playerId, action) validates and performs one action, returning an error string or null.

import { GEO, CENTER, RES, RES_NAME, TERRAIN_RES } from './board.js';

export const WIN_CROWNS = 8;
export const MAX_HAND_ON_SEVEN = 7;
export const LIMITS = { road: 15, village: 5, town: 4 };

export const COSTS = {
  road: { wood: 1, brick: 1 },
  village: { wood: 1, brick: 1, wool: 1, grain: 1 },
  town: { grain: 2, iron: 3 },
  card: { wool: 1, grain: 1, iron: 1 },
};

export const WORKSHOPS = {
  bakery: { name: 'Bakery', cost: { grain: 1, brick: 1 }, terrain: 'fields', text: 'Fields next to it pay 1 extra Grain.' },
  lodge: { name: "Hunter's Lodge", cost: { wood: 1, wool: 1 }, terrain: 'forest', text: 'Forests next to it pay 1 extra Wood.' },
  smith: { name: 'Blacksmith', cost: { iron: 1, brick: 1 }, terrain: 'mountains', text: 'Mountains next to it pay 1 extra Iron.' },
  hut: { name: 'Fishing Hut', cost: { wood: 1, grain: 1 }, water: true, text: 'On the river or coast. When a roll pays you nothing, take any 1 card.' },
};

export const HOUSES = {
  lions: { name: 'Lions', color: '#d8342c', shade: '#8a1c1c', emblem: 'sword', power: 'Start with a free Knight card.' },
  scales: { name: 'Scales', color: '#e0a820', shade: '#8a6010', emblem: 'coin', power: 'Trade with the bank 3 for 1.', bankRate: 3 },
  sheaves: { name: 'Sheaves', color: '#ec7a2a', shade: '#9a4414', emblem: 'wheat', power: 'Your first Bakery is free.', freeWorkshop: 'bakery' },
  stags: { name: 'Stags', color: '#3aa040', shade: '#1c5a24', emblem: 'tree', power: "Your first Hunter's Lodge is free.", freeWorkshop: 'lodge' },
  waves: { name: 'Waves', color: '#3a6ee0', shade: '#1c3c98', emblem: 'wave', power: 'Your first Fishing Hut is free.', freeWorkshop: 'hut' },
  anvils: { name: 'Anvils', color: '#8c94a4', shade: '#4a505c', emblem: 'anvil', power: 'Your first Blacksmith is free.', freeWorkshop: 'smith' },
};
export const HOUSE_IDS = Object.keys(HOUSES);

export const NEWS = {
  harvest: { name: 'HARVEST FESTIVAL', text: 'Fields pay double this round.' },
  market: { name: 'MARKET DAY', text: 'Everyone trades with the bank 3 for 1 this round.' },
  tax: { name: 'TAX DAY', text: 'Anyone holding 8 or more cards gave 1 to the King.' },
  gift: { name: 'ROYAL GIFT', text: 'Everyone takes 1 free card of their choice.' },
  dragon: { name: 'A DRAGON!', text: 'Mountains pay nothing this round.' },
  builders: { name: "BUILDERS' WEEK", text: 'Roads cost only 1 Wood this round.' },
  calm: { name: 'A QUIET DAY', text: 'All is calm in Kingsfold.' },
};

export const CARD_INFO = {
  knight: { name: 'Knight', text: 'Move the bandits and steal 1 card.' },
  builder: { name: 'Builders', text: 'Build 2 roads for free this turn.' },
  harvest: { name: 'Harvest', text: 'Take any 2 cards.' },
  crown: { name: 'Secret Crown', text: 'Worth 1 crown. Stays hidden until you win.' },
};
const DECK = [].concat(Array(14).fill('knight'), Array(3).fill('builder'), Array(3).fill('harvest'), Array(5).fill('crown'));

const owns = (s, pid, pred) => s.buildings.reduce((n, b, v) => n + (b && b.owner === pid && pred(b, v) ? 1 : 0), 0);
export const QUESTS = {
  feed: { name: 'FEED THE KING', text: 'Pay 3 Grain to the castle.', pay: { grain: 3 } },
  cloaks: { name: 'WARM CLOAKS', text: 'Pay 3 Wool to the castle.', pay: { wool: 3 } },
  walls: { name: 'MEND THE WALLS', text: 'Pay 2 Brick and 1 Iron to the castle.', pay: { brick: 2, iron: 1 } },
  royalroad: { name: 'ROYAL ROAD', text: 'Own a road that touches the castle.', target: 1,
    metric: (s, p) => GEO.edges.some(e => e.capital && s.roads[e.id] === p) ? 1 : 0 },
  builder: { name: 'MASTER BUILDER', text: 'Own 2 workshops.', target: 2, metric: (s, p) => owns(s, p, b => !!b.workshop) },
  knights: { name: "KNIGHT'S HONOR", text: 'Play 2 Knights.', target: 2, counter: true, metric: (s, p) => s.players[p].knights },
  river: { name: 'RIVERSIDE', text: 'Own 2 places on the river.', target: 2, metric: (s, p) => owns(s, p, (b, v) => GEO.vertices[v].river) },
  towns: { name: 'TWO TOWERS', text: 'Own 2 towns.', target: 2, metric: (s, p) => s.players[p].towns },
  roads: { name: 'TRAVELER', text: 'Build 3 more roads.', target: 3, counter: true, metric: (s, p) => s.players[p].roads },
  trader: { name: 'MERCHANT', text: 'Trade with other players 2 times.', target: 2, counter: true, metric: (s, p) => s.players[p].trades },
  coast: { name: 'SEAFARER', text: 'Own 3 places on the coast.', target: 3, metric: (s, p) => owns(s, p, (b, v) => GEO.vertices[v].coast) },
};

/* ---------- helpers ---------- */

function rnd(s) {
  let t = s.rng = (s.rng + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export const emptyHand = () => ({ wood: 0, brick: 0, wool: 0, grain: 0, iron: 0 });
export const handSize = h => RES.reduce((n, r) => n + (h[r] || 0), 0);
export const canPay = (h, cost) => RES.every(r => (h[r] || 0) >= (cost[r] || 0));
const pay = (h, cost) => RES.forEach(r => { h[r] -= cost[r] || 0; });
const gain = (h, cost) => RES.forEach(r => { h[r] += cost[r] || 0; });
const costText = cost => RES.filter(r => cost[r]).map(r => cost[r] + ' ' + RES_NAME[r]).join(', ');

function cleanCount(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const out = emptyHand();
  for (const r of RES) {
    const n = obj[r] === undefined ? 0 : obj[r];
    if (!Number.isInteger(n) || n < 0 || n > 30) return null;
    out[r] = n;
  }
  return out;
}

function log(s, text) {
  s.log.push(text);
  if (s.log.length > 80) s.log.shift();
}
function event(s, e) {
  e.seq = ++s.eventSeq;
  s.events.push(e);
  if (s.events.length > 30) s.events.shift();
}
const name = (s, pid) => s.players[pid].name;

export function roadCost(s) { return s.news === 'builders' ? { wood: 1 } : COSTS.road; }
export function bankRate(s, pid) {
  let rate = HOUSES[s.players[pid].house].bankRate || 4;
  if (s.news === 'market') rate = Math.min(rate, 3);
  return rate;
}
export function workshopCost(s, pid, kind) {
  const p = s.players[pid];
  if (HOUSES[p.house].freeWorkshop === kind && !p.freeWorkshopUsed) return emptyHand();
  return WORKSHOPS[kind].cost;
}

/* ---------- setup ---------- */

export function createGame({ players, seed }) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) throw new Error('Kingsfold needs 2 to 6 players.');
  const s = {
    seed: seed | 0, rng: seed | 0,
    hexes: [], bandit: CENTER,
    buildings: Array(GEO.vertices.length).fill(null),
    roads: Array(GEO.edges.length).fill(null),
    players: players.map((p, i) => ({
      id: i, name: String(p.name || 'Player ' + (i + 1)).slice(0, 16), house: p.house, color: HOUSES[p.house].color,
      bot: !!p.bot, hand: emptyHand(), cards: [], knights: 0, picks: 0, freeWorkshopUsed: false,
      questCrowns: 0, trades: 0, roads: 0, villages: 0, towns: 0,
    })),
    phase: 'setupVillage', turn: 0, turnCount: 0, round: 0,
    setup: null, dice: null, discards: {}, robberReturn: 'main', stealTargets: [],
    freeRoads: 0, cardPlayed: false, offer: null, offerSeq: 0,
    longest: null, army: null, winner: null,
    news: null, newsDeck: [], quests: [], questDeck: [], deck: [],
    undo: [], log: [], events: [], eventSeq: 0,
  };
  const houses = new Set();
  for (const p of s.players) {
    if (!HOUSES[p.house] || houses.has(p.house)) throw new Error('Each player needs a different house.');
    houses.add(p.house);
    if (p.house === 'lions') p.cards.push({ kind: 'knight', turn: -1 });
  }
  makeBoard(s);
  s.deck = shuffle(s, DECK.slice());
  const order = s.players.map(p => p.id);
  s.setup = { list: order.concat(order.slice().reverse()), i: 0, lastV: null };
  s.turn = s.setup.list[0];
  log(s, 'The kingdom of Kingsfold is founded.');
  return s;
}

function makeBoard(s) {
  const terr = shuffle(s, [].concat(Array(4).fill('forest'), Array(4).fill('pasture'), Array(4).fill('fields'), Array(3).fill('hills'), Array(3).fill('mountains')));
  const nums = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  const land = GEO.hexes.map(h => h.id).filter(i => i !== CENTER);
  let ok = false;
  for (let tries = 0; tries < 500 && !ok; tries++) {
    shuffle(s, nums);
    const num = {};
    land.forEach((h, i) => { num[h] = nums[i]; });
    ok = land.every(h => !(num[h] === 6 || num[h] === 8) || GEO.hexes[h].nbrs.every(n => num[n] !== 6 && num[n] !== 8));
    if (ok || tries === 499) s.hexes = GEO.hexes.map(h => h.id === CENTER ? { terrain: 'capital', number: 0 } : null);
    if (ok || tries === 499) land.forEach((h, i) => { s.hexes[h] = { terrain: terr[i], number: num[h] }; });
  }
}

function startPlay(s) {
  s.turn = 0; s.round = 1; s.turnCount = 1;
  s.phase = 'roll';
  s.questDeck = shuffle(s, Object.keys(QUESTS));
  fillQuests(s);
  drawNews(s);
  log(s, 'Everyone has settled. ' + name(s, 0) + ' goes first.');
}

/* ---------- rules checks ---------- */

export function canPlaceVillage(s, pid, v, setup) {
  if (s.buildings[v]) return false;
  const vert = GEO.vertices[v];
  if (vert.adj.some(n => s.buildings[n])) return false;
  if (setup) return true;
  return vert.edges.some(e => s.roads[e] === pid);
}

export function canPlaceRoad(s, pid, e) {
  if (s.roads[e] !== null) return false;
  const ed = GEO.edges[e];
  return [ed.a, ed.b].some(x => {
    const b = s.buildings[x];
    if (b) return b.owner === pid;
    return GEO.vertices[x].edges.some(o => o !== e && s.roads[o] === pid);
  });
}

export function legalSpots(s, pid) {
  const out = { villages: [], roads: [], towns: [], workshops: [] };
  if (s.phase === 'setupVillage') {
    GEO.vertices.forEach(v => { if (canPlaceVillage(s, pid, v.id, true)) out.villages.push(v.id); });
    return out;
  }
  if (s.phase === 'setupRoad') {
    GEO.vertices[s.setup.lastV].edges.forEach(e => { if (s.roads[e] === null) out.roads.push(e); });
    return out;
  }
  GEO.vertices.forEach(v => {
    if (canPlaceVillage(s, pid, v.id, false)) out.villages.push(v.id);
    const b = s.buildings[v.id];
    if (b && b.owner === pid) {
      if (b.kind === 'village') out.towns.push(v.id);
      if (!b.workshop) out.workshops.push(v.id);
    }
  });
  GEO.edges.forEach(e => { if (canPlaceRoad(s, pid, e.id)) out.roads.push(e.id); });
  return out;
}

export function workshopFits(kind, v) {
  return !WORKSHOPS[kind].water || GEO.vertices[v].coast || GEO.vertices[v].river;
}

/* ---------- scoring ---------- */

export function publicCrowns(s, pid) {
  const p = s.players[pid];
  return p.villages + 2 * p.towns + (s.longest === pid ? 2 : 0) + (s.army === pid ? 2 : 0) + p.questCrowns;
}
export function totalCrowns(s, pid) {
  return publicCrowns(s, pid) + s.players[pid].cards.filter(c => c.kind === 'crown').length;
}

export function roadLength(s, pid) {
  let best = 0;
  const used = new Set();
  const blocked = v => s.buildings[v] && s.buildings[v].owner !== pid;
  const walk = (v, len) => {
    if (len > best) best = len;
    if (blocked(v)) return;
    for (const e of GEO.vertices[v].edges) {
      if (s.roads[e] !== pid || used.has(e)) continue;
      used.add(e);
      const ed = GEO.edges[e];
      walk(ed.a === v ? ed.b : ed.a, len + 1);
      used.delete(e);
    }
  };
  GEO.edges.forEach(ed => {
    if (s.roads[ed.id] !== pid) return;
    for (const to of [ed.a, ed.b]) { used.add(ed.id); walk(to, 1); used.delete(ed.id); }
  });
  return best;
}

function updateLongest(s) {
  const lens = s.players.map(p => roadLength(s, p.id));
  const max = Math.max(...lens);
  const leaders = lens.map((l, i) => l === max && max >= 5 ? i : -1).filter(i => i >= 0);
  let next = null;
  if (leaders.length === 1) next = leaders[0];
  else if (s.longest !== null && leaders.includes(s.longest)) next = s.longest;
  if (next !== s.longest) {
    s.longest = next;
    if (next !== null) { log(s, name(s, next) + ' has the longest road (' + max + ').'); event(s, { type: 'title', title: 'longest', pid: next }); }
  }
}

function updateArmy(s) {
  const cur = s.army;
  s.players.forEach(p => {
    if (p.knights >= 3 && (s.army === null || p.knights > s.players[s.army].knights)) s.army = p.id;
  });
  if (s.army !== cur) { log(s, name(s, s.army) + ' has the most knights.'); event(s, { type: 'title', title: 'army', pid: s.army }); }
}

/* ---------- quests & news ---------- */

function fillQuests(s) {
  let guard = 0;
  while (s.quests.length < 3 && guard++ < 40) {
    if (!s.questDeck.length) {
      const active = new Set(s.quests.map(q => q.id));
      s.questDeck = shuffle(s, Object.keys(QUESTS).filter(id => !active.has(id)));
      if (!s.questDeck.length) return;
    }
    const id = s.questDeck.pop();
    const q = QUESTS[id];
    if (q.metric && !q.counter && guard < 30 && s.players.some(p => q.metric(s, p.id) >= q.target)) continue;
    s.quests.push({ id, base: s.players.map(p => q.counter ? q.metric(s, p.id) : 0) });
  }
}

function awardQuest(s, pid, idx) {
  const inst = s.quests[idx];
  s.quests.splice(idx, 1);
  s.players[pid].questCrowns++;
  s.undo = [];
  log(s, name(s, pid) + ' finished the quest ' + QUESTS[inst.id].name + ' and earned a crown!');
  event(s, { type: 'quest', pid, quest: inst.id });
  fillQuests(s);
}

function checkQuests(s) {
  if (s.phase === 'setupVillage' || s.phase === 'setupRoad' || s.phase === 'over') return;
  const n = s.players.length;
  for (let i = 0; i < s.quests.length; i++) {
    const inst = s.quests[i], q = QUESTS[inst.id];
    if (!q.metric) continue;
    for (let k = 0; k < n; k++) {
      const pid = (s.turn + k) % n;
      if (q.metric(s, pid) - inst.base[pid] >= q.target) { awardQuest(s, pid, i); i = -1; break; }
    }
  }
}

function drawNews(s) {
  if (!s.newsDeck.length) s.newsDeck = shuffle(s, Object.keys(NEWS));
  s.news = s.newsDeck.pop();
  const n = NEWS[s.news];
  log(s, 'News from the King: ' + n.name + ' ' + n.text);
  if (s.news === 'tax') {
    s.players.forEach(p => {
      if (handSize(p.hand) >= 8) { const r = randomCard(s, p.hand); p.hand[r]--; }
    });
  }
  if (s.news === 'gift') s.players.forEach(p => { p.picks++; });
  event(s, { type: 'news', news: s.news, round: s.round });
}

function randomCard(s, hand) {
  let k = Math.floor(rnd(s) * handSize(hand));
  for (const r of RES) { if (k < hand[r]) return r; k -= hand[r]; }
  return null;
}

/* ---------- turn flow ---------- */

function produce(s, sum) {
  const gains = s.players.map(() => emptyHand());
  const hexGains = [];
  s.hexes.forEach((h, i) => {
    if (h.number !== sum || i === s.bandit) return;
    if (s.news === 'dragon' && h.terrain === 'mountains') return;
    const res = TERRAIN_RES[h.terrain];
    GEO.hexes[i].vertices.forEach(v => {
      const b = s.buildings[v];
      if (!b) return;
      let amt = b.kind === 'town' ? 2 : 1;
      if (b.workshop && WORKSHOPS[b.workshop].terrain === h.terrain) amt += 1;
      if (s.news === 'harvest' && h.terrain === 'fields') amt *= 2;
      gains[b.owner][res] += amt;
      hexGains.push({ hex: i, pid: b.owner, res, amt });
    });
  });
  s.players.forEach(p => {
    gain(p.hand, gains[p.id]);
    const got = costText(gains[p.id]);
    if (got) log(s, name(s, p.id) + ' collects ' + got + '.');
  });
  fishingHuts(s, gains);
  return hexGains;
}

function fishingHuts(s, gains) {
  s.players.forEach(p => {
    if (gains && handSize(gains[p.id]) > 0) return;
    const hasHut = s.buildings.some(b => b && b.owner === p.id && b.workshop === 'hut');
    if (hasHut) { p.picks++; log(s, name(s, p.id) + "'s Fishing Hut brings in a free card."); }
  });
}

function nextTurn(s) {
  s.freeRoads = 0; s.offer = null; s.cardPlayed = false; s.undo = []; s.dice = null;
  s.turn = (s.turn + 1) % s.players.length;
  s.turnCount++;
  if (s.turn === 0) { s.round++; drawNews(s); }
  s.phase = 'roll';
  log(s, name(s, s.turn) + "'s turn.");
  event(s, { type: 'turn', pid: s.turn });
}

function startRobber(s, from) {
  s.robberReturn = from;
  s.phase = 'robber';
}

function stealFrom(s, thief, victim) {
  const r = randomCard(s, s.players[victim].hand);
  if (!r) return;
  s.players[victim].hand[r]--;
  s.players[thief].hand[r]++;
  log(s, name(s, thief) + ' stole a card from ' + name(s, victim) + '.');
  event(s, { type: 'steal', from: victim, to: thief, res: r });
}

function checkWin(s) {
  if (s.phase === 'setupVillage' || s.phase === 'setupRoad' || s.winner !== null) return;
  const pid = s.turn;
  if (totalCrowns(s, pid) >= WIN_CROWNS) {
    s.winner = pid;
    s.phase = 'over';
    s.offer = null;
    log(s, 'Long live ' + name(s, pid) + ', heir to the throne of Kingsfold!');
    event(s, { type: 'win', pid });
  }
}

/* ---------- actions ---------- */

const onTurn = (s, pid) => pid === s.turn;
const inMain = (s, pid) => s.phase === 'main' && pid === s.turn ? null : (pid !== s.turn ? "It's not your turn." : 'You can do that after rolling.');

const ACTIONS = {
  placeVillage(s, pid, a) {
    if (s.phase !== 'setupVillage' || !onTurn(s, pid)) return 'Not your time to place a village.';
    const v = a.v;
    if (!Number.isInteger(v) || !GEO.vertices[v] || !canPlaceVillage(s, pid, v, true)) return 'You cannot build there.';
    const p = s.players[pid];
    s.buildings[v] = { owner: pid, kind: 'village', workshop: null };
    p.villages++;
    if (s.setup.i >= s.players.length) {
      const got = emptyHand();
      GEO.vertices[v].hexes.forEach(h => { const res = TERRAIN_RES[s.hexes[h].terrain]; if (res) got[res]++; });
      gain(p.hand, got);
      if (costText(got)) log(s, p.name + ' starts with ' + costText(got) + '.');
    }
    s.setup.lastV = v;
    s.phase = 'setupRoad';
    event(s, { type: 'build', what: 'village', v, pid });
  },
  placeRoad(s, pid, a) {
    if (s.phase !== 'setupRoad' || !onTurn(s, pid)) return 'Not your time to place a road.';
    const e = a.e;
    if (!Number.isInteger(e) || !GEO.edges[e] || s.roads[e] !== null) return 'You cannot build there.';
    const ed = GEO.edges[e];
    if (ed.a !== s.setup.lastV && ed.b !== s.setup.lastV) return 'The road must touch your new village.';
    s.roads[e] = pid;
    s.players[pid].roads++;
    event(s, { type: 'build', what: 'road', e, pid });
    s.setup.i++;
    if (s.setup.i >= s.setup.list.length) startPlay(s);
    else { s.turn = s.setup.list[s.setup.i]; s.phase = 'setupVillage'; }
  },
  roll(s, pid) {
    if (s.phase !== 'roll' || !onTurn(s, pid)) return 'You cannot roll now.';
    const d = [1 + Math.floor(rnd(s) * 6), 1 + Math.floor(rnd(s) * 6)];
    s.dice = d;
    const sum = d[0] + d[1];
    s.undo = [];
    log(s, name(s, pid) + ' rolled ' + sum + '.');
    if (sum === 7) {
      event(s, { type: 'roll', pid, dice: d, gains: [] });
      fishingHuts(s, null);
      s.discards = {};
      s.players.forEach(p => { const n = handSize(p.hand); if (n > MAX_HAND_ON_SEVEN) s.discards[p.id] = Math.floor(n / 2); });
      log(s, 'The bandits come out of the slum!');
      if (Object.keys(s.discards).length) s.phase = 'discard';
      else startRobber(s, 'main');
    } else {
      const gains = produce(s, sum);
      event(s, { type: 'roll', pid, dice: d, gains });
      s.phase = 'main';
    }
  },
  discard(s, pid, a) {
    if (s.phase !== 'discard' || !s.discards[pid]) return 'You do not need to drop cards.';
    const c = cleanCount(a.cards);
    if (!c) return 'Pick which cards to drop.';
    if (handSize(c) !== s.discards[pid]) return 'Drop exactly ' + s.discards[pid] + ' cards.';
    if (!canPay(s.players[pid].hand, c)) return 'You do not have those cards.';
    pay(s.players[pid].hand, c);
    log(s, name(s, pid) + ' dropped ' + s.discards[pid] + ' cards.');
    delete s.discards[pid];
    if (!Object.keys(s.discards).length) startRobber(s, 'main');
  },
  moveBandit(s, pid, a) {
    if (s.phase !== 'robber' || !onTurn(s, pid)) return 'You cannot move the bandits now.';
    const h = a.hex;
    if (!Number.isInteger(h) || !GEO.hexes[h]) return 'Pick a land.';
    if (h === s.bandit) return 'The bandits must move to a different land.';
    s.bandit = h;
    event(s, { type: 'bandit', hex: h, pid });
    log(s, h === CENTER ? name(s, pid) + ' sent the bandits back to the slum.' : name(s, pid) + ' moved the bandits.');
    const targets = [...new Set(GEO.hexes[h].vertices.map(v => s.buildings[v] && s.buildings[v].owner))]
      .filter(o => o !== null && o !== undefined && o !== pid && handSize(s.players[o].hand) > 0);
    if (targets.length === 1) stealFrom(s, pid, targets[0]);
    if (targets.length > 1) { s.stealTargets = targets; s.phase = 'steal'; return; }
    s.phase = s.robberReturn;
  },
  steal(s, pid, a) {
    if (s.phase !== 'steal' || !onTurn(s, pid)) return 'You cannot steal now.';
    if (!s.stealTargets.includes(a.target)) return 'Pick someone living next to the bandits.';
    stealFrom(s, pid, a.target);
    s.stealTargets = [];
    s.phase = s.robberReturn;
  },
  build(s, pid, a) {
    const err = inMain(s, pid);
    if (err) return err;
    const p = s.players[pid];
    if (a.what === 'road') {
      const e = a.e;
      if (!Number.isInteger(e) || !GEO.edges[e] || !canPlaceRoad(s, pid, e)) return 'Roads must connect to your own roads or places.';
      if (p.roads >= LIMITS.road) return 'You have no roads left.';
      const free = s.freeRoads > 0;
      const cost = free ? emptyHand() : roadCost(s);
      if (!canPay(p.hand, cost)) return 'A road costs ' + costText(cost) + '.';
      pay(p.hand, cost);
      if (free) s.freeRoads--;
      s.roads[e] = pid; p.roads++;
      s.undo.push({ what: 'road', e, paid: cost, free });
      event(s, { type: 'build', what: 'road', e, pid });
      return;
    }
    if (a.what === 'village') {
      const v = a.v;
      if (!Number.isInteger(v) || !GEO.vertices[v] || !canPlaceVillage(s, pid, v, false)) return 'Villages need one of your roads and space around them.';
      if (p.villages >= LIMITS.village) return 'You have no villages left. Upgrade one to a town.';
      if (!canPay(p.hand, COSTS.village)) return 'A village costs ' + costText(COSTS.village) + '.';
      pay(p.hand, COSTS.village);
      s.buildings[v] = { owner: pid, kind: 'village', workshop: null };
      p.villages++;
      s.undo.push({ what: 'village', v, paid: COSTS.village });
      log(s, p.name + ' built a village.');
      event(s, { type: 'build', what: 'village', v, pid });
      return;
    }
    if (a.what === 'town') {
      const v = a.v, b = s.buildings[v];
      if (!b || b.owner !== pid || b.kind !== 'village') return 'Towns are built on your own villages.';
      if (p.towns >= LIMITS.town) return 'You have no towns left.';
      if (!canPay(p.hand, COSTS.town)) return 'A town costs ' + costText(COSTS.town) + '.';
      pay(p.hand, COSTS.town);
      b.kind = 'town'; p.villages--; p.towns++;
      s.undo.push({ what: 'town', v, paid: COSTS.town });
      log(s, p.name + ' grew a village into a town.');
      event(s, { type: 'build', what: 'town', v, pid });
      return;
    }
    if (a.what === 'workshop') {
      const v = a.v, b = s.buildings[v], kind = a.kind;
      if (!WORKSHOPS[kind]) return 'Pick a workshop.';
      if (!b || b.owner !== pid) return 'Workshops go on your own villages or towns.';
      if (b.workshop) return 'That place already has a workshop.';
      if (!workshopFits(kind, v)) return 'A Fishing Hut must be on the river or the coast.';
      const cost = workshopCost(s, pid, kind);
      if (!canPay(p.hand, cost)) return 'A ' + WORKSHOPS[kind].name + ' costs ' + costText(cost) + '.';
      const freeUsed = handSize(cost) === 0;
      pay(p.hand, cost);
      if (freeUsed) p.freeWorkshopUsed = true;
      b.workshop = kind;
      s.undo.push({ what: 'workshop', v, paid: cost, freeUsed });
      log(s, p.name + ' built a ' + WORKSHOPS[kind].name + '.');
      event(s, { type: 'build', what: 'workshop', v, kind, pid });
      return;
    }
    return 'Build what?';
  },
  undo(s, pid) {
    const err = inMain(s, pid);
    if (err) return err;
    const u = s.undo.pop();
    if (!u) return 'Nothing to undo.';
    const p = s.players[pid];
    gain(p.hand, u.paid);
    if (u.what === 'road') { s.roads[u.e] = null; p.roads--; if (u.free) s.freeRoads++; }
    if (u.what === 'village') { s.buildings[u.v] = null; p.villages--; }
    if (u.what === 'town') { s.buildings[u.v].kind = 'village'; p.towns--; p.villages++; }
    if (u.what === 'workshop') { s.buildings[u.v].workshop = null; if (u.freeUsed) p.freeWorkshopUsed = false; }
    event(s, { type: 'undo', pid });
  },
  buyCard(s, pid) {
    const err = inMain(s, pid);
    if (err) return err;
    const p = s.players[pid];
    if (!s.deck.length) return "The King's cards have run out.";
    if (!canPay(p.hand, COSTS.card)) return "A King's card costs " + costText(COSTS.card) + '.';
    pay(p.hand, COSTS.card);
    const kind = s.deck.pop();
    p.cards.push({ kind, turn: s.turnCount });
    s.undo = [];
    log(s, p.name + " bought a King's card.");
    event(s, { type: 'card', pid, kind });
  },
  playCard(s, pid, a) {
    if (!onTurn(s, pid) || (s.phase !== 'roll' && s.phase !== 'main')) return 'You cannot play a card now.';
    if (s.cardPlayed) return 'You can play only one card per turn.';
    const kind = a.kind;
    if (!CARD_INFO[kind] || kind === 'crown') return 'That card cannot be played.';
    const p = s.players[pid];
    const idx = p.cards.findIndex(c => c.kind === kind && c.turn < s.turnCount);
    if (idx < 0) return p.cards.some(c => c.kind === kind) ? 'Cards can be played from your next turn.' : 'You do not have that card.';
    if (kind === 'builder' && s.phase !== 'main') return 'Roll first, then play Builders.';
    p.cards.splice(idx, 1);
    s.cardPlayed = true;
    s.undo = [];
    log(s, p.name + ' played ' + CARD_INFO[kind].name + '.');
    event(s, { type: 'play', pid, kind });
    if (kind === 'knight') { p.knights++; updateArmy(s); startRobber(s, s.phase); }
    if (kind === 'builder') s.freeRoads += 2;
    if (kind === 'harvest') p.picks += 2;
  },
  pick(s, pid, a) {
    const p = s.players[pid];
    if (!p || p.picks < 1) return 'You have no free cards to take.';
    if (!RES.includes(a.res)) return 'Pick a resource.';
    p.hand[a.res]++;
    p.picks--;
  },
  bankTrade(s, pid, a) {
    const err = inMain(s, pid);
    if (err) return err;
    if (!RES.includes(a.give) || !RES.includes(a.get) || a.give === a.get) return 'Pick what to give and what to get.';
    const rate = bankRate(s, pid), p = s.players[pid];
    if (p.hand[a.give] < rate) return 'The bank wants ' + rate + ' ' + RES_NAME[a.give] + '.';
    p.hand[a.give] -= rate; p.hand[a.get]++;
    s.undo = [];
    log(s, p.name + ' traded ' + rate + ' ' + RES_NAME[a.give] + ' to the bank for 1 ' + RES_NAME[a.get] + '.');
    event(s, { type: 'bank', pid, give: a.give, get: a.get, rate });
  },
  offer(s, pid, a) {
    const err = inMain(s, pid);
    if (err) return err;
    const give = cleanCount(a.give), get = cleanCount(a.get);
    if (!give || !get || !handSize(give) || !handSize(get)) return 'An offer needs something to give and something to get.';
    if (RES.some(r => give[r] && get[r])) return 'You cannot give and ask for the same resource.';
    if (!canPay(s.players[pid].hand, give)) return 'You do not have those cards.';
    s.offer = { id: ++s.offerSeq, from: pid, give, get, declined: [] };
    log(s, name(s, pid) + ' offers ' + costText(give) + ' for ' + costText(get) + '.');
  },
  cancelOffer(s, pid) {
    if (!s.offer || s.offer.from !== pid) return 'No offer to cancel.';
    s.offer = null;
  },
  acceptOffer(s, pid, a) {
    const o = s.offer;
    if (!o || o.id !== a.id) return 'That offer is gone.';
    if (o.from === pid) return 'That is your own offer.';
    if (s.phase !== 'main') return 'That offer is gone.';
    const me = s.players[pid], them = s.players[o.from];
    if (!canPay(me.hand, o.get)) return 'You do not have the cards they want.';
    if (!canPay(them.hand, o.give)) return 'They no longer have those cards.';
    pay(them.hand, o.give); gain(me.hand, o.give);
    pay(me.hand, o.get); gain(them.hand, o.get);
    me.trades++; them.trades++;
    s.offer = null; s.undo = [];
    log(s, me.name + ' traded with ' + them.name + '.');
    event(s, { type: 'trade', from: o.from, to: pid });
  },
  declineOffer(s, pid, a) {
    const o = s.offer;
    if (!o || o.id !== a.id || o.from === pid) return 'That offer is gone.';
    if (!o.declined.includes(pid)) o.declined.push(pid);
  },
  payQuest(s, pid, a) {
    const err = inMain(s, pid);
    if (err) return err;
    const idx = s.quests.findIndex(q => q.id === a.quest);
    if (idx < 0 || !QUESTS[a.quest].pay) return 'That quest is not on the board.';
    const p = s.players[pid], cost = QUESTS[a.quest].pay;
    if (!canPay(p.hand, cost)) return 'That quest needs ' + costText(cost) + '.';
    pay(p.hand, cost);
    awardQuest(s, pid, idx);
  },
  endTurn(s, pid) {
    const err = inMain(s, pid);
    if (err) return err;
    nextTurn(s);
  },
};

export function apply(s, pid, a) {
  if (s.winner !== null) return 'The game is over.';
  if (!a || typeof a.type !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, a.type)) return 'Unknown action.';
  if (!s.players[pid]) return 'Unknown player.';
  const err = ACTIONS[a.type](s, pid, a);
  if (err) return err;
  updateLongest(s);
  checkQuests(s);
  checkWin(s);
  return null;
}

/* ---------- who has to act, and what each player may see ---------- */

export function pendingPlayers(s) {
  if (s.phase === 'over') return [];
  if (s.phase === 'discard') return Object.keys(s.discards).map(Number);
  return [s.turn];
}

export function viewFor(s, pid) {
  const v = JSON.parse(JSON.stringify(s));
  delete v.rng; delete v.seed;
  v.deck = s.deck.length; v.newsDeck = s.newsDeck.length; v.questDeck = s.questDeck.length; v.undo = s.undo.length;
  v.players.forEach(p => {
    p.handCount = handSize(p.hand);
    p.cardCount = p.cards.length;
    p.crowns = publicCrowns(s, p.id);
    p.roadLength = roadLength(s, p.id);
    if (s.winner !== null) p.totalCrowns = totalCrowns(s, p.id);
    if (p.id !== pid && s.winner === null) { p.hand = null; p.cards = null; }
  });
  v.events.forEach(e => {
    if (e.type === 'steal' && e.from !== pid && e.to !== pid) delete e.res;
    if (e.type === 'card' && e.pid !== pid) delete e.kind;
  });
  v.you = pid;
  return v;
}
