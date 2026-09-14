// ── Backup & Restore ───────────────────────────────────────────────────────
//
// One file holding every pair with its photo. A backup without photos would
// restore pairs you could no longer recognise, in an app built on recognising
// them by sight — so there is no smaller, photo-less option.

async function backupData() {
  try {
    const db       = await getDB();
    const shoes    = await db.getAll('shoes');
    const settings = await db.get('settings', 'main');

    const payload = {
      app:        'woovio-shoes',
      version:    1,
      withPhotos: true,
      exportedAt: new Date().toISOString(),
      settings:   settings || {},
      shoes,
    };

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const name = `shoes-backup-${today()}.json`;
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
    if (typeof showLastBackup === 'function') showLastBackup();
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
    // Older app versions could export without photos; say so before replacing
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
    renderPlaces(); renderTotals();
    navigate('stock');
    toast(`Restored ${list.length} pair(s) ✓`, 'success');
  } catch (e) {
    toast('Restore failed: ' + e.message, 'error');
  }
}

window.backupData        = backupData;
window.openRestorePicker = openRestorePicker;
window.handleRestoreFile = handleRestoreFile;
