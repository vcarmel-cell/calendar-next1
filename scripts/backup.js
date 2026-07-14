const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// Init Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function backup() {
  const today = new Date().toISOString().slice(0, 10);
  const data  = { date: today, appointments: [], settings: {} };

  // Backup appointments
  const aptsSnap = await db.collection('appointments').get();
  aptsSnap.forEach(doc => data.appointments.push({ id: doc.id, ...doc.data() }));

  // Backup settings
  const settSnap = await db.collection('settings').get();
  settSnap.forEach(doc => data.settings[doc.id] = doc.data());

  // Save latest
  const backupDir = path.join(__dirname, '..', 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'latest.json'), JSON.stringify(data, null, 2));

  // Save daily snapshot (last 30 days kept)
  fs.writeFileSync(path.join(backupDir, `backup_${today}.json`), JSON.stringify(data, null, 2));

  // Delete backups older than 30 days
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('backup_'));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  files.forEach(f => {
    const fileDate = new Date(f.replace('backup_', '').replace('.json', ''));
    if (fileDate < cutoff) fs.unlinkSync(path.join(backupDir, f));
  });

  console.log(`✓ Backup saved: ${data.appointments.length} appointments`);
}

backup().catch(err => { console.error(err); process.exit(1); });
