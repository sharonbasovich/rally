import { describe, expect, it } from 'vitest';
import { Game } from '@rally/shared';
import { Network } from '../apps/client/src/network';
import type { Snapshot } from '@rally/shared/protocol';
import { CONFIG } from '@rally/shared/config';

function snapshot(x: number, time: number): { time: number; data: Snapshot } {
  const game = new Game();
  const ball = game.balls[0];
  ball.x = x;
  ball.vx = 1;
  ball.trail = [{ x, y: ball.y, z: ball.z }];
  return {
    time,
    data: {
      code: 'ABCDEF',mode:'multiplayer',
      phase: 'playing',
      countdown: 0,
      reason: '',
      players: [
        { side: 0, connected: true, ready: true, replay: false },
        { side: 1, connected: true, ready: true, replay: false },
      ],
      game,
      serverTime: time,
    },
  };
}

describe('network render timeline', () => {
  it('interpolates through paddle-contact snapshots instead of snapping', () => {
    const network = new Network();
    const first = snapshot(0, 1000);
    const second = snapshot(0.12, 1060);
    network.latest = second.data;
    network.lastReceived = second.time;
    network.buffer = [first, second];

    const game = network.sample(1090);

    const expected=0.12*(1090-CONFIG.NETWORK_INTERPOLATION_MS-1000)/(1060-1000);
    expect(game?.balls[0].x).toBeCloseTo(expected, 4);
    expect(network.latest.game.balls[0].x).toBe(0.12);
  });

  it('holds the last state across a packet gap', () => {
    const network = new Network();
    const latest = snapshot(2, 1000);
    network.latest = latest.data;
    network.lastReceived = latest.time;
    network.buffer = [latest];

    const game = network.sample(1300);

    expect(game?.balls[0].x).toBeCloseTo(2, 4);
  });
});
