// Simple bots for Kingsfold. They fill empty seats and take over when a turn timer runs out.
// A bot only looks at its own hand and public information.

import { GEO, CENTER, RES } from './board.js';
import {
  COSTS, WORKSHOPS, QUESTS, LIMITS, canPay, handSize, legalSpots, workshopFits,
  workshopCost, bankRate, roadCost, publicCrowns, canPlaceVillage,
} from './game.js';

const pips = n => (n ? 6 - Math.abs(7 - n) : 0);

function spotValue(s, v, pid) {
  const seen = new Set();
  let val = 0;
  GEO.vertices[v].hexes.forEach(h => {
    const hx = s.hexes[h];
    if (h === CENTER || h === s.bandit) return;
    val += pips(hx.number);
    if (!seen.has(hx.terrain)) { val += 1; seen.add(hx.terrain); }
  });
  if (pid !== undefined) {
    const have = new Set();
    s.buildings.forEach((b, i) => { if (b && b.owner === pid) GEO.vertices[i].hexes.forEach(h => have.add(s.hexes[h].terrain)); });
    GEO.vertices[v].hexes.forEach(h => { if (!have.has(s.hexes[h].terrain) && h !== CENTER) val += 1.5; });
  }
  return val;
}

function best(list, score) {
  let top = null, topScore = -Infinity;
  for (const x of list) { const sc = score(x); if (sc > topScore) { top = x; topScore = sc; } }
  return top;
}

function goal(s, pid) {
  const p = s.players[pid];
  const spots = legalSpots(s, pid);
  if (spots.towns.length && p.towns < LIMITS.town) return COSTS.town;
  if (spots.villages.length && p.villages < LIMITS.village) return COSTS.village;
  if (p.villages > 0 && p.towns < LIMITS.town) return COSTS.town;
  return COSTS.card;
}

function missing(hand, cost) {
  return RES.filter(r => (hand[r] || 0) < (cost[r] || 0));
}

function bestTargetVertex(s, pid) {
  // the best empty spot we could reach with one or two more roads
  const cands = GEO.vertices.filter(v => canPlaceVillage(s, pid, v.id, true));
  return best(cands, v => {
    const near = v.edges.some(e => s.roads[e] === pid) ? 2 : v.adj.some(a => GEO.vertices[a].edges.some(e => s.roads[e] === pid)) ? 1 : -99;
    return spotValue(s, v.id, pid) + near * 2;
  });
}

export function botAction(s, pid) {
  const p = s.players[pid];
  if (p.picks > 0) {
    const need = missing(p.hand, goal(s, pid));
    const res = need[0] || best(RES, r => -p.hand[r]);
    return { type: 'pick', res };
  }
  if (s.offer && s.offer.from !== pid && !s.offer.declined.includes(pid) && s.phase === 'main') {
    return respondToOffer(s, pid);
  }
  if (s.phase === 'discard' && s.discards[pid]) return discard(s, pid);
  if (s.turn !== pid) return null;

  switch (s.phase) {
    case 'setupVillage': {
      const spots = legalSpots(s, pid).villages;
      return { type: 'placeVillage', v: best(spots, v => spotValue(s, v, pid)) };
    }
    case 'setupRoad': {
      const roads = legalSpots(s, pid).roads;
      return {
        type: 'placeRoad', e: best(roads, e => {
          const ed = GEO.edges[e], far = ed.a === s.setup.lastV ? ed.b : ed.a;
          return Math.max(...GEO.vertices[far].adj.map(n => canPlaceVillage(s, pid, n, true) ? spotValue(s, n) : 0));
        }),
      };
    }
    case 'roll': {
      const knight = p.cards.find(c => c.kind === 'knight' && c.turn < s.turnCount);
      const hurt = GEO.hexes[s.bandit].vertices.some(v => s.buildings[v] && s.buildings[v].owner === pid);
      if (knight && hurt && !s.cardPlayed) return { type: 'playCard', kind: 'knight' };
      return { type: 'roll' };
    }
    case 'robber': return { type: 'moveBandit', hex: banditTarget(s, pid) };
    case 'steal': return { type: 'steal', target: best(s.stealTargets, t => publicCrowns(s, t) * 10 + handSize(s.players[t].hand)) };
    case 'main': return mainAction(s, pid);
  }
  return null;
}

function discard(s, pid) {
  const hand = { ...s.players[pid].hand }, out = { wood: 0, brick: 0, wool: 0, grain: 0, iron: 0 };
  const want = goal(s, pid);
  for (let k = 0; k < s.discards[pid]; k++) {
    const r = best(RES.filter(x => hand[x] > 0), x => hand[x] - (want[x] || 0) * 1.5);
    hand[r]--; out[r]++;
  }
  return { type: 'discard', cards: out };
}

function banditTarget(s, pid) {
  const leader = Math.max(...s.players.map(q => (q.id === pid ? -1 : publicCrowns(s, q.id))));
  const hexes = GEO.hexes.map(h => h.id).filter(h => h !== s.bandit);
  return best(hexes, h => {
    if (h === CENTER) return -50;
    let score = 0;
    for (const v of GEO.hexes[h].vertices) {
      const b = s.buildings[v];
      if (!b) continue;
      if (b.owner === pid) return -100;
      score += (b.kind === 'town' ? 2 : 1) * (1 + (publicCrowns(s, b.owner) === leader ? 1 : 0));
    }
    return score * pips(s.hexes[h].number);
  });
}

function respondToOffer(s, pid) {
  const o = s.offer, p = s.players[pid];
  const decline = { type: 'declineOffer', id: o.id };
  if (!canPay(p.hand, o.get)) return decline;
  if (publicCrowns(s, o.from) >= 6) return decline;
  const want = goal(s, pid);
  const after = { ...p.hand };
  RES.forEach(r => { after[r] += (o.give[r] || 0) - (o.get[r] || 0); });
  const before = missing(p.hand, want).length, now = missing(after, want).length;
  if (now < before && handSize(o.give) >= handSize(o.get)) return { type: 'acceptOffer', id: o.id };
  if (now <= before && handSize(o.give) > handSize(o.get)) return { type: 'acceptOffer', id: o.id };
  return decline;
}

function mainAction(s, pid) {
  const p = s.players[pid];
  const spots = legalSpots(s, pid);
  if (s.offer && s.offer.from === pid) return { type: 'cancelOffer' };

  // free roads from a Builders card
  if (s.freeRoads > 0 && spots.roads.length && p.roads < LIMITS.road) return { type: 'build', what: 'road', e: roadToward(s, pid, spots.roads) };

  const playable = kind => !s.cardPlayed && p.cards.some(c => c.kind === kind && c.turn < s.turnCount);
  if (playable('harvest')) return { type: 'playCard', kind: 'harvest' };
  if (playable('knight')) {
    const hurt = GEO.hexes[s.bandit].vertices.some(v => s.buildings[v] && s.buildings[v].owner === pid);
    const army = s.army === null ? 3 : s.players[s.army].knights + 1;
    if (hurt || p.knights + 1 >= army) return { type: 'playCard', kind: 'knight' };
  }

  if (spots.towns.length && p.towns < LIMITS.town && canPay(p.hand, COSTS.town))
    return { type: 'build', what: 'town', v: best(spots.towns, v => spotValue(s, v)) };
  if (spots.villages.length && p.villages < LIMITS.village && canPay(p.hand, COSTS.village))
    return { type: 'build', what: 'village', v: best(spots.villages, v => spotValue(s, v, pid)) };

  for (const q of s.quests) {
    const def = QUESTS[q.id];
    if (def.pay && canPay(p.hand, def.pay) && handSize(p.hand) - handSize(def.pay) >= 2) return { type: 'payQuest', quest: q.id };
  }

  const ws = bestWorkshop(s, pid, spots.workshops);
  if (ws && canPay(p.hand, workshopCost(s, pid, ws.kind)) && (handSize(workshopCost(s, pid, ws.kind)) === 0 || handSize(p.hand) >= 4))
    return { type: 'build', what: 'workshop', v: ws.v, kind: ws.kind };

  if (playable('builder') && spots.roads.length) return { type: 'playCard', kind: 'builder' };

  if (!spots.villages.length && spots.roads.length && p.roads < LIMITS.road && canPay(p.hand, roadCost(s)))
    return { type: 'build', what: 'road', e: roadToward(s, pid, spots.roads) };

  if (canPay(p.hand, COSTS.card) && s.deck.length && handSize(p.hand) >= 5)
    return { type: 'buyCard' };

  const trade = bankMove(s, pid);
  if (trade) return trade;
  return { type: 'endTurn' };
}

function roadToward(s, pid, roads) {
  const target = bestTargetVertex(s, pid);
  if (!target) return roads[0];
  return best(roads, e => {
    const ed = GEO.edges[e];
    const d = Math.min(...[ed.a, ed.b].map(v => Math.hypot(GEO.vertices[v].x - target.x, GEO.vertices[v].y - target.y)));
    return -d;
  });
}

function bestWorkshop(s, pid, places) {
  let top = null, topScore = 0;
  for (const v of places) {
    for (const kind of Object.keys(WORKSHOPS)) {
      if (!workshopFits(kind, v)) continue;
      let score = 0;
      if (WORKSHOPS[kind].water) score = 3;
      else GEO.vertices[v].hexes.forEach(h => { if (s.hexes[h].terrain === WORKSHOPS[kind].terrain) score += pips(s.hexes[h].number); });
      if (s.buildings[v].kind === 'town') score += 1;
      if (handSize(workshopCost(s, pid, kind)) === 0) score += 4;
      if (score > topScore) { top = { v, kind }; topScore = score; }
    }
  }
  return topScore >= 4 ? top : null;
}

function bankMove(s, pid) {
  const p = s.players[pid], rate = bankRate(s, pid);
  const want = goal(s, pid);
  const need = missing(p.hand, want);
  if (!need.length) return null;
  const give = best(RES.filter(r => p.hand[r] - (want[r] || 0) >= rate), r => p.hand[r]);
  if (!give) return null;
  return { type: 'bankTrade', give, get: need[0] };
}
