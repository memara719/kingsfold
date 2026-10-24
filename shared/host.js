// Runs one game: applies actions, drives bots, and enforces turn timers.
// The Node server wraps one Host per room; the browser uses one directly for games against bots.

import { createGame, apply, pendingPlayers } from './game.js';
import { botAction } from './bot.js';

export const TIMERS = { setupVillage: 30000, setupRoad: 30000, roll: 30000, main: 90000, discard: 30000, robber: 30000, steal: 20000 };

export class Host {
  constructor({ players, seed, onChange, botDelay = 700, timers = true }) {
    this.state = createGame({ players, seed });
    this.onChange = onChange || (() => {});
    this.botDelay = botDelay;
    this.timers = timers;
    this.away = new Set();        // seats whose player is disconnected
    this.deadline = 0;
    this.phaseKey = '';
    this.botTimer = null;
    this.deadlineTimer = null;
    this.stopped = false;
    this.refresh();
  }

  act(pid, action) {
    if (this.stopped) return 'The game has ended.';
    const err = apply(this.state, pid, action);
    if (!err) this.refresh();
    return err;
  }

  setAway(pid, away) {
    if (away) this.away.add(pid); else this.away.delete(pid);
    this.schedule();
  }

  remaining() { return this.deadline ? Math.max(0, this.deadline - Date.now()) : 0; }

  stop() {
    this.stopped = true;
    clearTimeout(this.botTimer); clearTimeout(this.deadlineTimer);
  }

  refresh() {
    const s = this.state;
    const key = [s.phase, s.turn, s.turnCount, s.setup && s.setup.i, Object.keys(s.discards).join('.')].join('|');
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      const ms = TIMERS[s.phase];
      this.deadline = this.timers && ms ? Date.now() + ms : 0;
    }
    this.schedule();
    this.onChange(this);
  }

  // Bots act one step at a time so humans can follow along.
  schedule() {
    clearTimeout(this.botTimer); clearTimeout(this.deadlineTimer);
    const s = this.state;
    if (this.stopped || s.phase === 'over') return;
    const auto = pid => s.players[pid].bot || this.away.has(pid);
    const actor = this.nextBot(auto);
    if (actor !== null) {
      const fast = !s.players[actor].bot;
      this.botTimer = setTimeout(() => this.runBot(actor), fast ? Math.min(this.botDelay, 400) : this.botDelay);
    }
    if (this.deadline) this.deadlineTimer = setTimeout(() => this.timeout(), this.remaining() + 50);
  }

  nextBot(auto) {
    const s = this.state;
    for (const p of s.players) if (auto(p.id) && p.picks > 0) return p.id;
    if (s.offer && s.phase === 'main')
      for (const p of s.players) if (p.bot && p.id !== s.offer.from && !s.offer.declined.includes(p.id)) return p.id;
    for (const pid of pendingPlayers(s)) if (auto(pid)) return pid;
    return null;
  }

  runBot(pid) {
    if (this.stopped) return;
    const s = this.state;
    let action = botAction(s, pid);
    if (s.players[pid].bot === false && s.phase === 'main' && s.turn === pid && action && action.type !== 'pick') action = { type: 'endTurn' };
    if (!action) return this.schedule();
    const err = apply(s, pid, action);
    if (err) {
      // never let a confused bot stall the table
      const fallback = s.phase === 'main' && s.turn === pid ? { type: 'endTurn' }
        : s.offer && s.offer.from !== pid ? { type: 'declineOffer', id: s.offer.id } : null;
      if (!fallback || apply(s, pid, fallback)) { this.stop(); throw new Error('Bot stuck: ' + err + ' ' + JSON.stringify(action)); }
    }
    this.refresh();
  }

  // When the sand runs out, the King's steward plays for whoever is slow.
  timeout() {
    const s = this.state;
    if (this.stopped || s.phase === 'over') return;
    for (const pid of pendingPlayers(s)) {
      let action = s.phase === 'main' ? { type: 'endTurn' } : botAction(s, pid);
      if (s.players[pid].picks > 0 && s.phase !== 'main') action = botAction(s, pid);
      if (action) apply(s, pid, action);
    }
    this.phaseKey = '';
    this.refresh();
  }
}
