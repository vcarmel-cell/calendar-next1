const admin = require('firebase-admin');
const https  = require('https');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'calendar-next1' });
const db = admin.firestore();

const GREEN_ID    = process.env.GREEN_API_ID;
const GREEN_TOKEN = process.env.GREEN_API_TOKEN;

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const DAYS   = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

function tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function toWhatsAppId(phone) {
  const digits = phone.replace(/\D/g, '');
  return (digits.startsWith('0') ? '972' + digits.slice(1) : digits) + '@c.us';
}

function sendMessage(phone, message) {
  const url  = `https://api.green-api.com/waInstance${GREEN_ID}/sendMessage/${GREEN_TOKEN}`;
  const body = JSON.stringify({ chatId: toWhatsAppId(phone), message });
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function main() {
  const dateKey = tomorrowKey();
  console.log(`Sending reminders for ${dateKey}...`);

  const settSnap = await db.doc('settings/designers').get();
  const designers = settSnap.exists ? (settSnap.data().list || []) : [];

  const snap = await db.collection('appointments')
    .where('date', '==', dateKey)
    .where('whatsappConsent', '==', true)
    .get();

  let sent = 0;
  for (const d of snap.docs) {
    const apt      = d.data();
    if (!apt.phone) continue;

    const designer = designers.find(x => x.id === apt.designerId);
    const parts    = apt.date.split('-');
    const dateObj  = new Date(+parts[0], +parts[1]-1, +parts[2]);
    const dateStr  = `יום ${DAYS[dateObj.getDay()]}, ${dateObj.getDate()} ב${MONTHS[+parts[1]-1]}`;
    const isInstall = designer?.name?.includes('התקנות');

    const msg = isInstall
      ? `שלום ${apt.clientName} :)\n\nתזכורת להתקנה שלך מחר:\n* ${dateStr}\n* שעה: ${apt.startTime} - ${apt.endTime}${apt.address ? `\n* כתובת: ${apt.address}` : ''}\n\nטלפון לשינויים: 050-7141720\nWaze: https://waze.com/ul/hsv8s54crr\n\nאביה Kitchen`
      : `שלום ${apt.clientName} :)\n\nתזכורת לפגישה שלך מחר:\n* ${dateStr}\n* שעה: ${apt.startTime} - ${apt.endTime}\n* עם ${designer?.name || ''}\n\nטלפון לשינויים: 050-7141720\nWaze: https://waze.com/ul/hsv8s54crr\n\nאביה Kitchen`;

    try {
      await sendMessage(apt.phone, msg);
      console.log(`✓ ${apt.clientName} (${apt.phone})`);
      sent++;
    } catch (err) {
      console.error(`✗ ${apt.clientName}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`Done: ${sent}/${snap.size} reminders sent.`);
}

main().catch(err => { console.error(err); process.exit(1); });
