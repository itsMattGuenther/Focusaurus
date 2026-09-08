import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../src/background/queue.js';

test('concurrent read-modify-write tasks serialize and a failed task does not strand later work', async () => {
  const queue = createQueue();
  let count = 0;
  const jobs = Array.from({ length: 30 }, () => queue(async () => {
    const old = count;
    await new Promise((resolve) => setImmediate(resolve));
    count = old + 1;
  }));
  const failure = queue(() => { throw Error('storage write failed'); });
  await assert.rejects(failure, /storage write failed/);
  await queue(() => { count += 1; });
  await Promise.all(jobs);
  assert.equal(count, 31);
});
