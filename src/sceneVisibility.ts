/** Native occlusion and page visibility must both allow rendering. */
export function sceneVisibility(page: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>,
  host: Pick<Window, 'addEventListener' | 'removeEventListener'>, changed: (visible: boolean) => void) {
  let nativeVisible = true, visible = !page.hidden;
  const sync = () => {
    const next = nativeVisible && !page.hidden;
    if (next === visible) return;
    visible = next;
    changed(visible);
  };
  const native = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== 'object' || !('visible' in detail) || typeof detail.visible !== 'boolean') return;
    nativeVisible = detail.visible;
    sync();
  };
  page.addEventListener('visibilitychange', sync);
  host.addEventListener('apartment-render-visibility', native);
  changed(visible);
  return {
    get visible() { return visible; },
    dispose() {
      page.removeEventListener('visibilitychange', sync);
      host.removeEventListener('apartment-render-visibility', native);
    }
  };
}
