// SPDX-License-Identifier: GPL-3.0-only
export function dialogMetrics(percent, width, height) {
  const scale = Math.max(75, Math.min(150, Number(percent) || 100)) / 100;
  return { scale, width: Math.max(1, width - 24) / scale, height: Math.max(1, height - 24) / scale };
}

export function applyDialogScale(dialog, percent, viewport = globalThis) {
  const metrics = dialogMetrics(percent, viewport.innerWidth, viewport.innerHeight);
  dialog.style.setProperty('--dialog-scale', metrics.scale);
  dialog.style.setProperty('--dialog-width', `${metrics.width}px`);
  dialog.style.setProperty('--dialog-height', `${metrics.height}px`);
  dialog.classList.toggle('compact-dialog', metrics.width < 620);
  return metrics;
}
