import test from 'node:test';
import assert from 'node:assert/strict';
import { demandRenderer } from '../src/sceneRendering';
import { sceneVisibility } from '../src/sceneVisibility';

function fixture(hidden = false) {
  const page = Object.assign(new EventTarget(), { hidden }), host = new EventTarget();
  const pending = new Map<number, FrameRequestCallback>();
  const keys = new Set(['w']);
  let serial = 0, renders = 0, pointer = true;
  const loop = demandRenderer(() => { renders++; return keys.size > 0; }, {
    request(callback) { pending.set(++serial, callback); return serial; },
    cancel(id) { pending.delete(id); }
  }, !hidden);
  const visibility = sceneVisibility(page, host, visible => {
    if (!visible) { keys.clear(); pointer = false; }
    loop.setVisible(visible);
  });
  return {
    page, host, keys, loop, visibility, pending,
    get renders() { return renders; },
    get pointer() { return pointer; },
    native(detail: unknown) { host.dispatchEvent(new CustomEvent('apartment-render-visibility', { detail })); },
    pageHidden(value: boolean) { page.hidden = value; page.dispatchEvent(new Event('visibilitychange')); },
    run() {
      const next = pending.entries().next().value;
      assert.ok(next, 'a frame must have been requested');
      pending.delete(next[0]); next[1](100000);
    },
    dispose() { visibility.dispose(); loop.dispose(); }
  };
}

test('page and native visibility both gate demand frames; resuming wakes once and clears held input', () => {
  const f = fixture();
  f.run();
  assert.equal(f.pending.size, 1, 'walking requests another frame');
  f.native({ visible: false });
  assert.equal(f.visibility.visible, false);
  assert.equal(f.keys.size, 0);
  assert.equal(f.pointer, false);
  assert.equal(f.pending.size, 0);
  f.loop.invalidate(); f.loop.invalidate();
  assert.equal(f.pending.size, 0, 'hidden edits and texture arrivals cannot draw');
  assert.equal(f.renders, 1);
  f.pageHidden(true); f.native({ visible: true });
  assert.equal(f.pending.size, 0, 'native visibility cannot override a hidden page');
  f.native({ visible: false }); f.pageHidden(false);
  assert.equal(f.pending.size, 0, 'page visibility cannot override native occlusion');
  f.native({ visible: true }); f.native({ visible: true });
  assert.equal(f.visibility.visible, true);
  assert.equal(f.pending.size, 1);
  f.run();
  assert.equal(f.renders, 2);
  assert.equal(f.pending.size, 0, 'cleared walking input does not resume movement');
  f.native({ visible: true }); f.pageHidden(false);
  assert.equal(f.pending.size, 0, 'duplicate visible notifications do not redraw');
  f.pageHidden(true); f.loop.invalidate();
  assert.equal(f.pending.size, 0);
  f.pageHidden(false);
  assert.equal(f.pending.size, 1, 'existing page-only visibility resumes');
  f.dispose();
});

test('a hidden initial page stays suspended; malformed native events are ignored', () => {
  const f = fixture(true);
  assert.equal(f.visibility.visible, false);
  assert.equal(f.pending.size, 0);
  for (const detail of [undefined, null, false, 0, 'visible', [], {}, { visible: 'true' }, { visible: 1 }]) {
    assert.doesNotThrow(() => f.native(detail));
  }
  f.host.dispatchEvent(new Event('apartment-render-visibility'));
  assert.equal(f.pending.size, 0);
  f.pageHidden(false); f.run();
  assert.equal(f.renders, 1, 'malformed events never overwrite native visibility');
  f.native({ visible: false }); f.native({ visible: 'true' });
  assert.equal(f.visibility.visible, false);
  assert.equal(f.pending.size, 0);
  f.dispose();
});

test('teardown removes both visibility listeners and cancels queued movement frames', () => {
  const f = fixture();
  f.run();
  assert.equal(f.pending.size, 1);
  f.dispose();
  f.native({ visible: false }); f.pageHidden(true);
  assert.equal(f.visibility.visible, true, 'removed listeners do not update state');
  f.native({ visible: true }); f.pageHidden(false); f.loop.invalidate();
  assert.equal(f.pending.size, 0);
  assert.equal(f.renders, 1);
});
