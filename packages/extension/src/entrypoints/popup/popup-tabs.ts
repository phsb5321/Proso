export type PopupTabId = 'player' | 'tools' | 'queue';

export interface PopupTabEntry {
  readonly tab: HTMLButtonElement;
  readonly panel: HTMLElement;
}

export type PopupTabMap = Record<PopupTabId, PopupTabEntry>;

const TAB_ORDER: readonly PopupTabId[] = ['player', 'tools', 'queue'];

export interface PopupTabController {
  activate(tabId: PopupTabId, focus?: boolean): void;
}

export function bindPopupTabs(tabMap: PopupTabMap): PopupTabController {
  const activate = (tabId: PopupTabId, focus = false): void => {
    for (const id of TAB_ORDER) {
      const entry = tabMap[id];
      const active = id === tabId;
      entry.tab.classList.toggle('proso-popup__tab--active', active);
      entry.tab.setAttribute('aria-selected', String(active));
      entry.tab.tabIndex = active ? 0 : -1;
      entry.panel.classList.toggle('proso-popup__panel--active', active);
      entry.panel.hidden = !active;
    }

    if (focus) tabMap[tabId].tab.focus();
  };

  for (const id of TAB_ORDER) {
    const { tab } = tabMap[id];
    tab.addEventListener('click', () => activate(id));
    tab.addEventListener('keydown', (event) => {
      let target: PopupTabId | undefined;
      const index = TAB_ORDER.indexOf(id);
      switch (event.key) {
        case 'ArrowRight':
          target = TAB_ORDER[(index + 1) % TAB_ORDER.length];
          break;
        case 'ArrowLeft':
          target = TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length];
          break;
        case 'Home':
          target = TAB_ORDER[0];
          break;
        case 'End':
          target = TAB_ORDER[TAB_ORDER.length - 1];
          break;
      }
      if (!target) return;
      event.preventDefault();
      activate(target, true);
    });
  }

  const selected = TAB_ORDER.find((id) => tabMap[id].tab.getAttribute('aria-selected') === 'true');
  activate(selected ?? 'player');
  return { activate };
}
