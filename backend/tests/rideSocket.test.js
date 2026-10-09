'use strict';

/**
 * Ride socket handlers.
 *
 * These handlers are the whole of Ride Mode's presence and signaling layer, and
 * they are almost entirely untested — which is how a module-scope helper could
 * reference an out-of-scope `socket` and take down every event without a single
 * failing test. The fake socket below is deliberately strict: `touchRideActivity`
 * needs the socket id, so anything that cannot resolve it throws.
 */

const path = require('path');

/**
 * `ride.service` is mocked rather than stubbed by patching `Module._load`,
 * because Jest runs modules in its own registry and never goes through Node's
 * loader — so a patched `_load` silently does nothing and the real service (and a
 * real database round trip) runs instead.
 */
const calls = { touchActivity: [], leave: [], isActiveParticipant: [] };

jest.mock('../src/services/ride.service', () => ({
  isActiveParticipant: jest.fn(async (rideId, userId) => {
    calls.isActiveParticipant.push([rideId, userId]);
    return true;
  }),
  touchActivity: jest.fn(async (rideId) => {
    calls.touchActivity.push(rideId);
  }),
  leave: jest.fn(async (rideId, userId) => {
    calls.leave.push([rideId, userId]);
    return { left: true };
  }),
}));

/** Fresh handler module + fresh call log for each test. */
function loadHandlers() {
  calls.isActiveParticipant.length = 0;
  calls.touchActivity.length = 0;
  calls.leave.length = 0;
  jest.resetModules();
  // Re-require after resetModules so the handler binds to the fresh mock, and
  // return a handle to drive the shared mock's behaviour.
  const register = require('../src/sockets/ride.handlers.js');
  return register;
}

/**
 * A minimal but faithful socket double.
 *
 * Note there is deliberately NO global `socket` binding here: `node -e` scripts
 * and this file would otherwise leak a lexical `socket` into the module scope and
 * mask exactly the bug under test.
 */
function fakeSocket(id = 'socket-1', userId = '11111111-1111-4111-8111-111111111111') {
  const listeners = {};
  return {
    id,
    data: { userId, username: 'rider', rides: new Set() },
    rooms: new Set(),
    handlers: listeners,
    on(event, fn) {
      listeners[event] = fn;
    },
    emit() {},
    to() {
      return { emit() {} };
    },
    join(room) {
      this.rooms.add(room);
      return Promise.resolve();
    },
    leave(room) {
      this.rooms.delete(room);
      return Promise.resolve();
    },
    async fire(event, payload) {
      let ack;
      await listeners[event](payload, (value) => {
        ack = value;
      });
      return ack;
    },
  };
}

function fakeIO(sockets = []) {
  return {
    in() {
      return {
        fetchSockets: async () => sockets,
        socketsLeave: async () => {},
      };
    },
    to() {
      return { emit() {} };
    },
  };
}

const RIDE = '22222222-2222-4222-8222-222222222222';

describe('ride socket handlers', () => {
  let register;

  beforeEach(() => {
    register = loadHandlers();
  });

  describe('ride:join', () => {
    it('acknowledges success and returns the peer list', async () => {
      const socket = fakeSocket();
      register(fakeIO(), socket);

      const ack = await socket.fire('ride:join', { rideId: RIDE });

      expect(ack.ok).toBe(true);
      expect(ack.rideId).toBe(RIDE);
      expect(Array.isArray(ack.peers)).toBe(true);
    });

    it('puts the socket in the ride room', async () => {
      const socket = fakeSocket();
      register(fakeIO(), socket);

      await socket.fire('ride:join', { rideId: RIDE });

      expect(socket.rooms.has(`ride:${RIDE}`)).toBe(true);
      expect(socket.data.rides.has(RIDE)).toBe(true);
    });

    it('touches ride activity, so the idle sweeper does not end a live ride', async () => {
      const socket = fakeSocket();
      register(fakeIO(), socket);

      await socket.fire('ride:join', { rideId: RIDE });

      expect(calls.touchActivity).toContain(RIDE);
    });

    // This is the regression test for the bug that broke every ride socket event:
    // `touchRideActivity` referenced a `socket` that did not exist at module
    // scope, so it threw *after* `socket.join()` had already run. The client was
    // told the join failed while being silently subscribed to the room, and the
    // peer-joined broadcast never fired.
    it('does not leave the socket half-joined when activity tracking runs', async () => {
      const socket = fakeSocket();
      register(fakeIO(), socket);

      const ack = await socket.fire('ride:join', { rideId: RIDE });

      // If the ack reports failure the socket must NOT be in the room, and vice
      // versa. The old bug produced ok:false *and* a joined room.
      if (ack.ok === false) {
        expect(socket.rooms.has(`ride:${RIDE}`)).toBe(false);
      } else {
        expect(socket.rooms.has(`ride:${RIDE}`)).toBe(true);
      }
      expect(calls.touchActivity).toHaveLength(1);
    });

    it('refuses a rider who is not an active participant', async () => {
      register = loadHandlers();
      // Re-required *after* resetModules so this is the very mock instance the
      // freshly-loaded handler captured, not the pre-reset one.
      require('../src/services/ride.service').isActiveParticipant.mockResolvedValueOnce(false);
      const socket = fakeSocket();
      register(fakeIO(), socket);

      const ack = await socket.fire('ride:join', { rideId: RIDE });

      expect(ack.ok).toBe(false);
      expect(ack.error.code).toBe('NOT_A_PARTICIPANT');
      expect(socket.rooms.size).toBe(0);
      expect(calls.touchActivity).toHaveLength(0);
    });

    it('rejects a non-uuid ride id without joining', async () => {
      const socket = fakeSocket();
      register(fakeIO(), socket);

      const ack = await socket.fire('ride:join', { rideId: 'not-a-uuid' });

      expect(ack.ok).toBe(false);
      expect(socket.rooms.size).toBe(0);
    });
  });

  describe('ride:leave', () => {
    it('acknowledges success and actually leaves the room', async () => {
      const socket = fakeSocket();
      register(fakeIO(), socket);

      await socket.fire('ride:join', { rideId: RIDE });
      const ack = await socket.fire('ride:leave', { rideId: RIDE });

      expect(ack.ok).toBe(true);
      expect(socket.rooms.has(`ride:${RIDE}`)).toBe(false);
      expect(socket.data.rides.has(RIDE)).toBe(false);
    });

    it('is a no-op for a ride the socket never joined', async () => {
      const socket = fakeSocket();
      register(fakeIO(), socket);

      const ack = await socket.fire('ride:leave', { rideId: RIDE });

      expect(ack.ok).toBe(true);
      expect(calls.leave).toHaveLength(0);
    });
  });

  describe('disconnect handling', () => {
    // A crashed tab never sends `ride:leave`, so the participant row stayed
    // `joined` and permanently consumed a ride slot.
    it('releases the participant row when the last tab disconnects', async () => {
      const socket = fakeSocket();
      register(fakeIO(), socket);
      await socket.fire('ride:join', { rideId: RIDE });

      await socket.fire('disconnecting');

      expect(calls.leave).toEqual([[RIDE, socket.data.userId]]);
    });

    it('does not eject the rider when another of their tabs is still in the ride', async () => {
      const socket = fakeSocket('socket-1', 'user-a');
      const otherTab = { id: 'socket-2', data: { userId: 'user-a' } };
      register(fakeIO([otherTab]), socket);
      await socket.fire('ride:join', { rideId: RIDE });

      await socket.fire('disconnecting');

      expect(calls.leave).toHaveLength(0);
    });

    it('releases when the remaining socket belongs to a different rider', async () => {
      const socket = fakeSocket('socket-1', 'user-a');
      const otherRider = { id: 'socket-2', data: { userId: 'user-b' } };
      register(fakeIO([otherRider]), socket);
      await socket.fire('ride:join', { rideId: RIDE });

      await socket.fire('disconnecting');

      expect(calls.leave).toHaveLength(1);
    });
  });
});