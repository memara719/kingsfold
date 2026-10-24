"""Simple bots for Isotopia. They look only at their own hand and what everyone can see."""

from board import GEO, CENTER
from rules import RES, COSTS, LIMITS, BOMB_URANIUM, BOMBS_EACH, BANK_RATE, can_pay, hand_size


def pips(n):
    return 6 - abs(7 - n) if n else 0


def spot_value(g, v, pid=None):
    val, seen = 0.0, set()
    for h in GEO.vertices[v]['hexes']:
        hx = g.hexes[h]
        if h == CENTER or hx['crater'] or h == g.cloud:
            continue
        val += pips(hx['number']) * (1.6 if hx['terrain'] == 'mine' else 1)
        if hx['terrain'] not in seen:
            val += 1
            seen.add(hx['terrain'])
    if pid is not None:
        have = set()
        for i, b in enumerate(g.buildings):
            if b and b['owner'] == pid:
                have.update(g.hexes[h]['terrain'] for h in GEO.vertices[i]['hexes'])
        val += sum(1.5 for h in GEO.vertices[v]['hexes'] if g.hexes[h]['terrain'] not in have and h != CENTER)
    return val


def best(items, score):
    top, top_score = None, float('-inf')
    for x in items:
        s = score(x)
        if s > top_score:
            top, top_score = x, s
    return top


def goal(g, pid):
    p, s = g.players[pid], g.spots(pid)
    if s['towns'] and p.towns < LIMITS['town']:
        return COSTS['town']
    if s['houses'] and p.houses < LIMITS['house']:
        return COSTS['house']
    if p.houses and p.towns < LIMITS['town']:
        return COSTS['town']
    return COSTS['road']


def missing(hand, cost):
    return [r for r in RES if hand[r] < cost.get(r, 0)]


def bomb_target(g, pid):
    """The land whose bombing hurts the others most and us least. None if no land is worth it."""
    leader = max((g.points(o.id) for o in g.players if o.id != pid), default=0)
    def score(h):
        s = 0
        for v, owner, kind in g.bomb_damage(h):
            worth = 2 if kind == 'town' else 1
            if owner == pid:
                s -= worth * 3
            else:
                s += worth * (2 if g.points(owner) == leader else 1)
        return s
    h = best(g.spots(pid)['bomb'], score)
    return h if h is not None and score(h) >= 2 else None


def threatened(g, pid):
    return any(o.hand['uranium'] >= 3 and o.bombs < BOMBS_EACH for o in g.players if o.id != pid)


def act(g, pid):
    """The bot's next move as an action dict."""
    p = g.players[pid]
    s = g.spots(pid)
    if g.phase == 'setup_house':
        return {'type': 'place_house', 'v': best(s['houses'], lambda v: spot_value(g, v, pid))}
    if g.phase == 'setup_road':
        def reach(e):
            ed = GEO.edges[e]
            far = ed['b'] if ed['a'] == g.last_setup_house else ed['a']
            return max([spot_value(g, n) for n in GEO.vertices[far]['adj'] if g.can_place_house(pid, n, True)] or [0])
        return {'type': 'place_road', 'e': best(s['roads'], reach)}
    if g.phase == 'roll':
        return {'type': 'roll'}
    if g.phase == 'cloud':
        leader = max(g.points(o.id) for o in g.players if o.id != pid)
        def hurt(h):
            if h == g.cloud:
                return -999
            sc = 0
            for v in GEO.hexes[h]['vertices']:
                b = g.buildings[v]
                if b:
                    if b['owner'] == pid:
                        return -100
                    sc += (2 if b['kind'] == 'town' else 1) * (2 if g.points(b['owner']) == leader else 1)
            return sc * pips(g.hexes[h]['number'])
        return {'type': 'move_cloud', 'hex': best(range(len(GEO.hexes)), hurt)}
    if g.phase != 'main':
        return None

    if p.hand['uranium'] >= BOMB_URANIUM and p.bombs < BOMBS_EACH:
        h = bomb_target(g, pid)
        if h is not None:
            return {'type': 'bomb', 'hex': h}
    if s['towns'] and p.towns < LIMITS['town'] and can_pay(p.hand, COSTS['town']):
        return {'type': 'build', 'what': 'town', 'v': best(s['towns'], lambda v: spot_value(g, v))}
    if s['houses'] and p.houses < LIMITS['house'] and can_pay(p.hand, COSTS['house']):
        return {'type': 'build', 'what': 'house', 'v': best(s['houses'], lambda v: spot_value(g, v, pid))}
    if threatened(g, pid) and s['shelters'] and can_pay(p.hand, COSTS['shelter']) and hand_size(p.hand) >= 4:
        def worth(v):
            b = g.buildings[v]
            return (2 if b['kind'] == 'town' else 1) * 10 + spot_value(g, v)
        return {'type': 'build', 'what': 'shelter', 'v': best(s['shelters'], worth)}
    if not s['houses'] and s['roads'] and p.roads < LIMITS['road'] and can_pay(p.hand, COSTS['road']):
        return {'type': 'build', 'what': 'road', 'e': road_toward(g, pid, s['roads'])}
    trade = bank_move(g, pid)
    if trade:
        return trade
    return {'type': 'end_turn'}


def road_toward(g, pid, roads):
    cands = [v for v in GEO.vertices if g.can_place_house(pid, v['id'], True)]
    def near(v):
        if any(g.roads[e] == pid for e in v['edges']):
            return 2
        if any(any(g.roads[e] == pid for e in GEO.vertices[a]['edges']) for a in v['adj']):
            return 1
        return -99
    target = best(cands, lambda v: spot_value(g, v['id'], pid) + near(v) * 2)
    if target is None:
        return roads[0]
    def dist(e):
        ed = GEO.edges[e]
        return -min(((GEO.vertices[x]['x'] - target['x']) ** 2 + (GEO.vertices[x]['y'] - target['y']) ** 2) for x in (ed['a'], ed['b']))
    return best(roads, dist)


def bank_move(g, pid):
    p = g.players[pid]
    want = goal(g, pid)
    need = [r for r in missing(p.hand, want) if r != 'uranium']
    if not need:
        return None
    keep = dict(want)
    keep['uranium'] = 99 if p.bombs < BOMBS_EACH else 0      # hold on to uranium while the bomb is still to come
    give = best([r for r in RES if p.hand[r] - keep.get(r, 0) >= BANK_RATE], lambda r: p.hand[r])
    if give is None:
        return None
    return {'type': 'trade', 'give': give, 'get': need[0]}
