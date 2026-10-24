"""Isotopia's screens: title, players, name entry and the game itself.
Everything is drawn on a 400x240 pixel screen that is scaled up to fill the window."""

import math
import random

import pygame

import audio
import bot
import online
from art import icon, die, flag, logo, professor, piece, INK
from board import GEO, CENTER
from font import text, width, fit, wrap, LINE
from rules import (Game, RES, RES_NAME, TERRAIN_NAME, TERRAIN_RES, COSTS, LIMITS, COLORS,
                   WIN_POINTS, BOMB_URANIUM, BOMBS_EACH, BANK_RATE, can_pay, hand_size)
from ui import UI, C
from view import BoardView, VX, VY, VW, VH, VPOS, EPOS, HPOS

SW, SH = 400, 240
BOARD = (3, 3, 194, 174)
HAND = (3, 180, 194, 57)
STATUS = (200, 3, 197, 45)
PLAYERS = (200, 51, 197, 74)
ACTIONS = (200, 128, 197, 109)
BOT_NAMES = ['Dr. Bloom', 'Prof. Pike', 'Mrs. Volt', 'Mr. Ray']
TIPS = {
    'setup_house': 'Welcome to Isotopia! Pick a glowing spot for your first house. Lands with 6 and 8 pay out most often.',
    'setup_road': 'Now a road next to it. Roads lead to new places to build.',
    'roll': 'Your turn! Press ROLL. Every land showing that number pays the houses next to it.',
    'main': 'Spend your cards. Faded icons on a button are cards you are missing. Press End turn when done.',
    'cloud': 'You rolled a 7! Tap a land to send the radiation cloud there. It stops paying, and you grab a card from a neighbor.',
    'bomb': 'You have 5 Uranium! Press BOMB, then pick a land. Every building on it is destroyed, unless it has a shelter.',
    'threat': 'Someone is collecting Uranium. A fallout shelter keeps one building safe from a bomb.',
}


class App:
    def __init__(self):
        self.screen = pygame.Surface((SW, SH))
        self.ui = UI(self.screen)
        self.board = BoardView()
        self.title_board = BoardView()
        self.logo = logo()
        self.prof = professor()
        online.bridge()          # in the browser this also seeds the random numbers, so every board and table code differs
        self.scene = 'title'
        self.seats = [{'name': 'Player 1', 'type': 'human'}, {'name': BOT_NAMES[1], 'type': 'bot'},
                      {'name': BOT_NAMES[2], 'type': 'bot'}, {'name': BOT_NAMES[3], 'type': 'off'}]
        self.name_edit = None
        self.modal = None
        self.notice = None
        self.tips_on = True
        self.seen = set()
        self.game = None
        self.demo = None
        self.demo_next = 0
        self.frame_no = 0
        self.scale = 3
        self.offset = (0, 0)
        self.net = None
        self.tip = None
        self.pass_to = None
        self.targets = None
        self.viewer = None
        self.bridge = online.bridge()
        self.my_name = self.bridge.load('iso_name', True)
        self.testing = self.bridge.ok and int(self.bridge.js.testing())
        audio.init()
        self.start_demo()
        self.arrive()

    # ---------- online: arriving by invite link, or coming back after a reload ----------

    def arrive(self):
        if not self.bridge.ok:
            return
        code = str(self.bridge.js.hash()).lstrip('#').upper()
        saved = self.bridge.load('iso_hosting')
        if saved:
            try:
                saved = __import__('json').loads(saved)
            except ValueError:
                saved = None
        if saved and (not code or code == saved['code']):
            self.net = online.HostTable(self, self.my_name or 'Host', saved)
            if saved['game']:
                self.begin(Game.from_dict(saved['game']), [0])
            else:
                self.scene = 'lobby'
        elif len(code) == 4 and code.isalpha():
            self.ask_name(lambda: self.join(code))

    def ask_name(self, then):
        if self.my_name:
            return then()
        self.name_edit = {'kind': 'me', 'value': '', 'then': then}
        self.scene = 'name'

    def host_table(self):
        audio.play('click')
        self.net = online.HostTable(self, self.my_name)
        self.scene = 'lobby'

    def join(self, code):
        self.net = online.GuestTable(self, self.my_name, code)
        self.scene = 'lobby'

    def leave_table(self, notice=None):
        if self.net:
            self.net.leave()
        self.net = None
        self.game = None
        self.modal = None
        self.notice = notice
        self.scene = 'title'

    def on_table_change(self):
        if self.net and not self.net.host and self.net.info and not self.net.info['started'] and self.scene == 'game':
            self.game = None
            self.modal = None
            self.scene = 'lobby'

    def guest_state(self, m):
        g = Game.from_dict(m['game'])
        if self.game is None or self.scene != 'game':
            self.begin(g, [m['you']])
        else:
            self.game = g
            self.after_change()

    # ---------- the demo game behind the title ----------

    def start_demo(self):
        self.demo = Game([(n, True) for n in BOT_NAMES], random.randrange(1 << 30))
        self.title_board.set_board(self.demo.hexes)

    def step_demo(self, now):
        if now < self.demo_next:
            return
        self.demo_next = now + 220
        g = self.demo
        if g.winner is not None:
            self.start_demo()
            return
        g.do(g.turn, bot.act(g, g.turn))
        self.title_board.set_board(g.hexes)

    # ---------- starting and following a game ----------

    def start_game(self):
        if self.net:
            # online: the host starts (or restarts) the game for the whole table
            t = self.net
            t.started = True
            self.begin(Game([(s['name'], s['kind'] == 'bot') for s in t.seats], random.randrange(1 << 30)), [0])
            return
        active = [s for s in self.seats if s['type'] != 'off']
        self.begin(Game([(s['name'], s['type'] == 'bot') for s in active], random.randrange(1 << 30)), None)

    def begin(self, game, me):
        """Show a game. me: [our seat] when playing online, None when everyone shares this screen."""
        self.game = game
        self.colors = [(p.color, p.shade) for p in self.game.players]
        self.humans = me if me is not None else [p.id for p in self.game.players if not p.bot]
        self.viewer = self.humans[0] if self.humans else None
        self.pass_to = None
        self.last_seq = self.game.event_seq
        self.mode = None
        self.targets = None
        self.hover = None
        self.toasts, self.banners = [], []
        self.roll_until = 0
        self.bumps = {}
        self.bot_next = 0
        self.wait_until = 0
        self.modal = None
        self.tip = None
        self.scene = 'game'
        self.board.set_board(self.game.hexes)
        self.after_change()

    def guest(self):
        return self.net is not None and not self.net.host

    def human_turn(self):
        g = self.game
        return g.winner is None and not g.players[g.turn].bot

    def mine(self):
        return self.human_turn() and self.viewer == self.game.turn and self.pass_to is None

    def after_change(self):
        g = self.game
        self.board.set_board(g.hexes)
        self.events()
        # pass-and-play: hand the device over before showing the next person's cards
        if self.net:
            pass
        elif self.human_turn() and g.turn != self.viewer:
            if len(self.humans) > 1:
                self.pass_to = g.turn
                self.viewer = None
            else:
                self.viewer = g.turn
        if g.phase != 'main' or not self.mine():
            self.mode = None
        self.update_targets()
        if g.winner is not None and (not self.modal or self.modal['kind'] != 'over'):
            self.modal = {'kind': 'over'}
        if g.winner is None and self.modal and self.modal['kind'] == 'over':
            self.modal = None
        self.maybe_tip()
        if self.net and self.net.host:
            self.net.broadcast()

    def events(self):
        g = self.game
        for e in [e for e in g.events if e['seq'] > self.last_seq]:
            t = e['type']
            if t == 'roll':
                self.roll_until = pygame.time.get_ticks() + 500
                audio.play('roll')
                total = sum(e['dice'])
                for k, (h, pid, res, n) in enumerate(e['gains']):
                    for a in range(n):
                        self.board.float(h, res, 500 + k * 60 + a * 120)
                    if pid == self.viewer:
                        self.bumps[res] = pygame.time.get_ticks() + 500
                self.toast(f"{self.pname(e['pid'])} rolled {total}.")
                if total == 7:
                    self.banner('Radiation cloud!')
                if any(p == self.viewer for p, _ in e['lost']):
                    self.toast('The cloud spoiled half your cards!')
            elif t == 'build':
                audio.play('build')
            elif t == 'cloud' and e['stolen']:
                o, res = e['stolen']
                audio.play('steal')
                if e['pid'] == self.viewer:
                    self.toast(f'You took 1 {RES_NAME[res]} from {g.players[o].name}.')
                elif o == self.viewer:
                    self.toast(f"{g.players[e['pid']].name} took 1 {RES_NAME[res]} from you!")
                else:
                    self.toast(f"{g.players[e['pid']].name} took a card from {g.players[o].name}.")
            elif t == 'bomb':
                audio.play('siren')
                self.board.boom(e['hex'])
                self.wait_until = pygame.time.get_ticks() + 2800
                self.boom_at = pygame.time.get_ticks() + 150
                lost = ', '.join(f"{'you' if o == self.viewer else g.players[o].name} lost {'an atomic town' if k == 'town' else 'a house'}" for _, o, k in e['destroyed'])
                self.banner('BOOM!')
                self.toast(f"{g.players[e['pid']].name} dropped the bomb on the {TERRAIN_NAME[g.hexes[e['hex']]['terrain']].lower()}! " + (lost + '.' if lost else 'Nobody lived there.'))
            elif t == 'turn':
                if e['pid'] == self.viewer and len(self.humans) == 1:
                    audio.play('turn')
                    self.banner('Your turn!')
            elif t == 'longest':
                self.toast(f"{self.pname(e['pid'])} {'have' if e['pid'] == self.viewer else 'has'} the longest road: +2 points!")
            elif t == 'win':
                audio.play('win')
        self.last_seq = g.event_seq

    def pname(self, pid):
        return 'You' if pid == self.viewer else self.game.players[pid].name

    def toast(self, msg):
        self.toasts.append([msg, pygame.time.get_ticks()])
        self.toasts = self.toasts[-3:]

    def banner(self, msg):
        self.banners = [[msg, pygame.time.get_ticks()]]

    def update_targets(self):
        self.targets = None
        g = self.game
        if not self.mine():
            return
        s = g.spots(g.turn)
        if g.phase == 'setup_house':
            self.targets = ('vertex', s['houses'], lambda v: {'type': 'place_house', 'v': v})
        elif g.phase == 'setup_road':
            self.targets = ('edge', s['roads'], lambda e: {'type': 'place_road', 'e': e})
        elif g.phase == 'cloud':
            self.targets = ('hex', [h['id'] for h in GEO.hexes if h['id'] != g.cloud], lambda h: {'type': 'move_cloud', 'hex': h})
        elif g.phase == 'main' and self.mode:
            m = self.mode
            if m == 'road':
                self.targets = ('edge', s['roads'], lambda e: {'type': 'build', 'what': 'road', 'e': e})
            elif m in ('house', 'town', 'shelter'):
                self.targets = ('vertex', s[m + 's'], lambda v, m=m: {'type': 'build', 'what': m, 'v': v})
            elif m == 'bomb':
                self.targets = ('bomb', s['bomb'], None)

    def set_mode(self, m):
        self.mode = m
        self.update_targets()

    def act(self, a):
        if self.guest():
            self.net.act(a)
            return
        err = self.game.do(self.game.turn, a)
        if err:
            self.toast(err)
            audio.play('error')
        self.after_change()

    def maybe_tip(self):
        g = self.game
        self.tip = None
        if not self.tips_on or g.winner is not None or not self.mine():
            return
        p = g.players[g.turn]
        key = None
        if p.hand['uranium'] >= BOMB_URANIUM and p.bombs < BOMBS_EACH and g.phase == 'main':
            key = 'bomb'
        elif g.phase in ('setup_house', 'setup_road', 'roll', 'cloud'):
            key = g.phase
        elif g.phase == 'main':
            key = 'main'
            if 'main' in self.seen and any(o.hand['uranium'] >= 3 and o.bombs < BOMBS_EACH for o in g.players if o.id != p.id):
                key = 'threat'
        if key and key not in self.seen:
            self.tip = key

    # ---------- per frame ----------

    def update(self, now):
        if self.scene in ('title', 'online', 'lobby', 'setup'):
            self.step_demo(now)
        if self.net:
            if self.net.host:
                self.net.poll()
            else:
                self.net.poll(now)
            if self.net.error:
                return self.leave_table(self.net.error)
        if self.scene != 'game' or self.guest():
            return
        g = self.game
        if g.winner is not None or now < self.wait_until or self.pass_to is not None:
            return
        if getattr(self, 'boom_at', 0) and now >= self.boom_at:
            audio.play('boom')
            self.boom_at = 0
        # bots play their seats, and stand in for friends whose connection dropped
        stand_in = self.net is not None and self.net.away(g.turn)
        if (g.players[g.turn].bot or stand_in) and now >= self.bot_next:
            self.bot_next = now + (300 if g.phase.startswith('setup') else 650)
            a = bot.act(g, g.turn)
            if a:
                err = g.do(g.turn, a)
                if err:
                    g.do(g.turn, {'type': 'end_turn'})
                self.after_change()

    def draw(self):
        self.frame_no += 1
        t = self.frame_no * 2
        self.ui.begin(t)
        getattr(self, 'draw_' + self.scene)(t)
        self.draw_modal()
        self.draw_tip()
        if self.testing and self.frame_no % 3 == 0:
            try:
                self.publish()
            except Exception as e:
                import platform
                platform.window.console.log('KF publish failed: ' + repr(e))

    def publish(self):
        """For automated browser tests: where the buttons and glowing spots are, and what the game is doing."""
        import json
        g = self.game
        spots = []
        if self.scene == 'game' and self.targets:
            kind, ids, _ = self.targets
            pos = VPOS if kind == 'vertex' else EPOS if kind == 'edge' else HPOS
            spots = [[i, BOARD[0] + 3 + round(pos[i][0]) - VX, BOARD[1] + 3 + round(pos[i][1]) - VY] for i in ids]
        st = {'scene': self.scene, 'modal': self.modal and self.modal['kind'], 'tip': self.tip, 'pass': self.pass_to,
              'notice': self.notice, 'scale': self.scale, 'offset': list(self.offset), 'spots': spots,
              'regions': [[r['key'], r['x'], r['y'], r['w'], r['h'], bool(r['fn'])] for r in self.ui.regions]}
        if self.net:
            st['code'] = self.net.code
            st['host'] = self.net.host
            st['seats'] = len(self.net.seats) if self.net.host else len((self.net.info or {}).get('seats', []))
        if g is not None and self.scene == 'game':
            st.update(phase=g.phase, turn=g.turn, viewer=self.viewer, mine=self.mine(), round=g.round, winner=g.winner,
                      seq=g.event_seq, board=json.dumps([g.buildings, g.roads, g.cloud, g.turn, g.phase, [p.cards() for p in g.players]]),
                      hidden=all(p.count is not None for p in g.players if p.id != self.viewer) if self.guest() else None,
                      uranium=g.players[self.viewer].hand['uranium'] if self.viewer is not None else 0, bombs=sum(p.bombs for p in g.players))
        self.bridge.js.publish(json.dumps(st))

    # ---------- title ----------

    def draw_title(self, t):
        s = self.screen
        s.fill((22, 60, 132))
        board = self.title_board.render(self.demo, None, None, t, [(p.color, p.shade) for p in self.demo.players])
        s.blit(board, (6, 64), (VX, VY, VW, VH))
        lw = self.logo.get_width()
        s.blit(self.logo, ((SW - lw) // 2, 8))
        text(s, 'A building game for the atomic age', SW // 2, 50, C['soft'], align='center')
        mx, my, mw = 206, 74, 188
        self.ui.window(mx, my, mw, 132)
        self.ui.button(mx + 18, my + 12, mw - 30, 18, 'Play online', lambda: self.go('online'), align='left')
        self.ui.button(mx + 18, my + 34, mw - 30, 18, 'Play on this screen', lambda: self.go('setup'), align='left')
        self.ui.button(mx + 18, my + 56, mw - 30, 18, 'How to play', lambda: self.open({'kind': 'rules'}), align='left')
        for i, line in enumerate(wrap('Collect 5 Uranium to drop a bomb. First to 8 points wins!', mw - 24)):
            text(s, line, mx + 12, my + 84 + i * LINE, C['dim'])
        if self.notice:
            lines = wrap(self.notice, SW - 40)
            nh = len(lines) * LINE + 12
            self.ui.window(10, SH - nh - 6, SW - 20, nh)
            for i, line in enumerate(lines):
                text(s, line, 18, SH - nh + i * LINE, C['gold'])
            self.ui.hit(10, SH - nh - 6, SW - 20, nh, lambda: setattr(self, 'notice', None), 'notice')
        text(s, '1955', SW - 8, SH - 12, C['dim'], align='right')

    def go(self, scene):
        audio.play('click')
        self.scene = scene

    def open(self, modal):
        audio.play('click')
        self.modal = modal

    # ---------- online: choose, then wait at the table ----------

    def backdrop(self, t):
        s = self.screen
        s.fill((22, 60, 132))
        board = self.title_board.render(self.demo, None, None, t, [(p.color, p.shade) for p in self.demo.players])
        s.blit(board, ((SW - VW) // 2, (SH - VH) // 2), (VX, VY, VW, VH))
        veil = pygame.Surface((SW, SH), pygame.SRCALPHA)
        veil.fill((22, 60, 132, 150))
        s.blit(veil, (0, 0))

    def draw_online(self, t):
        s, ui = self.screen, self.ui
        self.backdrop(t)
        w, h = 300, 170
        x, y = (SW - w) // 2, (SH - h) // 2
        ui.window(x, y, w, h)
        text(s, 'Play online', x + 10, y + 8, C['gold'])
        if not self.bridge.ok:
            msg = 'Online play works in the browser version of Isotopia: memara719.github.io/kingsfold/isotopia'
            for i, line in enumerate(wrap(msg, w - 20)):
                text(s, line, x + 10, y + 28 + i * LINE, C['soft'])
        else:
            text(s, 'You are', x + 10, y + 28, C['soft'])
            text(s, fit(self.my_name or '(no name yet)', 140), x + 56, y + 28, C['white'])
            ui.button(x + w - 70, y + 24, 60, 15, 'Change', lambda: self.ask_name_again(), glove=False, key='myname')
            ui.button(x + 24, y + 50, w - 48, 18, 'Host a table', lambda: self.ask_name(self.host_table), key='host')
            ui.button(x + 24, y + 74, w - 48, 18, 'Join with a code', lambda: self.ask_name(self.enter_code), key='joincode')
            for i, line in enumerate(wrap('Got an invite link from a friend? Just open it and you will sit at their table.', w - 20)):
                text(s, line, x + 10, y + 102 + i * LINE, C['dim'])
        ui.button(x + 10, y + h - 24, 50, 17, 'Back', lambda: self.go('title'), glove=False)

    def ask_name_again(self):
        audio.play('click')
        self.name_edit = {'kind': 'me', 'value': '', 'then': lambda: self.go('online')}
        self.scene = 'name'

    def enter_code(self):
        self.name_edit = {'kind': 'code', 'value': ''}
        self.scene = 'name'

    def draw_lobby(self, t):
        s, ui, net = self.screen, self.ui, self.net
        self.backdrop(t)
        if net is None:
            return self.go('title')
        w, h = 380, 222
        x, y = (SW - w) // 2, (SH - h) // 2
        ui.window(x, y, w, h)
        if net.host:
            seats = [{'name': q['name'], 'kind': q['kind'], 'here': q['kind'] in ('me', 'bot') or bool(q['cid'])} for q in net.seats]
            you, title = 0, net.seats[0]['name'] + "'s table"
        elif net.info:
            seats, you, title = net.info['seats'], net.info['you'], net.info['title']
        else:
            text(s, f'Joining table {net.code}...', x + 10, y + 8, C['gold'])
            text(s, 'Connecting to your friend.', x + 10, y + 28, C['soft'])
            ui.button(x + 10, y + h - 24, 56, 17, 'Leave', self.leave_table, glove=False)
            return
        text(s, fit(title, w - 110), x + 10, y + 8, C['gold'])
        text(s, net.code, x + w - 12, y + 8, C['white'], align='right')
        text(s, 'Code', x + w - 44, y + 8, C['dim'], align='right')
        text(s, 'At the table', x + 10, y + 26, C['soft'])
        for i in range(4):
            ry = y + 40 + i * 15
            if i >= len(seats):
                text(s, '- empty seat -', x + 26, ry + 1, (90, 102, 176))
                continue
            q = seats[i]
            flag(s, COLORS[i][1], COLORS[i][2], x + 12, ry)
            name = q['name'] + (' (you)' if i == you else '')
            text(s, fit(name, 120), x + 26, ry + 1, C['white'] if q['here'] else C['dim'])
            tag = 'host' if q['kind'] == 'me' else 'bot' if q['kind'] == 'bot' else '' if q['here'] else 'away'
            text(s, tag, x + 170, ry + 1, C['dim'], align='right')
            if net.host and i > 0:
                ui.button(x + 176, ry - 1, 12, 11, 'x', lambda i=i: net.remove(i), glove=False, key=f'rm{i}')
        # inviting friends
        ix, iw = x + 200, w - 212
        text(s, 'Invite friends', ix, y + 26, C['soft'])
        link = str(self.bridge.js.link(net.code)) if self.bridge.ok else net.code
        for i, line in enumerate(wrap(link.replace('https://', ''), iw)[:3]):
            text(s, line, ix, y + 40 + i * LINE, C['white'])
        share = self.bridge.ok and int(self.bridge.js.canShare())
        half = (iw - 4) // 2
        ui.button(ix, y + 76, half if share else iw, 16, 'Copy link', lambda: self.copy_link(link), glove=False, key='copy')
        if share:
            ui.button(ix + half + 4, y + 76, half, 16, 'Share', lambda: self.bridge.js.share(link), glove=False, key='share')
        if getattr(self, 'copied', 0) > pygame.time.get_ticks():
            text(s, 'Copied! Paste it to your friends.', ix, y + 96, C['green'])
        for i, line in enumerate(wrap(f'Or they choose Play online, then Join with a code, and type {net.code}.', iw)):
            text(s, line, ix, y + 110 + i * LINE, C['dim'])
        by = y + h - 24
        ui.button(x + 10, by, 56, 17, 'Leave', self.leave_table, glove=False, key='leave')
        if net.host:
            ui.button(x + 72, by, 62, 17, '+ Bot', net.add_bot, enabled=len(net.seats) < 4, glove=False, key='addbot')
            ui.button(x + w - 80, by, 70, 17, 'Start', self.start_game, kind='red', enabled=len(net.seats) >= 2 and net.ready, glove=False, key='start')
            if not net.ready:
                text(s, 'Opening your table...', x + w - 88, by + 5, C['soft'], align='right')
            elif len(net.seats) < 2:
                text(s, 'Waiting for friends...', x + w - 88, by + 5, C['soft'], align='right')
        else:
            text(s, 'The host starts the game.', x + w - 12, by + 5, C['soft'], align='right')

    def copy_link(self, link):
        audio.play('click')
        if self.bridge.ok:
            self.bridge.js.copy(link)
        self.copied = pygame.time.get_ticks() + 2500

    # ---------- player setup ----------

    def draw_setup(self, t):
        s = self.screen
        s.fill((22, 60, 132))
        board = self.title_board.render(self.demo, None, None, t, [(p.color, p.shade) for p in self.demo.players])
        s.blit(board, ((SW - VW) // 2, (SH - VH) // 2), (VX, VY, VW, VH))
        veil = pygame.Surface((SW, SH), pygame.SRCALPHA)
        veil.fill((22, 60, 132, 150))
        s.blit(veil, (0, 0))
        w, h = 300, 200
        x, y = (SW - w) // 2, (SH - h) // 2
        self.ui.window(x, y, w, h)
        text(s, 'Who is playing?', x + 10, y + 8, C['gold'])
        for i, seat in enumerate(self.seats):
            ry = y + 26 + i * 24
            col = COLORS[i]
            flag(s, col[1], col[2], x + 14, ry + 3)
            off = seat['type'] == 'off'
            self.ui.button(x + 28, ry, 150, 16, '', lambda i=i: self.rename(i), enabled=not off, key=f'nm{i}', glove=False,
                           content=lambda bx, by, p, seat=seat: text(s, fit(seat['name'], 120), bx + 6, by + 5 + p, (255, 255, 255)))
            label = {'human': 'Person', 'bot': 'Bot', 'off': 'Empty'}[seat['type']]
            self.ui.button(x + 184, ry, 70, 16, label, lambda i=i: self.cycle(i), kind='green' if seat['type'] == 'human' else 'blue', key=f'ty{i}', glove=False)
        active = [q for q in self.seats if q['type'] != 'off']
        for i, line in enumerate(wrap('People share this screen and pass it around. Your cards stay hidden while you pass.', w - 20)):
            text(s, line, x + 10, y + 126 + i * LINE, C['soft'])
        self.ui.button(x + 10, y + h - 24, 50, 17, 'Back', lambda: self.go('title'), glove=False)
        self.ui.button(x + w - 80, y + h - 24, 70, 17, 'Start', self.start_game, kind='red', enabled=len(active) >= 2, glove=False, key='start')
        if len(active) < 2:
            text(s, 'Pick at least 2 players.', x + w - 90, y + h - 19, C['red'], align='right')

    def cycle(self, i):
        audio.play('click')
        order = ['human', 'bot', 'off']
        seat = self.seats[i]
        seat['type'] = order[(order.index(seat['type']) + 1) % 3]
        if seat['type'] == 'bot' and not seat['name'].startswith(('Dr.', 'Prof.', 'Mrs.', 'Mr.')):
            seat['name'] = BOT_NAMES[i]
        if seat['type'] == 'human' and seat['name'] in BOT_NAMES:
            seat['name'] = f'Player {i + 1}'

    def rename(self, i):
        audio.play('click')
        self.name_edit = {'seat': i, 'value': ''}
        self.scene = 'name'

    # ---------- name entry on an old-school letter grid ----------

    ROWS = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', "0123456789 -'"]
    CODE_ROWS = ['ABCDEFGHJKLM', 'NPQRSTUVWXYZ']

    def draw_name(self, t):
        s = self.screen
        s.fill((16, 24, 72))
        ed = self.name_edit
        kind = ed.get('kind', 'seat')
        cell, rows = 13, self.CODE_ROWS if kind == 'code' else self.ROWS
        title = {'seat': f"Name for player {ed.get('seat', 0) + 1}", 'me': 'Your name, so friends know you', 'code': 'Table code (4 letters)'}[kind]
        gw = len(rows[0]) * cell
        w, h = gw + 30, 60 + len(rows) * cell + 36
        x, y = (SW - w) // 2, (SH - h) // 2
        self.ui.window(x, y, w, h)
        text(s, title, x + 10, y + 8, C['gold'])
        s.fill((12, 18, 64), (x + 10, y + 22, w - 20, 16))
        text(s, ed['value'] + ('_' if (t // 12) % 2 and len(ed['value']) < self.max_len() else ' '), x + 15, y + 26)
        gx, gy = x + (w - gw) // 2, y + 46
        for r, row in enumerate(rows):
            for i, ch in enumerate(row):
                cx, cy = gx + i * cell, gy + r * cell
                hot = self.ui.hit(cx, cy, cell, cell, lambda ch=ch: self.type_key(ch), f'k{r}:{i}')
                if hot:
                    s.fill((80, 104, 216), (cx, cy, cell - 1, cell - 1))
                text(s, '_' if ch == ' ' else ch, cx + 6, cy + 3, C['dim'] if ch == ' ' else C['white'], align='center')
        by = gy + len(rows) * cell + 8
        back = {'seat': 'setup', 'me': 'title', 'code': 'online'}[kind]
        self.ui.button(x + 10, by, 46, 16, 'Back', lambda: self.go(back), glove=False)
        self.ui.button(x + 62, by, 40, 16, 'Del', lambda: self.type_key(None), glove=False)
        ok = bool(ed['value'].strip()) and (kind != 'code' or len(ed['value']) == 4)
        self.ui.button(x + w - 60, by, 50, 16, 'OK', self.save_name, kind='red', enabled=ok, glove=False, key='nameok')

    def max_len(self):
        return 4 if self.name_edit.get('kind') == 'code' else 12

    def type_key(self, ch):
        ed = self.name_edit
        if ch is None:
            ed['value'] = ed['value'][:-1]
        elif len(ed['value']) < self.max_len():
            ed['value'] += ch.upper() if ed.get('kind') == 'code' else ch
            audio.play('click')

    def save_name(self):
        ed = self.name_edit
        value = ed['value'].strip()
        kind = ed.get('kind', 'seat')
        if not value or (kind == 'code' and len(value) != 4):
            return
        self.name_edit = None
        if kind == 'seat':
            self.seats[ed['seat']]['name'] = value[:12]
            self.go('setup')
        elif kind == 'me':
            self.my_name = online.clean(value)
            self.bridge.save('iso_name', self.my_name, True)
            ed['then']()
        else:
            self.join(value.upper())

    # ---------- the game ----------

    def draw_game(self, t):
        s = self.screen
        s.fill((12, 16, 54))
        self.draw_board(t)
        self.draw_hand()
        self.draw_status()
        self.draw_players()
        self.draw_actions()
        if self.pass_to is not None:
            self.draw_pass()

    def phase_text(self):
        g = self.game
        p = g.players[g.turn]
        mine = self.mine()
        ph = g.phase
        if g.winner is not None:
            return f'{g.players[g.winner].name} wins!', 'The city of tomorrow is built.'
        if ph == 'setup_house':
            return ('Place a house', 'Tap a glowing spot on the map.') if mine else (f'{p.name} is settling', 'Picking a spot...')
        if ph == 'setup_road':
            return ('Place a road', 'It must touch your new house.') if mine else (f'{p.name} is settling', 'Placing a road...')
        if ph == 'roll':
            return ('Your turn!', 'Roll the dice.') if mine else (f"{p.name}'s turn", 'About to roll...')
        if ph == 'cloud':
            return ('Move the cloud', 'Tap a land to send it there.') if mine else (f'{p.name} moves the cloud', 'Choosing a land...')
        return ('Your turn!', 'Build, trade, then End turn.') if mine else (f"{p.name}'s turn", 'Building and trading...')

    def draw_status(self):
        s, ui, g = self.screen, self.ui, self.game
        x, y, w, h = STATUS
        ui.window(x, y, w, h)
        a, b = self.phase_text()
        ui.button(x + w - 21, y + 4, 15, 13, '', lambda: self.open({'kind': 'menu'}), glove=False, key='menu',
                  content=lambda bx, by, p: [s.fill((255, 255, 255), (bx + 4, by + 3 + i * 3 + p, 7, 1)) for i in range(3)])
        text(s, fit(a, w - 36), x + 7, y + 6, C['gold'] if self.mine() else C['white'])
        text(s, fit(b, w - 14), x + 7, y + 6 + LINE, C['soft'])
        danger = [o for o in g.players if o.hand['uranium'] >= 3 and o.bombs < BOMBS_EACH]
        if danger:
            o = max(danger, key=lambda q: q.hand['uranium'])
            msg = f"{self.pname(o.id)} {'have' if o.id == self.viewer else 'has'} {o.hand['uranium']}/{BOMB_URANIUM} Uranium!"
            col = C['red'] if (self.ui.t // 10) % 2 or o.hand['uranium'] < BOMB_URANIUM else (255, 220, 80)
            s.blit(icon('uranium'), (x + 7, y + 6 + 2 * LINE))
            text(s, fit(msg, w - 26), x + 17, y + 6 + 2 * LINE, col)
        else:
            text(s, f'First to {WIN_POINTS} points wins.', x + 7, y + 6 + 2 * LINE, C['dim'])

    def draw_players(self):
        s, ui, g = self.screen, self.ui, self.game
        x, y, w, h = PLAYERS
        ui.window(x, y, w, h)
        text(s, 'pts', x + w - 8, y + 5, C['dim'], align='right')
        for i, p in enumerate(g.players):
            ry = y + 17 + i * 13
            if p.id == g.turn and g.winner is None:
                s.blit(ui.glove, (x + 3 + (ui.t // 8) % 2, ry))
            flag(s, p.color, p.shade, x + 16, ry - 1)
            text(s, fit(p.name, 66), x + 28, ry, C['gold'] if p.id == self.viewer else C['white'])
            rx = x + w - 8
            rx -= text(s, str(g.points(p.id)), rx, ry, C['white'], align='right') + 22
            if g.longest == p.id:
                s.blit(icon('longroad'), (rx + 8, ry))
            n = text(s, str(hand_size(p.hand)), rx, ry, C['soft'], align='right')
            s.blit(icon('card'), (rx - n - 10, ry - 2))
            rx -= n + 26
            u = p.hand['uranium']
            col = C['red'] if u >= 3 and p.bombs < BOMBS_EACH else C['green'] if u else C['dim']
            text(s, f'{u}/{BOMB_URANIUM}' if p.bombs < BOMBS_EACH else 'used', rx, ry, col, align='right')
            s.blit(icon('uranium'), (rx - width(f'{u}/{BOMB_URANIUM}' if p.bombs < BOMBS_EACH else 'used') - 10, ry))

    def draw_board(self, t):
        s, ui, g = self.screen, self.ui, self.game
        x, y, w, h = BOARD
        ui.window(x, y, w, h)
        bx, by = x + 3, y + 3
        self.hover = None
        if self.targets and bx <= ui.mx < bx + VW and by <= ui.my < by + VH:
            self.hover = self.target_at(ui.mx - bx + VX, ui.my - by + VY)
        tg = (self.targets[0], self.targets[1]) if self.targets else None
        surf = self.board.render(g, tg, self.hover, t, self.colors)
        shake = (random.randint(-2, 2), random.randint(-2, 2)) if pygame.time.get_ticks() < self.wait_until - 1800 else (0, 0)
        s.blit(surf, (bx + shake[0], by + shake[1]), (VX, VY, VW, VH))
        ui.hit(bx, by, VW, VH, lambda mx, my: self.board_click(mx - bx + VX, my - by + VY), 'board', xy=True)

        bottom = by + VH - 3
        if self.mode and self.targets:
            what = {'road': 'road', 'house': 'house', 'town': 'atomic town', 'shelter': 'shelter', 'bomb': 'bomb'}[self.mode]
            msg = f'Tap a glowing spot for your {what}.' if self.mode != 'bomb' else 'Tap the land to bomb.'
            if not self.targets[1]:
                msg = f'No spot for a {what} right now.'
            ui.window(bx + 2, bottom - 20, VW - 4, 20)
            ui.block(bx + 2, bottom - 20, VW - 4, 20)
            text(s, fit(msg, VW - 66), bx + 8, bottom - 13, C['red'] if self.mode == 'bomb' else C['white'])
            ui.button(bx + VW - 52, bottom - 16, 44, 12, 'Cancel', lambda: self.set_mode(None), glove=False, key='cancel')
            bottom -= 22
        now = pygame.time.get_ticks()
        self.toasts = [m for m in self.toasts if now - m[1] < 4200]
        for msg, _ in self.toasts[-1:]:
            lines = wrap(msg, VW - 20)[:3]
            hh = len(lines) * LINE + 8
            bottom -= hh
            ui.window(bx + 2, bottom, VW - 4, hh)
            for i, line in enumerate(lines):
                text(s, line, bx + 9, bottom + 5 + i * LINE)
        self.banners = [m for m in self.banners if now - m[1] < 1800]
        for msg, t0 in self.banners:
            bw = min(VW - 8, width(msg) * 2 + 24)
            yy = by + VH // 2 - 16 - min(10, (now - t0) // 20)
            ui.window(bx + (VW - bw) // 2, yy, bw, 26)
            text(s, msg, bx + VW // 2, yy + 6, C['red'] if msg == 'BOOM!' else C['gold'], align='center', scale=2)

    def target_at(self, x, y):
        kind, ids, _ = self.targets
        if kind == 'vertex':
            return self.board.vertex_at(x, y, ids)
        if kind == 'edge':
            return self.board.edge_at(x, y, ids)
        h = self.board.hex_at(x, y)
        return h if h in ids else None

    def board_click(self, x, y):
        g = self.game
        if self.targets:
            i = self.target_at(x, y)
            if i is None:
                return
            audio.play('click')
            kind, _, make = self.targets
            if kind == 'bomb':
                self.modal = {'kind': 'bomb', 'hex': i}
                return
            self.mode = None
            self.act(make(i))
            return
        h = self.board.hex_at(x, y)
        if h < 0:
            return
        hx = g.hexes[h]
        if h == CENTER:
            return self.toast('The Atomic Lab. The radiation cloud waits here until someone rolls a 7.')
        if hx['crater']:
            return self.toast('A glowing crater. Nothing will grow here again.')
        owners = sorted({self.pname(g.buildings[v]['owner']) for v in GEO.hexes[h]['vertices'] if g.buildings[v]})
        msg = f"{TERRAIN_NAME[hx['terrain']]} on {hx['number']} pays {RES_NAME[TERRAIN_RES[hx['terrain']]]}"
        msg += (' to ' + ', '.join(owners) + '.') if owners else '. Nobody lives here yet.'
        if g.cloud == h:
            msg += ' The cloud blocks it.'
        self.toast(msg)

    def draw_hand(self):
        s, ui, g = self.screen, self.ui, self.game
        x, y, w, h = HAND
        ui.window(x, y, w, h)
        p = g.players[self.viewer] if self.viewer is not None else None
        now = pygame.time.get_ticks()
        for i, res in enumerate(RES):
            cx, cy, cw, ch = x + 4 + i * 38, y + 4, 34, h - 8
            n = p.hand[res] if p else None
            bump = self.bumps.get(res, 0) > now - 500 and self.bumps.get(res, 0) <= now
            s.fill(INK, (cx, cy, cw, ch))
            if res == 'uranium':
                face = (200, 255, 150) if (n and n >= BOMB_URANIUM and (ui.t // 8) % 2) else (214, 246, 180) if n else (150, 170, 130)
            else:
                face = (255, 240, 160) if bump else C['parch'] if n else (184, 172, 144)
            s.fill(face, (cx + 1, cy + 1, cw - 2, ch - 2))
            s.fill((156, 144, 120) if not n else C['parch_shade'], (cx + 1, cy + ch - 3, cw - 2, 2))
            ic = icon(res, 2)
            if not n:
                ic = ic.copy()
                ic.set_alpha(110)
            s.blit(ic, (cx + (cw - ic.get_width()) // 2, cy + 3 + (8 - ic.get_height() // 2) - (2 if bump else 0)))
            label = '?' if n is None else str(n)
            text(s, label, cx + cw // 2, cy + 20, C['parch_ink'] if n else (122, 112, 92), shadow=None, align='center', scale=2)
            name = RES_NAME[res] if res != 'uranium' or n is None else f'{n}/{BOMB_URANIUM}'
            text(s, fit(name, cw - 2), cx + cw // 2, cy + 38, (122, 90, 48) if n else (133, 122, 100), shadow=None, align='center')

    def draw_actions(self):
        s, ui, g = self.screen, self.ui, self.game
        x, y, w, h = ACTIONS
        ui.window(x, y, w, h)
        mine = self.mine()
        main = mine and g.phase == 'main'
        p = g.players[g.turn]
        x0, y0, iw = x + 7, y + 6, w - 14
        rolling = pygame.time.get_ticks() < self.roll_until
        faces = (random.randint(1, 6), random.randint(1, 6)) if rolling else g.dice or (1, 1)
        for k, f in enumerate(faces):
            d = pygame.transform.scale(die(f), (18, 18))
            if not (g.dice or rolling):
                d.set_alpha(110)
            s.blit(d, (x0 + k * 21, y0 + (random.randint(0, 1) if rolling else 0)))
        ui.button(x0 + 46, y0, iw - 46, 18, 'ROLL', lambda: self.act({'type': 'roll'}), kind='red', enabled=mine and g.phase == 'roll', key='roll')

        sp = g.spots(g.turn) if main else {'roads': [], 'houses': [], 'towns': [], 'shelters': [], 'bomb': []}
        hand = p.hand if main else (g.players[self.viewer].hand if self.viewer is not None else None)
        bw, bh, gap = (iw - 4) // 2, 16, 4
        bomb_ready = main and p.hand['uranium'] >= BOMB_URANIUM and p.bombs < BOMBS_EACH
        items = [
            ('Road', COSTS['road'], main and can_pay(p.hand, COSTS['road']) and bool(sp['roads']) and p.roads < LIMITS['road'], 'road'),
            ('House', COSTS['house'], main and can_pay(p.hand, COSTS['house']) and bool(sp['houses']) and p.houses < LIMITS['house'], 'house'),
            ('Town', COSTS['town'], main and can_pay(p.hand, COSTS['town']) and bool(sp['towns']) and p.towns < LIMITS['town'], 'town'),
            ('Shelter', COSTS['shelter'], main and can_pay(p.hand, COSTS['shelter']) and bool(sp['shelters']), 'shelter'),
            ('Trade', None, main and hand_size(p.hand) >= BANK_RATE, 'trade'),
            ('BOMB', COSTS['bomb'], bomb_ready, 'bomb'),
        ]
        for i, (label, cost, ok, key) in enumerate(items):
            bx2, by2 = x0 + (i % 2) * (bw + gap), y0 + 22 + (i // 2) * (bh + 3)
            fn = (lambda key=key: self.open({'kind': 'trade', 'give': None, 'get': None})) if key == 'trade' else (lambda key=key: (audio.play('click'), self.set_mode(None if self.mode == key else key)))
            kind = 'red' if key == 'bomb' else 'blue'
            ui.button(bx2, by2, bw, bh, label, fn, kind=kind, enabled=ok, selected=self.mode == key, align='left', key='act' + key,
                      content=(lambda bx, byy, pr, cost=cost: self.cost_row(cost, hand, bx + bw - 5 - self.cost_width(cost), byy + 4 + pr)) if cost else None)
        ui.button(x0, y0 + 22 + 3 * (bh + 3), iw, bh, 'End turn', lambda: (self.set_mode(None), self.act({'type': 'end_turn'})), kind='red', enabled=main, key='end')

    def cost_width(self, cost):
        if cost.get('uranium', 0) >= 3:
            return icon('uranium').get_width() + 3 + width(f"x{cost['uranium']}")
        return sum(n * (icon(r).get_width() - 1) for r, n in cost.items())

    def cost_row(self, cost, hand, x, y):
        s = self.screen
        if cost.get('uranium', 0) >= 3:
            ic = icon('uranium')
            s.blit(ic, (x, y + 8 - ic.get_height()))
            text(s, f"x{cost['uranium']}", x + ic.get_width() + 3, y, C['white'])
            return
        have = dict(hand) if hand else None
        cx = x
        for r in RES:
            for _ in range(cost.get(r, 0)):
                ic = icon(r)
                if have is not None:
                    if have[r] > 0:
                        have[r] -= 1
                    else:
                        ic = ic.copy()
                        ic.set_alpha(80)
                s.blit(ic, (cx, y + 8 - ic.get_height()))
                cx += ic.get_width() - 1

    def draw_pass(self):
        s, ui, g = self.screen, self.ui, self.game
        ui.block(0, 0, SW, SH)
        s.fill((10, 14, 44), (0, 0, SW, SH))
        p = g.players[self.pass_to]
        w, h = 240, 100
        x, y = (SW - w) // 2, (SH - h) // 2
        ui.window(x, y, w, h)
        flag(s, p.color, p.shade, x + 14, y + 12)
        text(s, f'Pass to {p.name}', x + 28, y + 13, C['gold'])
        for i, line in enumerate(wrap('Everyone else, look away! Your cards are hidden until you press the button.', w - 28)):
            text(s, line, x + 14, y + 30 + i * LINE, C['soft'])
        ui.button(x + 14, y + h - 26, w - 28, 18, f"I'm {fit(p.name, 120)}, show my cards", self.take_device, kind='green', key='ready')

    def take_device(self):
        audio.play('turn')
        self.viewer = self.pass_to
        self.pass_to = None
        self.banner('Your turn!')
        self.update_targets()
        self.maybe_tip()

    # ---------- pop-up windows ----------

    def box(self, w, h, title):
        s, ui = self.screen, self.ui
        ui.block(0, 0, SW, SH)
        shade = pygame.Surface((SW, SH), pygame.SRCALPHA)
        shade.fill((8, 8, 24, 140))
        s.blit(shade, (0, 0))
        w, h = min(w, SW - 6), min(h, SH - 6)
        x, y = (SW - w) // 2, (SH - h) // 2
        ui.window(x, y, w, h)
        if title:
            text(s, title, x + 8, y + 7, C['gold'])
        return x, y, w, h

    def close(self):
        audio.play('click')
        self.modal = None

    def draw_modal(self):
        m = self.modal
        if not m:
            return
        s, ui = self.screen, self.ui
        kind = m['kind']
        if kind == 'rules':
            x, y, w, h = self.box(316, 220, 'How to play')
            lines = [
                'Roll the dice. Every land showing that number pays the houses next to it. Atomic towns get 2.',
                'Build roads, houses and towns. Spots you can build on glow.',
                'Two rare mines give Uranium. With 5 Uranium you can drop your one bomb: every building on that land is destroyed, and the land becomes a crater.',
                'A fallout shelter keeps one building safe from bombs.',
                'Roll a 7 and the radiation cloud moves. Over 7 cards? You lose half.',
                f'House 1 point, town 2, longest road 2. First to {WIN_POINTS} wins!',
            ]
            yy = y + 20
            for line in lines:
                for i, part in enumerate(wrap(line, w - 16)):
                    text(s, part, x + 8, yy + i * LINE)
                yy += len(wrap(line, w - 16)) * LINE + 2
            ui.button(x + w - 58, y + h - 21, 50, 15, 'OK', self.close, glove=False)
        elif kind == 'menu':
            x, y, w, h = self.box(180, 130, 'Menu')
            rows = [
                (f"Sound: {'on' if audio.enabled else 'off'}", self.toggle_sound),
                (f"Professor's tips: {'on' if self.tips_on else 'off'}", self.toggle_tips),
                ('How to play', lambda: self.open({'kind': 'rules'})),
                ('Quit to title', self.quit_game),
            ]
            for i, (label, fn) in enumerate(rows):
                ui.button(x + 18, y + 20 + i * 20, w - 26, 16, label, fn, align='left', key=f'menu{i}')
            ui.button(x + w - 58, y + h - 20, 50, 14, 'Back', self.close, glove=False)
        elif kind == 'trade':
            self.draw_trade(m)
        elif kind == 'bomb':
            self.draw_bomb_confirm(m)
        elif kind == 'over':
            self.draw_over()

    def toggle_sound(self):
        audio.enabled = not audio.enabled
        audio.play('click')

    def toggle_tips(self):
        self.tips_on = not self.tips_on
        if self.tips_on:
            self.seen.clear()
        if self.game:
            self.maybe_tip()

    def quit_game(self):
        if self.net:
            return self.leave_table()
        self.modal = None
        self.game = None
        self.go('title')

    def draw_trade(self, m):
        s, ui, g = self.screen, self.ui, self.game
        p = g.players[g.turn]
        x, y, w, h = self.box(260, 150, f'Trade with the bank: {BANK_RATE} for 1')
        slot = (w - 16) // 5
        text(s, f'Give {BANK_RATE} of:', x + 8, y + 22, C['soft'])
        for i, r in enumerate(RES):
            ui.button(x + 8 + i * slot, y + 34, slot - 3, 26, '', lambda r=r: m.update(give=r), enabled=p.hand[r] >= BANK_RATE, selected=m['give'] == r, glove=False, key='tg' + r,
                      content=lambda bx, by, pr, r=r: (s.blit(icon(r), (bx + (slot - 3 - icon(r).get_width()) // 2, by + 4)),
                                                         text(s, str(p.hand[r]), bx + (slot - 3) // 2, by + 15, (58, 36, 8) if m['give'] == r else C['white'], shadow=None if m['give'] == r else (16, 16, 48), align='center')))
        text(s, 'Get 1:', x + 8, y + 66, C['soft'])
        for i, r in enumerate(RES):
            ok = r != m['give'] and r != 'uranium'
            ui.button(x + 8 + i * slot, y + 78, slot - 3, 20, '', lambda r=r: m.update(get=r), enabled=ok, selected=m['get'] == r, glove=False, key='tw' + r,
                      content=lambda bx, by, pr, r=r: s.blit(icon(r), (bx + (slot - 3 - icon(r).get_width()) // 2, by + 6)))
        text(s, 'The bank never sells Uranium.', x + 8, y + 102, C['dim'])
        ok = m['give'] and m['get'] and m['give'] != m['get']
        ui.button(x + 8, y + h - 22, 120, 16, 'Trade', lambda: (self.act({'type': 'trade', 'give': m['give'], 'get': m['get']}), m.update(give=None, get=None), audio.play('coin')), kind='red', enabled=bool(ok), glove=False, key='dotrade')
        ui.button(x + w - 58, y + h - 22, 50, 16, 'Close', self.close, glove=False)

    def draw_bomb_confirm(self, m):
        s, ui, g = self.screen, self.ui, self.game
        hx = m['hex']
        dmg = g.bomb_damage(hx)
        safe = [v for v in GEO.hexes[hx]['vertices'] if g.buildings[v] and g.buildings[v]['shelter']]
        x, y, w, h = self.box(250, 120 + 11 * max(0, len(dmg) - 2), 'Drop the bomb here?')
        terr = TERRAIN_NAME[g.hexes[hx]['terrain']]
        text(s, f'The {terr.lower()} becomes a crater forever.', x + 8, y + 22)
        yy = y + 36
        if dmg:
            text(s, 'It destroys:', x + 8, yy, C['soft'])
            yy += LINE
            for v, o, k in dmg:
                col = C['red'] if o == g.turn else C['white']
                text(s, f"- {'YOUR' if o == g.turn else g.players[o].name + chr(39) + 's'} {'atomic town' if k == 'town' else 'house'}", x + 14, yy, col)
                yy += LINE
        else:
            text(s, 'Nobody lives there yet.', x + 8, yy, C['soft'])
            yy += LINE
        if safe:
            text(s, f'{len(safe)} building(s) survive in shelters.', x + 8, yy, C['green'])
        ui.button(x + 8, y + h - 22, 100, 16, 'DROP IT', lambda: (setattr(self, 'modal', None), self.set_mode(None), self.act({'type': 'bomb', 'hex': hx})), kind='red', glove=False, key='drop')
        ui.button(x + w - 68, y + h - 22, 60, 16, 'Cancel', self.close, glove=False)

    def draw_over(self):
        s, ui, g = self.screen, self.ui, self.game
        order = sorted(g.players, key=lambda p: -g.points(p.id))
        win = g.players[g.winner]
        x, y, w, h = self.box(230, 60 + len(order) * 14 + 26, f'{fit(win.name, 150)} wins!')
        text(s, 'They built the city of tomorrow.', x + 8, y + 22)
        for i, p in enumerate(order):
            ry = y + 40 + i * 14
            if p.id == g.winner:
                s.fill((106, 80, 16), (x + 6, ry - 2, w - 12, 12))
            flag(s, p.color, p.shade, x + 8, ry - 1)
            text(s, fit(p.name, 120), x + 20, ry, C['gold'] if p.id == g.winner else C['white'])
            text(s, f'{g.points(p.id)} pts', x + w - 8, ry, C['white'], align='right')
        ui.button(x + 8, y + h - 22, 80, 16, 'Main menu', self.quit_game, glove=False)
        if self.guest():
            text(s, 'The host can play again.', x + w - 8, y + h - 18, C['soft'], align='right')
        else:
            ui.button(x + w - 98, y + h - 22, 90, 16, 'Play again', self.start_game, kind='green', glove=False, key='again')

    def draw_tip(self):
        if self.scene != 'game' or not self.tip or self.modal or self.pass_to is not None:
            return
        s, ui = self.screen, self.ui
        w = 300
        lines = wrap(TIPS[self.tip], w - 54)
        h = max(44, len(lines) * LINE + 28)
        x, y = 4, SH - h - 3
        ui.window(x, y, w, h)
        ui.block(x, y, w, h)
        s.blit(pygame.transform.scale(self.prof, (28, 28)), (x + 8, y + 8))
        text(s, 'Professor Atom', x + 44, y + 6, C['gold'])
        for i, line in enumerate(lines):
            text(s, line, x + 44, y + 17 + i * LINE)
        ui.button(x + w - 40, y + h - 18, 32, 13, 'OK', self.dismiss_tip, glove=False, key='tipok')

    def dismiss_tip(self):
        self.seen.add(self.tip)
        self.tip = None
        self.maybe_tip()

    # ---------- input ----------

    def to_screen(self, pos):
        sx, sy = self.offset
        return int((pos[0] - sx) / self.scale), int((pos[1] - sy) / self.scale)

    def handle(self, e):
        ui = self.ui
        if e.type == pygame.MOUSEMOTION:
            ui.mx, ui.my = self.to_screen(e.pos)
        elif e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            ui.mx, ui.my = self.to_screen(e.pos)
            ui.down = True
        elif e.type == pygame.MOUSEBUTTONUP and e.button == 1:
            ui.down = False
            x, y = self.to_screen(e.pos)
            ui.click(x, y)
        elif e.type == pygame.KEYDOWN:
            self.key(e)

    def key(self, e):
        if self.scene == 'name' and self.name_edit:
            if e.key == pygame.K_BACKSPACE:
                self.type_key(None)
            elif e.key == pygame.K_RETURN:
                self.save_name()
            elif e.unicode and (e.unicode.isalnum() or e.unicode in " -'"):
                if self.name_edit.get('kind') != 'code' or e.unicode.isalpha():
                    self.type_key(e.unicode)
            return
        if e.key == pygame.K_ESCAPE:
            if self.modal and self.modal['kind'] != 'over':
                self.modal = None
            elif self.scene == 'game' and self.mode:
                self.set_mode(None)
        if self.scene == 'game' and self.mine() and not self.modal and not self.tip:
            if e.key == pygame.K_SPACE and self.game.phase == 'roll':
                self.act({'type': 'roll'})
            elif e.key == pygame.K_RETURN and self.game.phase == 'main':
                self.set_mode(None)
                self.act({'type': 'end_turn'})

    def present(self, window):
        """Scale the pixel screen up to fill the window, keeping its shape."""
        ww, wh = window.get_size()
        sc = min(ww / SW, wh / SH)
        if sc >= 2 and int(sc) / sc >= 0.85:
            sc = int(sc)
        self.scale = sc
        dw, dh = int(SW * sc), int(SH * sc)
        self.offset = ((ww - dw) // 2, (wh - dh) // 2)
        window.fill((10, 11, 32))
        window.blit(pygame.transform.scale(self.screen, (dw, dh)), self.offset)
