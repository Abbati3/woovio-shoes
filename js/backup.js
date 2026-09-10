// ── Backup & Restore ───────────────────────────────────────────────────────
//
// Photos dominate this app's size, so backups come in two forms: a small
// data-only export you can take often, and a full one with photos for when
// you actually want to be able to restore the pictures too.

async function backupData(withPhotos) {
  try {
    const db       = await getDB();
    const shoes    = await db.getAll('shoes');
    const settings = await db.get('settings', 'main');

    const payload = {
      app:        'woovio-shoes',
      version:    1,
      withPhotos: !!withPhotos,
      exportedAt: new Date().toISOString(),
      settings:   settings || {},
      shoes:      withPhotos ? shoes : shoes.map(s => ({ ...s, photo: '' })),
    };

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    const name = `shoes-backup-${date}${withPhotos ? '-full' : ''}.json`;
    const mb   = (blob.size / 1048576).toFixed(1);

    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Shoe stock backup' });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    localStorage.setItem('sinceBackup', '0');
    localStorage.setItem('lastBackupAt', new Date().toISOString());
    toast(`Backup ready — ${shoes.length} pair(s), ${mb} MB`, 'success');
    if (typeof showStorageInfo === 'function') showStorageInfo();
  } catch (e) {
    if (e.name !== 'AbortError') toast('Backup failed: ' + e.message, 'error');
  }
}

function openRestorePicker() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,application/json';
  input.onchange = e => handleRestoreFile(e.target.files[0]);
  input.click();
}

async function handleRestoreFile(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.app !== 'woovio-shoes') {
      toast('That is not a shoe stock backup', 'error'); return;
    }

    const list = payload.shoes || [];
    const note = payload.withPhotos === false
      ? '\n\nThis backup has no photos in it — restoring will leave every pair without its picture.'
      : '';
    if (!confirm(`Restore ${list.length} pair(s) from ${payload.exportedAt?.slice(0,10) || 'this backup'}?\n\nThis REPLACES everything currently in the app.${note}`)) return;

    const db = await getDB();
    if (payload.settings && payload.settings.id) await db.put('settings', payload.settings);

    for (const sh of await db.getAll('shoes')) await db.delete('shoes', sh.id);
    // Ids are preserved so nothing that referenced a pair is left dangling
    for (const sh of list) await db.put('shoes', sh);

    await loadSettings();
    await renderStock();
    renderPlaces(); renderOwed(); renderTotals();
    navigate('stock');
    toast(`Restored ${list.length} pair(s) ✓`, 'success');
  } catch (e) {
    toast('Restore failed: ' + e.message, 'error');
  }
}

window.backupData        = backupData;
window.openRestorePicker = openRestorePicker;
window.handleRestoreFile = handleRestoreFile;
