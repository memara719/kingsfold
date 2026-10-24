import test from 'node:test';
import assert from 'node:assert/strict';
import { GEO, CENTER, RES } from '../shared/board.js';
import {
  createGame, apply, viewFor, pendingPlayers, legalSpots, handSize, totalCrowns, roadLength,
  HOUSE_IDS, WIN_CROWNS, COSTS,
} from '../shared/game.js';
import { botAction } from '../shared/bot.js';

const seats = n => HOUSE_IDS.slice(0, n).map((house, i) => ({ name: 'P' + i, house, bot: true }));

function nextActor(s) {
  for (const p of s.players) if (p.picks > 0) return p.id;
  if (s.offer && s.phase === 'main')
    for (const p of s.players) if (p.id !== s.offer.from && !s.offer.declined.includes(p.id)) return p.id;
  return pendingPlayers(s)[0];
}

function playOut(s, maxSteps = 20000) {
  let steps = 0;
  while (s.winner === null && steps++ < maxSteps) {
    const pid = nextActor(s);
    const a = botAction(s, pid);
    assert.ok(a, `bot had no move in phase ${s.phase}`);
    const err = apply(s, pid, a);
    assert.equal(err, null, `bot move failed: ${err} ${JSON.stringify(a)} in ${s.phase}`);
    for (const p of s.players) for (const r of RES) assert.ok(p.hand[r] >= 0, 'negative hand');
  }
  return steps;
}

test('board geometry', () => {
  assert.equal(GEO.hexes.length, 19);
  assert.equal(GEO.vertices.length, 54);
  assert.equal(GEO.edges.length, 72);
  assert.ok(GEO.riverPath.length > 8, 'river is drawn');
  assert.ok(GEO.vertices.filter(v => v.capital).length === 6);
});

test('board setup is fair', () => {
  for (let seed = 1; seed < 50; seed++) {
    const s = createGame({ players: seats(4), seed });
    assert.equal(s.hexes[CENTER].terrain, 'capital');
    const reds = s.hexes.map((h, i) => (h.number === 6 || h.number === 8 ? i : -1)).filter(i => i >= 0);
    for (const h of reds) for (const n of GEO.hexes[h].nbrs) assert.ok(![6, 8].includes(s.hexes[n].number), 'red numbers touch');
  }
});

test('bot games finish with a rightful winner', () => {
  let totalTurns = 0, games = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const n = 2 + (seed % 5);
    const s = createGame({ players: seats(n), seed });
    playOut(s);
    assert.notEqual(s.winner, null, `seed ${seed} never ended`);
    assert.ok(totalCrowns(s, s.winner) >= WIN_CROWNS);
    totalTurns += s.round; games++;
  }
  const avg = totalTurns / games;
  assert.ok(avg < 40, 'games take too many rounds: ' + avg);
  console.log('average rounds per game:', avg.toFixed(1));
});

test('setup: distance rule and road must touch the new village', () => {
  const s = createGame({ players: seats(3), seed: 7 });
  const v = 0;
  assert.equal(apply(s, 0, { type: 'placeVillage', v }), null);
  const farEdge = GEO.edges.find(e => e.a !== v && e.b !== v).id;
  assert.match(apply(s, 0, { type: 'placeRoad', e: farEdge }), /touch/);
  assert.equal(apply(s, 0, { type: 'placeRoad', e: GEO.vertices[v].edges[0] }), null);
  assert.match(apply(s, 1, { type: 'placeVillage', v: GEO.vertices[v].adj[0] }), /cannot build/);
});

function afterSetup(seed = 3, n = 3) {
  const s = createGame({ players: seats(n), seed });
  while (s.phase.startsWith('setup')) { const pid = s.turn; assert.equal(apply(s, pid, botAction(s, pid)), null); }
  return s;
}

test('second village pays starting cards', () => {
  const s = afterSetup();
  assert.ok(s.players.every(p => handSize(p.hand) >= 1 && handSize(p.hand) <= 3));
  assert.equal(s.phase, 'roll');
  assert.ok(s.news);
});

test('cannot build before rolling or on someone else turn', () => {
  const s = afterSetup();
  assert.match(apply(s, 0, { type: 'buyCard' }), /after rolling/);
  assert.match(apply(s, 1, { type: 'roll' }), /cannot roll/);
});

test('undo gives the cards back', () => {
  const s = afterSetup();
  s.phase = 'main';
  const p = s.players[0];
  Object.assign(p.hand, { wood: 3, brick: 3, wool: 1, grain: 1, iron: 0 });
  const e = legalSpots(s, 0).roads[0];
  assert.equal(apply(s, 0, { type: 'build', what: 'road', e }), null);
  assert.equal(p.hand.wood, 2);
  assert.equal(apply(s, 0, { type: 'undo' }), null);
  assert.equal(p.hand.wood, 3);
  assert.equal(s.roads[e], null);
});

test('rolling a 7 makes big hands drop half', () => {
  for (let seed = 1; seed < 400; seed++) {
    const s = afterSetup(seed);
    s.players[1].hand = { wood: 4, brick: 3, wool: 2, grain: 0, iron: 0 };
    apply(s, 0, { type: 'roll' });
    if (s.dice[0] + s.dice[1] !== 7) continue;
    assert.equal(s.phase, 'discard');
    assert.equal(s.discards[1], 4);
    assert.match(apply(s, 1, { type: 'discard', cards: { wood: 1 } }), /exactly 4/);
    assert.equal(apply(s, 1, { type: 'discard', cards: { wood: 2, brick: 2 } }), null);
    assert.equal(s.phase, 'robber');
    assert.match(apply(s, 0, { type: 'moveBandit', hex: s.bandit }), /different/);
    return;
  }
  assert.fail('never rolled a 7');
});

test('trading with another player', () => {
  const s = afterSetup();
  s.phase = 'main';
  s.players[0].hand = { wood: 2, brick: 0, wool: 0, grain: 0, iron: 0 };
  s.players[1].hand = { wood: 0, brick: 0, wool: 0, grain: 0, iron: 1 };
  assert.equal(apply(s, 0, { type: 'offer', give: { wood: 2 }, get: { iron: 1 } }), null);
  assert.equal(apply(s, 1, { type: 'acceptOffer', id: s.offer.id }), null);
  assert.equal(s.players[0].hand.iron, 1);
  assert.equal(s.players[1].hand.wood, 2);
  assert.equal(s.offer, null);
});

test('houses: scales trade 3 for 1, sheaves get a free bakery', () => {
  const s = createGame({ players: [{ name: 'A', house: 'scales' }, { name: 'B', house: 'sheaves' }], seed: 5 });
  while (s.phase.startsWith('setup')) { const pid = s.turn; apply(s, pid, botAction(s, pid)); }
  s.phase = 'main';
  s.players[0].hand = { wood: 3, brick: 0, wool: 0, grain: 0, iron: 0 };
  assert.equal(apply(s, 0, { type: 'bankTrade', give: 'wood', get: 'iron' }), null);
  assert.equal(s.players[0].hand.iron, 1);
  apply(s, 0, { type: 'endTurn' });
  s.phase = 'main';
  s.players[1].hand = { wood: 0, brick: 0, wool: 0, grain: 0, iron: 0 };
  const v = legalSpots(s, 1).workshops[0];
  assert.equal(apply(s, 1, { type: 'build', what: 'workshop', v, kind: 'bakery' }), null);
  assert.equal(s.buildings[v].workshop, 'bakery');
});

test('longest road counts a chain and is cut by other buildings', () => {
  const s = createGame({ players: seats(2), seed: 1 });
  // walk a path of 5 connected edges around the rim
  const path = [];
  let v = GEO.vertices.find(x => x.coast).id, prev = -1;
  for (let i = 0; i < 6; i++) {
    const next = GEO.vertices[v].adj.find(n => n !== prev && GEO.vertices[n].coast);
    path.push(GEO.edgeBetween(v, next)); prev = v; v = next;
  }
  path.forEach(e => { s.roads[e] = 0; });
  assert.equal(roadLength(s, 0), 6);
  const mid = GEO.edges[path[2]].b === GEO.edges[path[3]].a || GEO.edges[path[2]].b === GEO.edges[path[3]].b ? GEO.edges[path[2]].b : GEO.edges[path[2]].a;
  s.buildings[mid] = { owner: 1, kind: 'village', workshop: null };
  assert.equal(roadLength(s, 0), 3);
});

test('players cannot see each other\'s hands', () => {
  const s = afterSetup();
  const v = viewFor(s, 1);
  assert.equal(v.players[0].hand, null);
  assert.ok(v.players[1].hand);
  assert.equal(typeof v.deck, 'number');
  assert.equal(v.rng, undefined);
});

test('bad input is refused', () => {
  const s = afterSetup();
  s.phase = 'main';
  assert.ok(apply(s, 0, { type: 'build', what: 'village', v: 9999 }));
  assert.ok(apply(s, 0, { type: 'offer', give: { wood: -1 }, get: { iron: 1 } }));
  assert.ok(apply(s, 0, { type: 'nope' }));
  assert.ok(apply(s, 0, { type: '__proto__' }));
  assert.ok(apply(s, 0, null));
  assert.ok(apply(s, 9, { type: 'roll' }));
  assert.equal(handSize(s.players[0].hand) >= 0, true);
  assert.ok(COSTS.village);
});
