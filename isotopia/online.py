"""Online tables, for the browser version.

One friend's browser hosts: it runs the real game (and the bots) and sends every player their own view,
with other players' cards hidden. Friends connect to it directly through PeerJS (see web/kfnet.js).
On the desktop there is no browser, so online play is not offered there."""

import json
import random

LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
MAX_SEATS = 4
BOT_NAMES = ['Dr. Bloom', 'Prof. Pike', 'Mrs. Volt', 'Mr. Ray']


class Bridge:
    """Talks to the page's JavaScript. Only exists when running in a browser through pygbag."""

    def __init__(self):
        self.js = None
        try:
            import platform
            w = platform.window
            w.eval(open('web/peerjs.min.js').read())
            w.eval(open('web/kfnet.js').read())
            self.js = w.kfnet
            random.seed(int(str(self.js.seed())))
        except Exception:
            self.js = None

    @property
    def ok(self):
        return self.js is not None

    def events(self):
        try:
            return json.loads(str(self.js.poll()))
        except Exception:
            return []

    def save(self, key, value, lasting=False):
        if self.ok:
            self.js.save(key, value, 1 if lasting else 0)

    def load(self, key, lasting=False):
        return str(self.js.load(key, 1 if lasting else 0)) if self.ok else ''


_bridge = None


def bridge():
    global _bridge
    if _bridge is None:
        _bridge = Bridge()
    return _bridge


def new_code():
    return ''.join(random.choice(LETTERS) for _ in range(4))


def new_token():
    return ''.join(random.choice('abcdefghijkmnpqrstuvwxyz23456789') for _ in range(12))


class HostTable:
    """Runs a table in this browser. The app owns the Game; this keeps the seats and the connections."""

    def __init__(self, app, name, saved=None):
        self.app = app
        self.b = bridge()
        self.host = True
        self.error = None
        self.ready = False
        self.claim_tries = 0
        if saved:
            self.code = saved['code']
            self.seats = saved['seats']
            for s in self.seats:
                s['cid'] = None
            self.started = saved['game'] is not None
        else:
            self.code = new_code()
            self.seats = [{'name': name, 'kind': 'me', 'token': '', 'cid': None}]
            self.started = False
        self.b.js.host(self.code)
        self.b.js.setHash(self.code)
        self.resuming = bool(saved)

    # what each player sees of the table
    def lobby(self, you):
        return {'t': 'lobby', 'code': self.code, 'started': self.started, 'you': you, 'title': self.seats[0]['name'] + "'s table",
                'seats': [{'name': s['name'], 'kind': s['kind'], 'here': s['kind'] in ('me', 'bot') or bool(s['cid'])} for s in self.seats]}

    def send(self, cid, msg):
        if cid:
            self.b.js.send(cid, json.dumps(msg))

    def broadcast(self):
        for i, s in enumerate(self.seats):
            if s['kind'] == 'friend' and s['cid']:
                self.send(s['cid'], self.lobby(i))
                if self.started and self.app.game:
                    self.send(s['cid'], {'t': 'state', 'you': i, 'game': self.app.game.to_dict(seat=i)})
        self.remember()

    def remember(self):
        """Keep the table in this tab's memory, so reloading the page picks the game back up."""
        g = self.app.game if self.started else None
        self.b.save('iso_hosting', json.dumps({'code': self.code, 'seats': [{k: v for k, v in s.items() if k != 'cid'} for s in self.seats],
                                               'game': g.to_dict() if g else None}))

    def seat_of(self, cid):
        for i, s in enumerate(self.seats):
            if s['cid'] == cid:
                return i
        return -1

    def away(self, i):
        s = self.seats[i]
        return s['kind'] == 'friend' and not s['cid']

    def poll(self):
        for e in self.b.events():
            kind = e.get('e')
            if kind == 'ready':
                self.ready = True
            elif kind == 'error':
                if e.get('kind') == 'unavailable-id' and self.resuming and self.claim_tries < 20:
                    # after a reload the old address takes a little while to free up
                    self.claim_tries += 1
                    self.b.js.close()
                    self.b.js.host(self.code)
                elif e.get('kind') == 'unavailable-id':
                    self.error = 'That table code is taken. Try hosting again.'
                elif not self.ready:
                    self.error = "Couldn't reach the matchmaking service. Check your internet connection."
            elif kind == 'leave':
                i = self.seat_of(e['cid'])
                if i >= 0:
                    self.seats[i]['cid'] = None
                    if not self.started:
                        self.seats.pop(i)
                    self.broadcast()
                    self.app.on_table_change()
            elif kind == 'msg':
                try:
                    m = json.loads(e['data'])
                except ValueError:
                    continue
                self.message(e['cid'], m)

    def message(self, cid, m):
        t = m.get('t')
        if t == 'hello':
            token = str(m.get('token', ''))[:20]
            name = clean(m.get('name'))
            back = next((s for s in self.seats if s['kind'] == 'friend' and token and s['token'] == token), None)
            if back:
                back['cid'] = cid
            elif self.started:
                return self.send(cid, {'t': 'bye', 'msg': 'That game has already started.'})
            elif len(self.seats) >= MAX_SEATS:
                return self.send(cid, {'t': 'bye', 'msg': 'That table is full (4 players).'})
            else:
                self.seats.append({'name': name, 'kind': 'friend', 'token': token or new_token(), 'cid': cid})
            i = self.seat_of(cid)
            self.send(cid, {'t': 'token', 'token': self.seats[i]['token'], 'code': self.code})
            self.broadcast()
            self.app.on_table_change()
        elif t == 'act' and self.started:
            i = self.seat_of(cid)
            g = self.app.game
            if i < 0 or g is None or g.turn != i:
                return
            err = g.do(i, m.get('a') or {})
            if err:
                self.send(cid, {'t': 'err', 'msg': err})
            self.app.after_change()

    # the host's buttons
    def add_bot(self):
        if not self.started and len(self.seats) < MAX_SEATS:
            used = {s['name'] for s in self.seats}
            self.seats.append({'name': next(n for n in BOT_NAMES if n not in used), 'kind': 'bot', 'token': '', 'cid': None})
            self.broadcast()

    def remove(self, i):
        if not self.started and 0 < i < len(self.seats):
            s = self.seats.pop(i)
            if s['cid']:
                self.send(s['cid'], {'t': 'bye', 'msg': 'The host removed you from the table.'})
                self.b.js.drop(s['cid'])
            self.broadcast()

    def leave(self):
        for s in self.seats:
            if s['cid']:
                self.send(s['cid'], {'t': 'bye', 'msg': 'The host closed the table.'})
        self.b.save('iso_hosting', '')
        self.b.js.setHash('')
        self.b.js.close()


class GuestTable:
    """Sits at a friend's table: shows what the host sends and sends our moves back."""

    def __init__(self, app, name, code):
        self.app = app
        self.b = bridge()
        self.host = False
        self.code = code
        self.name = name
        self.error = None
        self.info = None
        self.tries = 0
        self.connected = False
        self.retry_at = 0
        self.token = self.b.load('iso_token_' + code)
        self.b.js.setHash(code)
        self.b.js.join(code)

    def poll(self, now):
        for e in self.b.events():
            kind = e.get('e')
            if kind == 'open':
                self.connected = True
                self.tries = 0
                self.b.js.send('', json.dumps({'t': 'hello', 'name': self.name, 'token': self.token}))
            elif kind == 'error':
                if e.get('kind') == 'peer-unavailable' and not self.info:
                    self.error = f'No table with code {self.code} is open right now. Check the code, or ask your friend for the link again.'
                elif not self.connected:
                    self.lost(now)
            elif kind == 'close':
                self.connected = False
                self.lost(now)
            elif kind == 'msg':
                try:
                    m = json.loads(e['data'])
                except ValueError:
                    continue
                t = m.get('t')
                if t == 'token':
                    self.token = m['token']
                    self.b.save('iso_token_' + self.code, self.token)
                elif t == 'lobby':
                    self.info = m
                    self.app.on_table_change()
                elif t == 'state':
                    self.app.guest_state(m)
                elif t == 'err':
                    self.app.toast(m.get('msg', 'That move is not allowed.'))
                elif t == 'bye':
                    self.error = m.get('msg', 'The table closed.')
        if self.retry_at and now >= self.retry_at:
            self.retry_at = 0
            self.b.js.close()
            self.b.js.join(self.code)

    def lost(self, now):
        # the host may just be reloading: keep trying for a while
        self.tries += 1
        if self.tries > 12:
            self.error = 'Lost the connection to the table.'
        else:
            self.retry_at = now + min(8000, 1000 * self.tries)

    def act(self, a):
        self.b.js.send('', json.dumps({'t': 'act', 'a': a}))

    def leave(self):
        self.b.save('iso_token_' + self.code, '')
        self.b.js.setHash('')
        self.b.js.close()


def clean(name):
    name = ''.join(ch for ch in str(name or '') if ch.isalnum() or ch in " -'.")
    return name.strip()[:12] or 'Traveler'
