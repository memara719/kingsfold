// One table: seats, the lobby, and the game once it starts.
// The Node server runs one per room; on the website the host's browser runs one for their friends.
// Players are "clients", any object the owner can send to: send(client, message).
// Every player only ever receives their own view of the game, so nobody sees another player's cards.

import { viewFor, HOUSE_IDS, HOUSES } from './game.js';
import { Host } from './host.js';

export const MAX_SEATS = 6;
const BOT_NAMES = ['Sir Bramble', 'Lady Wren', 'Old Tom', 'Mistress Fen', 'Brother Ash', 'Goodwife Moll'];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rand = n => { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] % n; };
export const newToken = () => globalThis.crypto.randomUUID();
export const newCode = () => Array.from({ length: 4 }, () => LETTERS[rand(LETTERS.length)]).join('');
export const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 14) || 'Traveler';

export class Table {
  constructor(code, send) {
    this.code = code;
    this.send = send;
    this.seats = [];          // { name, house, bot, token, client }
    this.hostToken = null;
    this.host = null;
    this.lastActive = Date.now();
    this.onChange = () => {};
  }

  // what the website's host saves so a reload can pick the table back up
  toJSON() {
    return { code: this.code, hostToken: this.hostToken, seats: this.seats.map(({ name, house, bot, token }) => ({ name, house, bot, token })), state: this.host ? this.host.state : null };
  }
  static restore(saved, send) {
    const t = new Table(saved.code, send);
    t.hostToken = saved.hostToken;
    t.seats = saved.seats.map(s => ({ ...s, client: null }));
    if (saved.state) t.startHost(saved.state);
    return t;
  }

  freeHouse(want) {
    const used = new Set(this.seats.map(s => s.house));
    return want && HOUSES[want] && !used.has(want) ? want : HOUSE_IDS.find(h => !used.has(h));
  }
  seatOf(client) { return this.seats.findIndex(s => s.client === client); }
  isOpen() { const h = this.seats.find(s => s.token === this.hostToken); return !this.host && !!h && !!h.client && this.seats.length < MAX_SEATS; }
  title() { const h = this.seats.find(s => s.token === this.hostToken); return (h ? h.name : 'A') + "'s table"; }

  lobbyInfo() {
    return {
      t: 'room', code: this.code, started: !!this.host,
      seats: this.seats.map((s, i) => ({ seat: i, name: s.name, house: s.house, bot: s.bot, connected: s.bot || !!s.client, host: s.token === this.hostToken })),
    };
  }
  broadcastRoom() {
    const info = this.lobbyInfo();
    this.seats.forEach((s, i) => { if (s.client) this.send(s.client, { ...info, you: i, isHost: s.token === this.hostToken }); });
    this.onChange();
  }
  broadcastState() {
    if (!this.host) return;
    const remaining = this.host.remaining();
    this.seats.forEach((s, i) => { if (s.client) this.send(s.client, { t: 'state', view: viewFor(this.host.state, i), remaining }); });
    this.onChange();
  }
  startHost(state) {
    this.host = new Host({
      state,
      players: state ? undefined : this.seats.map(s => ({ name: s.name, house: s.house, bot: s.bot })),
      seed: rand(2 ** 31),
      onChange: () => this.broadcastState(),
    });
    this.seats.forEach((s, i) => { if (!s.bot && !s.client) this.host.setAway(i, true); });
  }

  // create: the first player sits down and becomes the host
  create(client, { name, house }) {
    const token = newToken();
    this.hostToken = token;
    this.seats.push({ name: cleanName(name), house: this.freeHouse(house) || 'lions', bot: false, token, client });
    this.send(client, { t: 'token', token, code: this.code });
    this.broadcastRoom();
  }

  join(client, msg) {
    const back = msg.token && this.seats.find(s => s.token === msg.token && !s.bot);
    if (back) {
      if (back.client && back.client !== client) this.send(back.client, { t: 'error', msg: 'You joined from another window.', fatal: true });
      back.client = client;
      if (this.host) this.host.setAway(this.seats.indexOf(back), false);
      this.send(client, { t: 'token', token: back.token, code: this.code });
      this.broadcastRoom(); this.broadcastState();
      return;
    }
    if (this.host) return this.send(client, { t: 'error', msg: 'That game has already started.', fatal: true });
    if (this.seats.length >= MAX_SEATS) return this.send(client, { t: 'error', msg: 'That table is full (6 players).', fatal: true });
    const token = newToken();
    this.seats.push({ name: cleanName(msg.name), house: this.freeHouse(msg.house), bot: false, token, client });
    this.send(client, { t: 'token', token, code: this.code });
    this.broadcastRoom();
  }

  handle(client, msg) {
    this.lastActive = Date.now();
    const seat = this.seatOf(client);
    if (seat < 0) return;
    const me = this.seats[seat];
    const isHost = me.token === this.hostToken;
    switch (msg.t) {
      case 'house': {
        if (this.host || !HOUSES[msg.house]) return;
        if (this.seats.some((s, i) => i !== seat && s.house === msg.house)) return this.send(client, { t: 'error', msg: 'Someone already picked that house.' });
        me.house = msg.house;
        return this.broadcastRoom();
      }
      case 'addBot': {
        if (!isHost || this.host || this.seats.length >= MAX_SEATS) return;
        const used = new Set(this.seats.map(s => s.name));
        this.seats.push({ name: BOT_NAMES.find(n => !used.has(n)) || 'Squire', house: this.freeHouse(), bot: true, token: newToken(), client: null });
        return this.broadcastRoom();
      }
      case 'removeSeat': {
        if (!isHost || this.host) return;
        const i = msg.seat;
        if (!Number.isInteger(i) || !this.seats[i] || i === seat) return;
        const gone = this.seats.splice(i, 1)[0];
        if (gone.client) this.send(gone.client, { t: 'error', msg: 'The host removed you from the table.', fatal: true });
        return this.broadcastRoom();
      }
      case 'start': {
        if (!isHost || this.host) return;
        if (this.seats.length < 2) return this.send(client, { t: 'error', msg: 'You need at least 2 players. Add a bot or invite a friend.' });
        // shuffle the seating so the host does not always go first
        for (let i = this.seats.length - 1; i > 0; i--) { const j = rand(i + 1); [this.seats[i], this.seats[j]] = [this.seats[j], this.seats[i]]; }
        this.startHost(null);
        this.broadcastRoom(); this.broadcastState();
        return;
      }
      case 'act': {
        if (!this.host) return;
        const err = this.host.act(seat, msg.action);
        if (err) this.send(client, { t: 'error', msg: err });
        return;
      }
      case 'rematch': {
        if (!isHost || !this.host || this.host.state.phase !== 'over') return;
        this.host.stop();
        this.host = null;
        this.seats = this.seats.filter(s => s.bot || s.client);
        return this.broadcastRoom();
      }
      case 'leave': {
        // leaving for good from the lobby frees the seat at once
        if (this.host) return this.drop(client);
        this.seats.splice(seat, 1);
        if (me.token === this.hostToken) { const next = this.seats.find(s => !s.bot); this.hostToken = next ? next.token : null; }
        return this.broadcastRoom();
      }
    }
  }

  // a player's connection went away; they keep their seat and can come back
  drop(client) {
    const seat = this.seatOf(client);
    if (seat < 0) return;
    const s = this.seats[seat];
    s.client = null;
    if (this.host) this.host.setAway(seat, true);
    else {
      setTimeout(() => {
        const i = this.seats.indexOf(s);
        if (i >= 0 && !s.client && !this.host) {
          this.seats.splice(i, 1);
          if (s.token === this.hostToken) { const next = this.seats.find(x => !x.bot); this.hostToken = next ? next.token : null; }
          this.broadcastRoom();
        }
      }, 30000);
    }
    this.broadcastRoom();
  }

  stop() { if (this.host) this.host.stop(); }
}
