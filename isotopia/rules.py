"""Isotopia rules. Pure Python, no pygame, so they can be tested on their own.

Game.do(pid, action) checks and performs one move and returns an error message, or None when it worked.
Actions are small dicts: {'type': 'build', 'what': 'house', 'v': 12}."""

import random
from board import GEO, CENTER

RES = ['lumber', 'concrete', 'food', 'steel', 'uranium']
RES_NAME = {'lumber': 'Lumber', 'concrete': 'Cement', 'food': 'Food', 'steel': 'Steel', 'uranium': 'Uranium'}
TERRAIN_RES = {'forest': 'lumber', 'quarry': 'concrete', 'farm': 'food', 'mill': 'steel', 'mine': 'uranium'}
TERRAIN_NAME = {'forest': 'Forest', 'quarry': 'Quarry', 'farm': 'Farm', 'mill': 'Steel mill', 'mine': 'Uranium mine', 'lab': 'Atomic Lab'}

WIN_POINTS = 8
BOMB_URANIUM = 5
BOMBS_EACH = 1
BANK_RATE = 3
LIMITS = {'road': 15, 'house': 5, 'town': 4}
COSTS = {
    'road': {'lumber': 1, 'concrete': 1},
    'house': {'lumber': 1, 'concrete': 1, 'food': 1},
    'town': {'food': 2, 'steel': 2},
    'shelter': {'concrete': 1, 'steel': 1},
    'bomb': {'uranium': BOMB_URANIUM},
}
COLORS = [('Red', (222, 64, 52), (140, 28, 24)), ('Blue', (64, 120, 232), (28, 60, 152)),
          ('Yellow', (240, 196, 48), (160, 112, 16)), ('Green', (64, 176, 80), (28, 96, 40))]


def empty_hand():
    return {r: 0 for r in RES}


def hand_size(h):
    return sum(h[r] for r in RES)


def can_pay(h, cost):
    return all(h[r] >= cost.get(r, 0) for r in RES)


def cost_text(cost):
    return ', '.join(f'{n} {RES_NAME[r]}' for r, n in cost.items() if n)


class Player:
    def __init__(self, pid, name, bot):
        self.id = pid
        self.name = name
        self.bot = bot
        self.color, self.shade = COLORS[pid][1], COLORS[pid][2]
        self.hand = empty_hand()
        self.houses = self.towns = self.roads = 0
        self.bombs = 0


class Game:
    def __init__(self, players, seed=None):
        """players: list of (name, is_bot), 2 to 4 of them."""
        if not 2 <= len(players) <= 4:
            raise ValueError('Isotopia needs 2 to 4 players.')
        self.rng = random.Random(seed)
        self.players = [Player(i, n, b) for i, (n, b) in enumerate(players)]
        self.buildings = [None] * len(GEO.vertices)      # {'owner', 'kind': 'house'|'town', 'shelter': bool}
        self.roads = [None] * len(GEO.edges)             # owner id
        self.cloud = CENTER
        self.phase = 'setup_house'
        self.turn = 0
        self.round = 0
        self.turn_count = 0
        self.dice = None
        self.longest = None
        self.winner = None
        self.log = []
        self.events = []
        self.event_seq = 0
        self.last_setup_house = None
        order = list(range(len(self.players)))
        self.setup_order = order + order[::-1]
        self.setup_i = 0
        self.make_board()
        self.say('Welcome to Isotopia, 1955. Build the city of tomorrow!')

    # ---------- setup ----------

    def make_board(self):
        rng = self.rng
        land = [h['id'] for h in GEO.hexes if h['id'] != CENTER]
        terr = ['forest'] * 4 + ['quarry'] * 4 + ['farm'] * 4 + ['mill'] * 4 + ['mine'] * 2
        nums = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]
        for _ in range(2000):
            rng.shuffle(terr)
            rng.shuffle(nums)
            num = dict(zip(land, nums))
            ter = dict(zip(land, terr))
            hot = lambda h: num[h] in (6, 8)
            ok = all(not hot(h) or all(not (n in num and hot(n)) for n in GEO.hexes[h]['nbrs']) for h in land)
            # the uranium mines are rare: never on the busy 6 or 8, never side by side
            ok = ok and all(not hot(h) for h in land if ter[h] == 'mine')
            ok = ok and all(not (ter[h] == 'mine' and any(ter.get(n) == 'mine' for n in GEO.hexes[h]['nbrs'])) for h in land)
            if ok:
                break
        self.hexes = [{'terrain': 'lab', 'number': 0, 'crater': False} if h['id'] == CENTER
                      else {'terrain': ter[h['id']], 'number': num[h['id']], 'crater': False} for h in GEO.hexes]

    def say(self, text):
        self.log.append(text)
        self.log = self.log[-60:]

    def event(self, **e):
        self.event_seq += 1
        e['seq'] = self.event_seq
        self.events.append(e)
        self.events = self.events[-40:]

    # ---------- what is allowed ----------

    def can_place_house(self, pid, v, setup=False):
        if self.buildings[v]:
            return False
        vert = GEO.vertices[v]
        if any(self.buildings[n] for n in vert['adj']):
            return False
        if setup:
            return True
        return any(self.roads[e] == pid for e in vert['edges'])

    def can_place_road(self, pid, e):
        if self.roads[e] is not None:
            return False
        ed = GEO.edges[e]
        for x in (ed['a'], ed['b']):
            b = self.buildings[x]
            if b:
                if b['owner'] == pid:
                    return True
                continue
            if any(o != e and self.roads[o] == pid for o in GEO.vertices[x]['edges']):
                return True
        return False

    def spots(self, pid):
        out = {'houses': [], 'roads': [], 'towns': [], 'shelters': [], 'bomb': []}
        if self.phase == 'setup_house':
            out['houses'] = [v['id'] for v in GEO.vertices if self.can_place_house(pid, v['id'], True)]
            return out
        if self.phase == 'setup_road':
            out['roads'] = [e for e in GEO.vertices[self.last_setup_house]['edges'] if self.roads[e] is None]
            return out
        for v in GEO.vertices:
            if self.can_place_house(pid, v['id']):
                out['houses'].append(v['id'])
            b = self.buildings[v['id']]
            if b and b['owner'] == pid:
                if b['kind'] == 'house':
                    out['towns'].append(v['id'])
                if not b['shelter']:
                    out['shelters'].append(v['id'])
        out['roads'] = [e['id'] for e in GEO.edges if self.can_place_road(pid, e['id'])]
        out['bomb'] = [h['id'] for h in GEO.hexes if h['id'] != CENTER and not self.hexes[h['id']]['crater']]
        return out

    def bomb_damage(self, hex_id):
        """Who would lose what if this land were bombed: list of (vertex, owner, kind)."""
        out = []
        for v in GEO.hexes[hex_id]['vertices']:
            b = self.buildings[v]
            if b and not b['shelter']:
                out.append((v, b['owner'], b['kind']))
        return out

    # ---------- points ----------

    def points(self, pid):
        p = self.players[pid]
        return p.houses + 2 * p.towns + (2 if self.longest == pid else 0)

    def road_length(self, pid):
        best = 0
        used = set()

        def blocked(v):
            b = self.buildings[v]
            return b is not None and b['owner'] != pid

        def walk(v, length):
            nonlocal best
            best = max(best, length)
            if blocked(v):
                return
            for e in GEO.vertices[v]['edges']:
                if self.roads[e] != pid or e in used:
                    continue
                used.add(e)
                ed = GEO.edges[e]
                walk(ed['b'] if ed['a'] == v else ed['a'], length + 1)
                used.discard(e)

        for ed in GEO.edges:
            if self.roads[ed['id']] != pid:
                continue
            for to in (ed['a'], ed['b']):
                used.add(ed['id'])
                walk(to, 1)
                used.discard(ed['id'])
        return best

    def update_longest(self):
        lens = [self.road_length(p.id) for p in self.players]
        top = max(lens)
        leaders = [i for i, n in enumerate(lens) if n == top and top >= 5]
        nxt = None
        if len(leaders) == 1:
            nxt = leaders[0]
        elif self.longest in leaders:
            nxt = self.longest
        if nxt != self.longest:
            self.longest = nxt
            if nxt is not None:
                self.say(f'{self.players[nxt].name} has the longest road ({top}).')
                self.event(type='longest', pid=nxt)

    # ---------- turn flow ----------

    def produce(self, total):
        gains = []
        got = [empty_hand() for _ in self.players]
        for i, h in enumerate(self.hexes):
            if h['number'] != total or i == self.cloud or h['crater']:
                continue
            res = TERRAIN_RES[h['terrain']]
            for v in GEO.hexes[i]['vertices']:
                b = self.buildings[v]
                if b:
                    n = 2 if b['kind'] == 'town' else 1
                    got[b['owner']][res] += n
                    gains.append((i, b['owner'], res, n))
        for p in self.players:
            for r in RES:
                p.hand[r] += got[p.id][r]
            if hand_size(got[p.id]):
                self.say(f'{p.name} gets {cost_text(got[p.id])}.')
        return gains

    def random_card(self, hand):
        k = self.rng.randrange(hand_size(hand))
        for r in RES:
            if k < hand[r]:
                return r
            k -= hand[r]

    def next_turn(self):
        self.turn = (self.turn + 1) % len(self.players)
        self.turn_count += 1
        if self.turn == 0:
            self.round += 1
        self.phase = 'roll'
        self.dice = None
        self.say(f"{self.players[self.turn].name}'s turn.")
        self.event(type='turn', pid=self.turn)

    def check_win(self):
        if self.phase.startswith('setup') or self.winner is not None:
            return
        pid = self.turn
        if self.points(pid) >= WIN_POINTS:
            self.winner = pid
            self.phase = 'over'
            self.say(f'{self.players[pid].name} builds the city of tomorrow and wins!')
            self.event(type='win', pid=pid)

    # ---------- moves ----------

    def do(self, pid, a):
        if self.winner is not None:
            return 'The game is over.'
        if pid != self.turn:
            return "It's not your turn."
        fn = getattr(self, 'act_' + str(a.get('type')), None)
        if fn is None:
            return 'Unknown move.'
        err = fn(pid, a)
        if err:
            return err
        self.update_longest()
        self.check_win()
        return None

    def act_place_house(self, pid, a):
        v = a.get('v')
        if self.phase != 'setup_house' or not isinstance(v, int) or not 0 <= v < len(GEO.vertices) or not self.can_place_house(pid, v, True):
            return 'You cannot build there.'
        p = self.players[pid]
        self.buildings[v] = {'owner': pid, 'kind': 'house', 'shelter': False}
        p.houses += 1
        if self.setup_i >= len(self.players):
            for h in GEO.vertices[v]['hexes']:
                res = TERRAIN_RES.get(self.hexes[h]['terrain'])
                if res:
                    p.hand[res] += 1
        self.last_setup_house = v
        self.phase = 'setup_road'
        self.event(type='build', what='house', v=v, pid=pid)

    def act_place_road(self, pid, a):
        e = a.get('e')
        if self.phase != 'setup_road' or e not in self.spots(pid)['roads']:
            return 'The road must touch your new house.'
        self.roads[e] = pid
        self.players[pid].roads += 1
        self.event(type='build', what='road', e=e, pid=pid)
        self.setup_i += 1
        if self.setup_i >= len(self.setup_order):
            self.turn, self.round, self.turn_count, self.phase = 0, 1, 1, 'roll'
            self.say(f'Everyone has settled. {self.players[0].name} goes first.')
            self.event(type='turn', pid=0)
        else:
            self.turn = self.setup_order[self.setup_i]
            self.phase = 'setup_house'

    def act_roll(self, pid, a):
        if self.phase != 'roll':
            return 'You cannot roll now.'
        d = (self.rng.randint(1, 6), self.rng.randint(1, 6))
        self.dice = d
        total = sum(d)
        self.say(f'{self.players[pid].name} rolled {total}.')
        if total == 7:
            lost = []
            for p in self.players:
                n = hand_size(p.hand)
                if n > 7:
                    for _ in range(n // 2):
                        p.hand[self.random_card(p.hand)] -= 1
                    lost.append((p.id, n // 2))
                    self.say(f'The radiation cloud spoils {n // 2} of {p.name}\'s cards.')
            self.event(type='roll', pid=pid, dice=d, gains=[], lost=lost)
            self.phase = 'cloud'
        else:
            gains = self.produce(total)
            self.event(type='roll', pid=pid, dice=d, gains=gains, lost=[])
            self.phase = 'main'

    def act_move_cloud(self, pid, a):
        h = a.get('hex')
        if self.phase != 'cloud' or not isinstance(h, int) or not 0 <= h < len(GEO.hexes):
            return 'Pick a land for the radiation cloud.'
        if h == self.cloud:
            return 'The cloud must move to a different land.'
        self.cloud = h
        victims = sorted({self.buildings[v]['owner'] for v in GEO.hexes[h]['vertices'] if self.buildings[v]}
                         - {pid}, key=lambda o: o)
        victims = [o for o in victims if hand_size(self.players[o].hand) > 0]
        stolen = None
        if victims:
            o = self.rng.choice(victims)
            r = self.random_card(self.players[o].hand)
            self.players[o].hand[r] -= 1
            self.players[pid].hand[r] += 1
            stolen = (o, r)
            self.say(f'{self.players[pid].name} took a card from {self.players[o].name}.')
        self.event(type='cloud', pid=pid, hex=h, stolen=stolen)
        self.phase = 'main'

    def act_build(self, pid, a):
        if self.phase != 'main':
            return 'Roll the dice first.'
        p = self.players[pid]
        what = a.get('what')
        s = self.spots(pid)
        if what == 'road':
            e = a.get('e')
            if e not in s['roads']:
                return 'Roads must connect to your own roads or buildings.'
            if p.roads >= LIMITS['road']:
                return 'You have no roads left.'
            if not can_pay(p.hand, COSTS['road']):
                return 'A road costs ' + cost_text(COSTS['road']) + '.'
            self.pay(p, 'road')
            self.roads[e] = pid
            p.roads += 1
            self.event(type='build', what='road', e=e, pid=pid)
            return None
        v = a.get('v')
        if what == 'house':
            if v not in s['houses']:
                return 'Houses need one of your roads and space around them.'
            if p.houses >= LIMITS['house']:
                return 'You have no houses left. Grow one into a town.'
            if not can_pay(p.hand, COSTS['house']):
                return 'A house costs ' + cost_text(COSTS['house']) + '.'
            self.pay(p, 'house')
            self.buildings[v] = {'owner': pid, 'kind': 'house', 'shelter': False}
            p.houses += 1
            self.say(f'{p.name} built a house.')
        elif what == 'town':
            if v not in s['towns']:
                return 'Atomic towns are built on your own houses.'
            if p.towns >= LIMITS['town']:
                return 'You have no towns left.'
            if not can_pay(p.hand, COSTS['town']):
                return 'An atomic town costs ' + cost_text(COSTS['town']) + '.'
            self.pay(p, 'town')
            self.buildings[v]['kind'] = 'town'
            p.houses -= 1
            p.towns += 1
            self.say(f'{p.name} built an atomic town.')
        elif what == 'shelter':
            if v not in s['shelters']:
                return 'Shelters go under your own houses and towns.'
            if not can_pay(p.hand, COSTS['shelter']):
                return 'A fallout shelter costs ' + cost_text(COSTS['shelter']) + '.'
            self.pay(p, 'shelter')
            self.buildings[v]['shelter'] = True
            self.say(f'{p.name} dug a fallout shelter.')
        else:
            return 'Build what?'
        self.event(type='build', what=what, v=v, pid=pid)
        return None

    def pay(self, p, what):
        for r, n in COSTS[what].items():
            p.hand[r] -= n

    def act_bomb(self, pid, a):
        if self.phase != 'main':
            return 'Roll the dice first.'
        p = self.players[pid]
        h = a.get('hex')
        if h not in self.spots(pid)['bomb']:
            return 'Pick a land to bomb (not the Atomic Lab or a crater).'
        if p.bombs >= BOMBS_EACH:
            return 'You have already dropped your bomb. Each player gets one.'
        if p.hand['uranium'] < BOMB_URANIUM:
            return f'A bomb takes {BOMB_URANIUM} Uranium.'
        self.pay(p, 'bomb')
        p.bombs += 1
        destroyed = self.bomb_damage(h)
        for v, owner, kind in destroyed:
            q = self.players[owner]
            if kind == 'town':
                q.towns -= 1
            else:
                q.houses -= 1
            self.buildings[v] = None
        self.hexes[h]['crater'] = True
        if self.cloud == h:
            self.cloud = CENTER
        names = ', '.join(f"{self.players[o].name}'s {k}" for _, o, k in destroyed) or 'nothing but empty land'
        self.say(f'{p.name} dropped the bomb! It destroyed {names}.')
        self.event(type='bomb', pid=pid, hex=h, destroyed=destroyed)
        return None

    def act_trade(self, pid, a):
        if self.phase != 'main':
            return 'Roll the dice first.'
        give, get = a.get('give'), a.get('get')
        if give not in RES or get not in RES or give == get:
            return 'Pick what to give and what to get.'
        if get == 'uranium':
            return 'The bank never sells Uranium.'
        p = self.players[pid]
        if p.hand[give] < BANK_RATE:
            return f'The bank wants {BANK_RATE} {RES_NAME[give]}.'
        p.hand[give] -= BANK_RATE
        p.hand[get] += 1
        self.say(f'{p.name} traded {BANK_RATE} {RES_NAME[give]} for 1 {RES_NAME[get]}.')
        self.event(type='trade', pid=pid)
        return None

    def act_end_turn(self, pid, a):
        if self.phase != 'main':
            return 'Roll the dice first.'
        self.next_turn()
        return None
