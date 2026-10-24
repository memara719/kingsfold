"""Rule tests for Isotopia: full bot games plus checks on single rules. Run: python3 -m unittest test/test_isotopia.py"""
import os, sys, statistics, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'isotopia'))
from board import GEO, CENTER
from rules import Game, RES, WIN_POINTS, BOMB_URANIUM, hand_size
import bot


def play(game, limit=6000):
    for _ in range(limit):
        if game.winner is not None:
            return
        a = bot.act(game, game.turn)
        err = game.do(game.turn, a)
        assert err is None, (err, a, game.phase)
        for p in game.players:
            assert all(p.hand[r] >= 0 for r in RES)
    raise AssertionError('game never ended')


class Rules(unittest.TestCase):
    def test_board(self):
        self.assertEqual((len(GEO.hexes), len(GEO.vertices), len(GEO.edges)), (19, 54, 72))
        for seed in range(60):
            g = Game([('A', True), ('B', True)], seed)
            mines = [i for i, h in enumerate(g.hexes) if h['terrain'] == 'mine']
            self.assertEqual(len(mines), 2)
            for m in mines:
                self.assertNotIn(g.hexes[m]['number'], (6, 8))
            self.assertEqual(g.hexes[CENTER]['terrain'], 'lab')

    def test_bot_games_finish(self):
        rounds, bombs, craters = [], 0, 0
        for seed in range(200):
            g = Game([(f'P{i}', True) for i in range(2 + seed % 3)], seed)
            play(g)
            self.assertGreaterEqual(g.points(g.winner), WIN_POINTS)
            rounds.append(g.round)
            bombs += sum(p.bombs for p in g.players)
            craters += sum(h['crater'] for h in g.hexes)
        print(f'\n  average rounds {statistics.mean(rounds):.1f}, longest {max(rounds)}, bombs dropped in 200 games: {bombs}')
        self.assertLess(statistics.mean(rounds), 30)
        self.assertGreater(bombs, 20)

    def setup_done(self, seed=3):
        g = Game([('A', False), ('B', True), ('C', True)], seed)
        while g.phase.startswith('setup'):
            self.assertIsNone(g.do(g.turn, bot.act(g, g.turn)))
        return g

    def test_bomb(self):
        g = self.setup_done()
        g.phase = 'main'
        me = g.turn
        # pick a land with someone else's house on it
        target = next(h for h in g.spots(me)['bomb'] if any(o != me for _, o, _ in g.bomb_damage(h)))
        g.players[me].hand['uranium'] = 4
        self.assertIn('Uranium', g.do(me, {'type': 'bomb', 'hex': target}))
        g.players[me].hand['uranium'] = BOMB_URANIUM
        hit = g.bomb_damage(target)
        before = {o: g.points(o) for _, o, _ in hit}
        self.assertIsNone(g.do(me, {'type': 'bomb', 'hex': target}))
        self.assertTrue(g.hexes[target]['crater'])
        self.assertEqual(g.players[me].hand['uranium'], 0)
        for v, o, _ in hit:
            self.assertIsNone(g.buildings[v])
        self.assertTrue(all(g.points(o) < before[o] for o in before))
        self.assertNotIn(target, g.spots(me)['bomb'])
        self.assertIsNotNone(g.do(me, {'type': 'bomb', 'hex': CENTER}))

    def test_shelter_survives(self):
        g = self.setup_done()
        g.phase = 'main'
        me = g.turn
        v = next(i for i, b in enumerate(g.buildings) if b and b['owner'] == me)
        g.players[me].hand.update(concrete=1, steel=1, uranium=BOMB_URANIUM)
        self.assertIsNone(g.do(me, {'type': 'build', 'what': 'shelter', 'v': v}))
        h = next(h for h in GEO.vertices[v]['hexes'] if h != CENTER and not g.hexes[h]['crater'])
        self.assertIsNone(g.do(me, {'type': 'bomb', 'hex': h}))
        self.assertIsNotNone(g.buildings[v])

    def test_bank_never_sells_uranium(self):
        g = self.setup_done()
        g.phase = 'main'
        me = g.turn
        g.players[me].hand.update(lumber=3)
        self.assertIn('never', g.do(me, {'type': 'trade', 'give': 'lumber', 'get': 'uranium'}))
        self.assertIsNone(g.do(me, {'type': 'trade', 'give': 'lumber', 'get': 'steel'}))

    def test_seven(self):
        for seed in range(300):
            g = self.setup_done(seed)
            g.players[1].hand.update(lumber=5, food=4)
            g.do(g.turn, {'type': 'roll'})
            if sum(g.dice) != 7:
                continue
            self.assertEqual(g.phase, 'cloud')
            self.assertLessEqual(hand_size(g.players[1].hand), 5)
            self.assertIsNotNone(g.do(g.turn, {'type': 'move_cloud', 'hex': g.cloud}))
            return
        self.fail('never rolled a 7')

    def test_bad_moves(self):
        g = self.setup_done()
        self.assertIsNotNone(g.do(g.turn, {'type': 'build', 'what': 'house', 'v': 3}))
        self.assertIsNotNone(g.do(g.turn, {'type': 'nope'}))
        self.assertIsNotNone(g.do((g.turn + 1) % 3, {'type': 'roll'}))


if __name__ == '__main__':
    unittest.main()
