// Runs an async task one at a time: a call while it's running doesn't start
// a second run alongside it - two at once could finish out of order - but
// asks for one more run after it, however many calls came in meanwhile.
// Every call's promise settles when the runs it waited on are done.
export const createSerialRunner = (task: () => Promise<void>): (() => Promise<void>) => {
  let running: Promise<void> | null = null;
  let runAgain = false;

  return () => {
    if (running) {
      runAgain = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          runAgain = false;
          await task();
        } while (runAgain);
      } finally {
        running = null;
        runAgain = false;
      }
    })();
    return running;
  };
};
