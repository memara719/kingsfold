"""Plays Isotopia through its real screen, with no window: every move is a mouse click on a button or a map spot.
Usage: python3 test/isotopia_play.py [screenshot folder]
Plays one person against two bots, then two people sharing the screen with one bot."""

import os
import random
import sys

os.environ.setdefault('SDL_VIDEODRIVER', 'dummy')
os.environ.setdefault('SDL_AUDIODRIVER', 'dummy')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'isotopia'))

import pygame

clock = [0]
pygame.time.get_ticks = lambda: clock[0]          # a fake clock, so bots don't make the test wait

from app import App, BOARD  # noqa: E402
from view import VPOS, EPOS, HPOS, VX, VY  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else None
pygame.init()
window = pygame.display.set_mode((1200, 720))


def frame(app, n=1):
    for _ in range(n):
        clock[0] += 100
        app.update(clock[0])
        app.draw()
        app.present(window)


def click(app, x, y):
    sx, sy = app.offset
    pos = (int(sx + (x + 0.5) * app.scale), int(sy + (y + 0.5) * app.scale))
    app.handle(pygame.event.Event(pygame.MOUSEMOTION, pos=pos))
    frame(app)
    app.handle(pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=pos, button=1))
    app.handle(pygame.event.Event(pygame.MOUSEBUTTONUP, pos=pos, button=1))
    frame(app)


def press(app, prefix):
    hits = [r for r in app.ui.regions if r['fn'] and r['key'].startswith(prefix)]
    if not hits:
        return False
    r = hits[-1]
    click(app, r['x'] + r['w'] // 2, r['y'] + r['h'] // 2)
    return True


def click_spot(app, pick=None):
    kind, ids, _ = app.targets
    if not ids:
        return False
    i = pick if pick is not None else random.choice(ids)
    wx, wy = (VPOS if kind == 'vertex' else EPOS if kind == 'edge' else HPOS)[i]
    click(app, BOARD[0] + 3 + round(wx) - VX, BOARD[1] + 3 + round(wy) - VY)
    return True


def shot(app, name):
    if OUT:
        pygame.image.save(window, os.path.join(OUT, name))


def human_step(app, bombed):
    g = app.game
    if app.pass_to is not None:
        return press(app, 'ready')
    if app.tip:
        return press(app, 'tipok')
    if app.modal:
        k = app.modal['kind']
        if k == 'bomb':
            shot(app, 'iso-4-bomb-confirm.png')
            return press(app, 'drop')
        return press(app, 'b:Close') or press(app, 'b:OK') or press(app, 'b:Back')
    if not app.mine():
        return False
    if g.phase in ('setup_house', 'setup_road', 'cloud'):
        return click_spot(app)
    if g.phase == 'roll':
        return press(app, 'roll')
    if g.phase == 'main':
        if press(app, 'actbomb'):
            ids = app.targets[1]
            me = g.turn
            best = max(ids, key=lambda h: sum((1 if o != me else -3) for _, o, _ in g.bomb_damage(h)))
            click_spot(app, best)
            bombed.append(g.turn)
            return True
        for key in ('acttown', 'acthouse', 'actroad'):
            if press(app, key):
                if app.targets and app.targets[1]:
                    return click_spot(app)
                press(app, 'cancel')
        return press(app, 'end')
    return False


def play(seats, label):
    random.seed(label)
    app = App()
    frame(app, 3)
    shot(app, 'iso-1-title.png')
    press(app, 'b:Play on this screen')
    app.seats = seats
    frame(app)
    shot(app, f'iso-2-setup-{label}.png')
    press(app, 'start')
    bombed, shots, passes = [], 0, 0
    for _ in range(40000):
        g = app.game
        if g.winner is not None:
            break
        if app.pass_to is not None:
            passes += 1
            if passes == 2:
                shot(app, f'iso-pass-{label}.png')
        human_step(app, bombed)
        frame(app)
        if shots == 0 and g.round >= 3 and app.mine() and g.phase == 'main' and not app.tip:
            shots = 1
            shot(app, f'iso-3-game-{label}.png')
        if app.board.blast and shots < 2:
            frame(app, 9)
            shots = 2
            shot(app, f'iso-5-boom-{label}.png')
    frame(app, 30)
    shot(app, f'iso-6-end-{label}.png')
    g = app.game
    assert g.winner is not None, 'the game did not finish'
    return {'label': label, 'rounds': g.round, 'winner': g.players[g.winner].name,
            'points': [g.points(p.id) for p in g.players], 'bombs': sum(p.bombs for p in g.players),
            'craters': sum(h['crater'] for h in g.hexes), 'pass_screens': passes, 'human_bombs': len(bombed)}


solo = [{'name': 'Mara', 'type': 'human'}, {'name': 'Dr. Bloom', 'type': 'bot'}, {'name': 'Prof. Pike', 'type': 'bot'}, {'name': 'Mr. Ray', 'type': 'off'}]
duo = [{'name': 'Mara', 'type': 'human'}, {'name': 'Sam', 'type': 'human'}, {'name': 'Mrs. Volt', 'type': 'bot'}, {'name': 'Mr. Ray', 'type': 'off'}]
print(play(solo, 'solo'))
print(play(duo, 'duo'))


def bomb_check():
    """A person drops a bomb by hand: BOMB button, pick a land, confirm, and the land becomes a crater."""
    app = App()
    frame(app, 2)
    press(app, 'b:Play on this screen')
    app.seats = solo
    press(app, 'start')
    for _ in range(5000):
        g = app.game
        if g.phase == 'main' and app.mine():
            break
        human_step(app, [])
        frame(app)
    g = app.game
    me = g.turn
    g.players[me].hand['uranium'] = 5
    app.after_change()
    frame(app)
    while app.tip:
        press(app, 'tipok')
    assert press(app, 'actbomb'), 'BOMB button should be enabled with 5 uranium'
    target = max(app.targets[1], key=lambda h: sum(1 for _, o, _ in g.bomb_damage(h) if o != me) - 3 * sum(1 for _, o, _ in g.bomb_damage(h) if o == me))
    victims = g.bomb_damage(target)
    click_spot(app, target)
    assert app.modal and app.modal['kind'] == 'bomb', 'a confirm window should open'
    shot(app, 'iso-4-bomb-confirm.png')
    press(app, 'drop')
    frame(app, 12)
    shot(app, 'iso-5-boom-by-hand.png')
    assert g.hexes[target]['crater'] and g.players[me].bombs == 1 and g.players[me].hand['uranium'] == 0
    assert all(g.buildings[v] is None for v, _, _ in victims)
    g.players[me].hand['uranium'] = 5
    app.after_change()
    frame(app)
    assert not press(app, 'actbomb'), 'only one bomb each'
    return {'bomb_by_hand': 'ok', 'destroyed': len(victims)}


print(bomb_check())
