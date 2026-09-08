/** Serialize async state transitions within a worker lifetime. Persistent state
 * always comes from Chrome storage; this queue only coordinates live events. */
export function createQueue() {
  let tail = Promise.resolve();
  return (operation) => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
}
