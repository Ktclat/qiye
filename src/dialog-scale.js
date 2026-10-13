// SPDX-License-Identifier: GPL-3.0-only
export function dialogMetrics(percent, width, height) {
  const scale = Math.max(75, Math.min(150, Number(percent) || 100)) / 100;
  return { scale, width: Math.max(1, width - 24) / scale, height: Math.max(1, height - 24) / scale };
}

export function applyDialogScale(dialog, percent, viewport = globalThis, windowSize = 100) {
  const metrics = dialogMetrics(percent, viewport.innerWidth, viewport.innerHeight);
  dialog.style.setProperty('--dialog-scale', metrics.scale);
  dialog.style.setProperty('--dialog-width', `${metrics.width}px`);
  dialog.style.setProperty('--dialog-height', `${metrics.height}px`);
  const size = Math.max(75, Math.min(125, Number(windowSize) || 100)) / 100;
  for (const [name, value] of Object.entries({ 'window-width':1060, 'window-height':690, 'settings-width':920, 'drawer-width':580, 'form-width':700 })) {
    dialog.style.setProperty(`--${name}`, `${value * size}px`);
  }
  dialog.classList.toggle('compact-dialog', metrics.width < 620);
  return metrics;
}
