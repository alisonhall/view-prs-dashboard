const { createViewPrsProgressHelpers } = require("./view-prs-progress-helpers");

describe("view-prs progress helpers", () => {
  const setup = () => {
    const onChange = jest.fn();
    const helpers = createViewPrsProgressHelpers({ onChange, now: () => "2026-11-05T12:00:00Z" });
    return { onChange, ...helpers };
  };

  test("a task is listed from its start to its finish, with what it's counting; each change pushes a frame", () => {
    const { onChange, startTask, getProgressTasks } = setup();
    const task = startTask({ kind: "olderMerged", origin: "you", repos: "acme/web" });
    expect(getProgressTasks()).toEqual([
      { id: task.id, kind: "olderMerged", origin: "you", repos: ["acme/web"], unit: "PR", done: 0, total: null, startedAt: "2026-11-05T12:00:00Z" },
    ]);

    task.setTotal(30);
    task.advance();
    task.advance(2);
    expect(getProgressTasks()[0]).toEqual(expect.objectContaining({ done: 3, total: 30 }));

    task.finish();
    expect(getProgressTasks()).toEqual([]);
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  test("several at once, oldest first; a finished task's handle does nothing", () => {
    const { onChange, startTask, getProgressTasks } = setup();
    const first = startTask({ kind: "autoRefresh", repos: ["a/1"] });
    const second = startTask({ kind: "quickCheck", repos: ["a/2"], unit: "repo", total: 2 });
    expect(getProgressTasks().map((task) => task.kind)).toEqual(["autoRefresh", "quickCheck"]);
    expect(first.id).not.toBe(second.id);

    first.finish();
    const changes = onChange.mock.calls.length;
    first.advance();
    first.setTotal(5);
    first.finish();
    expect(onChange).toHaveBeenCalledTimes(changes);
    expect(getProgressTasks()).toEqual([expect.objectContaining({ kind: "quickCheck", origin: "background" })]);
  });

  test("countFinishedPrs moves a task on per PR a script run finishes; a failing onChange never fails the work", () => {
    const { startTask, getProgressTasks, countFinishedPrs } = createViewPrsProgressHelpers({
      onChange: () => {
        throw new Error("no listeners");
      },
    });
    const task = startTask({ kind: "runScript", origin: "you" });
    const tracker = countFinishedPrs(task);
    tracker.onEnd("12");
    tracker.onEnd("13");
    expect(getProgressTasks()[0].done).toBe(2);
    expect(countFinishedPrs(null).onEnd).not.toThrow();
  });
});
