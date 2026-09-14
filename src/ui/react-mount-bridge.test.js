/** @jest-environment jsdom */

require('./react-mount-bridge');

function resetGlobals() {
  delete window.mountReactPrTable;
  delete window.updateReactPrTable;
}

describe('ReactMountBridge', () => {
  beforeEach(() => {
    resetGlobals();
  });

  test('given no container, when mount is called, then it logs an error and returns false without throwing', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = window.ReactMountBridge.mount(null, {}, {});
    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot mount'));
    errorSpy.mockRestore();
  });

  test('given a container but window.mountReactPrTable is not defined (react-app.jsx not loaded yet), when mount is called, then it logs an error and returns false', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    const result = window.ReactMountBridge.mount(container, {}, {});
    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('mountReactPrTable not available'));
    errorSpy.mockRestore();
  });

  test('given a container and window.mountReactPrTable is available, when mount is called, then it clears the container, calls mountReactPrTable with the expected shape, and returns true', () => {
    const container = document.createElement('div');
    container.innerHTML = '<span>stale vanilla markup</span>';
    const mountReactPrTable = jest.fn(() => ({ unmount: jest.fn() }));
    window.mountReactPrTable = mountReactPrTable;

    const onCheckboxChange = jest.fn();
    const onAckAction = jest.fn();
    const onApplyLabel = jest.fn();
    const payload = { byPrNumber: {} };
    const result = window.ReactMountBridge.mount(
      container,
      { payload, selectedRepo: 'owner/repo', visiblePrNumbers: ['1'] },
      { onCheckboxChange, onAckAction, onApplyLabel },
    );

    expect(result).toBe(true);
    expect(container.innerHTML).toBe('');
    expect(mountReactPrTable).toHaveBeenCalledWith(container, {
      initialPayload: payload,
      selectedRepo: 'owner/repo',
      visiblePrNumbers: ['1'],
      onCheckboxChange,
      onAckAction,
      onApplyLabel,
    });
    expect(window.ReactMountBridge.isMounted()).toBe(true);
  });

  test('given mountReactPrTable throws, when mount is called, then the error is caught, logged, and false is returned', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    window.mountReactPrTable = () => {
      throw new Error('boom');
    };

    const result = window.ReactMountBridge.mount(container, {}, {});

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('[ReactBridge] Error mounting React:', expect.any(Error));
    errorSpy.mockRestore();
  });

  test('given nothing is mounted, when update is called, then it warns and does not throw', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.ReactMountBridge.update({}, 'owner/repo');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot update'));
    warnSpy.mockRestore();
  });

  test('given window.updateReactPrTable was already set before mount, when update is called after mounting, then it forwards payload/repo/visiblePrNumbers to that callback', () => {
    // mount() only snapshots window.updateReactPrTable at mount time (see
    // mountReactTable's `if (global.updateReactPrTable ...)` check) - it
    // must already be assigned (as react-app.jsx's own module-load side
    // effect does) before mount() runs, not after.
    const container = document.createElement('div');
    window.mountReactPrTable = jest.fn(() => ({ unmount: jest.fn() }));
    const updateReactPrTable = jest.fn();
    window.updateReactPrTable = updateReactPrTable;

    window.ReactMountBridge.mount(container, {}, {});

    const payload = { byPrNumber: { 1: {} } };
    window.ReactMountBridge.update(payload, 'owner/repo', ['1']);

    expect(updateReactPrTable).toHaveBeenCalledWith(payload, 'owner/repo', ['1']);
  });

  test('given the stored update callback throws, when update is called, then the error is caught and logged, not propagated', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    window.mountReactPrTable = jest.fn(() => ({ unmount: jest.fn() }));
    window.updateReactPrTable = () => {
      throw new Error('boom');
    };
    window.ReactMountBridge.mount(container, {}, {});

    expect(() => window.ReactMountBridge.update({}, 'owner/repo')).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith('[ReactBridge] Error updating React:', expect.any(Error));
    errorSpy.mockRestore();
  });

  test('given a mounted root, when unmount is called, then it unmounts and isMounted() becomes false', () => {
    const container = document.createElement('div');
    const unmount = jest.fn();
    window.mountReactPrTable = jest.fn(() => ({ unmount }));
    window.ReactMountBridge.mount(container, {}, {});
    expect(window.ReactMountBridge.isMounted()).toBe(true);

    window.ReactMountBridge.unmount();

    expect(unmount).toHaveBeenCalled();
    expect(window.ReactMountBridge.isMounted()).toBe(false);
  });

  test('given nothing is mounted, when unmount is called, then it is a no-op that does not throw', () => {
    expect(() => window.ReactMountBridge.unmount()).not.toThrow();
    expect(window.ReactMountBridge.isMounted()).toBe(false);
  });

  test('given the root\'s own unmount() throws, when unmount is called, then the error is caught and logged, not propagated', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    window.mountReactPrTable = jest.fn(() => ({
      unmount: () => {
        throw new Error('boom');
      },
    }));
    window.ReactMountBridge.mount(container, {}, {});

    expect(() => window.ReactMountBridge.unmount()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith('[ReactBridge] Error unmounting React:', expect.any(Error));
    errorSpy.mockRestore();
  });
});
