// =============================================================================
// Cliniko Test Data Populator — EWC
// Usage: node scripts/populate-cliniko.mjs <API_KEY>
//   or:  CLINIKO_API_KEY=<key> node scripts/populate-cliniko.mjs
//
// Run AFTER creating practitioners + appointment types in Cliniko UI.
// Creates: 20 patients, ~45 appointments, treatment notes.
// Rate limit: 200 req/min — script stays well under with 400ms delays.
// =============================================================================

const API_KEY = process.argv[2] || process.env.CLINIKO_API_KEY;
if (!API_KEY) {
  console.error('Usage: node scripts/populate-cliniko.mjs <API_KEY>');
  process.exit(1);
}

// Extract shard from key suffix (e.g. "...abc-uk3" → "uk3")
const shardMatch = API_KEY.match(/-([a-z0-9]+)$/);
const SHARD      = shardMatch ? shardMatch[1] : 'uk3';
const BASE_URL   = `https://api.${SHARD}.cliniko.com/v1`;
const AUTH       = 'Basic ' + Buffer.from(`${API_KEY}:`).toString('base64');
const UA         = 'EWC-Intelligence/1.0 (admin@edgbastonwellness.co.uk)';

const delay = ms => new Promise(r => setTimeout(r, ms));

// Extract exact ID string from links.self URL (avoids JS float64 precision loss on large ints)
const idFromLink = (obj) => obj?.links?.self?.split('/').pop() ?? null;

// Add minutes to an ISO datetime string ("2026-03-02T10:00:00+00:00" + 30 → "2026-03-02T10:30:00+00:00")
function addMinutes(isoStr, mins) {
  const d = new Date(isoStr);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString().slice(0, 19) + '+00:00';
}

// ---------------------------------------------------------------------------
// Core request
// ---------------------------------------------------------------------------
async function req(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization:  AUTH,
      'Content-Type': 'application/json',
      Accept:         'application/json',
      'User-Agent':   UA,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

async function paginate(endpoint, key) {
  const results = [];
  let url = `${BASE_URL}${endpoint}?per_page=100`;
  while (url) {
    const resp = await req(url);
    results.push(...(resp[key] ?? []));
    url = resp.links?.next ?? null;
    if (url) await delay(400);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Appointment type pricing (GBP)
// ---------------------------------------------------------------------------
const PRICES = {
  'Botox — Upper Face':          { price: '350.00', tax: null },
  'Botox — Full Face':           { price: '450.00', tax: null },
  'Dermal Filler — Lips':        { price: '350.00', tax: null },
  'Profhilo Treatment':          { price: '400.00', tax: null },
  'CoolSculpting — Single Area': { price: '1200.00', tax: null },
  'IV Therapy — Vitamin C Boost':{ price: '195.00', tax: null },
  'B12 Injection':               { price: '45.00',  tax: null },
  'Weight Loss Consultation':    { price: '150.00', tax: null },
  'Hormone Therapy Consultatio': { price: '250.00', tax: null },
  'GP Appointment':              { price: '120.00', tax: null },
  'Full Health Screening':       { price: '350.00', tax: null },
  'Free Consultation':           { price: '0.00',   tax: null },
};

// ---------------------------------------------------------------------------
// Patient data
// ---------------------------------------------------------------------------
const PATIENTS = [
  {
    first_name: 'Sarah',      last_name: 'Thompson',
    date_of_birth: '1985-06-14', gender_identity: 'Female',
    email: 'sarah.thompson@gmail.com',
    phone_numbers: [{ number: '+447700900101', phone_type: 'Mobile' }],
    address_1: '42 Augustus Road', city: 'Birmingham', post_code: 'B15 4LQ', country: 'United Kingdom',
    referral_source: 'Instagram',
    occupation: 'Marketing Manager',
    notes: 'Regular Botox patient — upper face. Prefers appointments after 4pm. No known allergies. Happy with Charlotte voice on reminder calls.',
  },
  {
    first_name: 'Michelle',   last_name: 'Davies',
    date_of_birth: '1979-03-28', gender_identity: 'Female',
    email: 'm.davies79@hotmail.co.uk',
    phone_numbers: [{ number: '+447700900102', phone_type: 'Mobile' }],
    address_1: '18 Wellington Road', city: 'Birmingham', post_code: 'B15 2ES', country: 'United Kingdom',
    referral_source: 'Friend referral',
    occupation: 'Solicitor',
    notes: 'Lip and cheek filler. Bruised easily last time — ice before treatment. Partner also interested in Botox.',
  },
  {
    first_name: 'James',      last_name: 'Okafor',
    date_of_birth: '1988-11-02', gender_identity: 'Male',
    email: 'j.okafor@outlook.com',
    phone_numbers: [{ number: '+447700900103', phone_type: 'Mobile' }],
    address_1: '7 Portland Road', city: 'Birmingham', post_code: 'B16 9HN', country: 'United Kingdom',
    referral_source: 'Google',
    occupation: 'Accountant',
    notes: 'Weight loss programme — ozempic consultation. Monthly check-ins. BMI 31. Target: -12kg by June.',
  },
  {
    first_name: 'Harriet',    last_name: 'Pemberton',
    date_of_birth: '1968-09-15', gender_identity: 'Female',
    email: 'harriet.pemberton@pembertonlaw.co.uk',
    phone_numbers: [{ number: '+447700900104', phone_type: 'Mobile' }],
    address_1: '3 Carpenter Road', city: 'Birmingham', post_code: 'B15 2JJ', country: 'United Kingdom',
    referral_source: 'Word of mouth',
    occupation: 'Partner, law firm',
    notes: 'VIP patient. Botox full face + Profhilo quarterly. Always pays immediately. Prefers Emma Walsh. Do not discuss pricing — she is on a package.',
  },
  {
    first_name: 'Claire',     last_name: 'Sanderson',
    date_of_birth: '1992-04-07', gender_identity: 'Female',
    email: 'claire.sanderson@nhs.net',
    phone_numbers: [{ number: '+447700900105', phone_type: 'Mobile' }],
    address_1: '55 Fountain Road', city: 'Birmingham', post_code: 'B17 8NJ', country: 'United Kingdom',
    referral_source: 'Colleague',
    occupation: 'NHS nurse',
    notes: 'B12 every 3 months. Also interested in IV Vitamin C. Staff discount applied. Works shifts — call after 11am.',
  },
  {
    first_name: 'David',      last_name: 'Hollingsworth',
    date_of_birth: '1963-07-19', gender_identity: 'Male',
    email: 'd.hollingsworth@hollingsworthgroup.co.uk',
    phone_numbers: [{ number: '+447700900106', phone_type: 'Mobile' }],
    address_1: '28 Yateley Road', city: 'Birmingham', post_code: 'B15 2LY', country: 'United Kingdom',
    referral_source: 'Corporate enquiry',
    occupation: 'Business owner',
    notes: 'CEO of Hollingsworth Group. Interested in corporate health screening for 8 staff. Referred by Birmingham Chamber of Commerce event.',
  },
  {
    first_name: 'Anita',      last_name: 'Patel',
    date_of_birth: '1983-12-30', gender_identity: 'Female',
    email: 'anita.patel84@gmail.com',
    phone_numbers: [{ number: '+447700900107', phone_type: 'Mobile' }],
    address_1: '91 Vicarage Road', city: 'Birmingham', post_code: 'B15 3ES', country: 'United Kingdom',
    referral_source: 'Google',
    occupation: 'Teacher',
    notes: 'Last treatment: Botox upper face Nov 2025. Cancelled follow-up, did not rebook. Worth re-engaging — expressed interest in Profhilo at last visit.',
  },
  {
    first_name: 'Rebecca',    last_name: 'Morrison',
    date_of_birth: '1976-05-22', gender_identity: 'Female',
    email: 'rebecca.morrison@gmail.com',
    phone_numbers: [{ number: '+447700900108', phone_type: 'Mobile' }],
    address_1: '14 Edgbaston Park Road', city: 'Birmingham', post_code: 'B15 2RB', country: 'United Kingdom',
    referral_source: 'Instagram',
    occupation: 'Interior designer',
    notes: 'Profhilo 2-session course, then maintenance every 6 months. Skin booster interest flagged. Open to sharing before/after photos.',
  },
  {
    first_name: 'Thomas',     last_name: 'Griffiths',
    date_of_birth: '1958-02-14', gender_identity: 'Male',
    email: 't.griffiths@griffithsproperty.co.uk',
    phone_numbers: [{ number: '+447700900109', phone_type: 'Mobile' }],
    address_1: '6 Wheeleys Lane', city: 'Birmingham', post_code: 'B15 2LN', country: 'United Kingdom',
    referral_source: 'Friend referral',
    occupation: 'Property developer',
    notes: 'Referred by David Hollingsworth. Full health screening booked. Interested in ongoing quarterly health MOTs. May become corporate account.',
  },
  {
    first_name: 'Yasmin',     last_name: 'Ali',
    date_of_birth: '1997-08-09', gender_identity: 'Female',
    email: 'yasmin.ali97@gmail.com',
    phone_numbers: [{ number: '+447700900110', phone_type: 'Mobile' }],
    address_1: '23 Frederick Road', city: 'Birmingham', post_code: 'B15 1JN', country: 'United Kingdom',
    referral_source: 'Instagram',
    occupation: 'Pharmacist',
    notes: 'First-time aesthetics patient. Had free consultation Jan 2026, then lip filler Feb 2026. Nervous — reassure and go gentle. Interested in cheeks next.',
  },
  {
    first_name: 'Louise',     last_name: 'Carter',
    date_of_birth: '1980-09-03', gender_identity: 'Female',
    email: 'louise.carter@carter-consulting.co.uk',
    phone_numbers: [{ number: '+447700900111', phone_type: 'Mobile' }],
    address_1: '37 Augustus Road', city: 'Birmingham', post_code: 'B15 4LP', country: 'United Kingdom',
    referral_source: 'Friend referral',
    occupation: 'Management consultant',
    notes: 'CoolSculpting abdomen Jan 5 2026. 8-week review due 2 March. Keen to do flanks next if results good. High earner — upsell potential.',
  },
  {
    first_name: 'Raj',        last_name: 'Mehta',
    date_of_birth: '1971-04-25', gender_identity: 'Male',
    email: 'raj.mehta@mehtafamilylaw.com',
    phone_numbers: [{ number: '+447700900112', phone_type: 'Mobile' }],
    address_1: '12 Pakenham Road', city: 'Birmingham', post_code: 'B15 2PA', country: 'United Kingdom',
    referral_source: 'GP referral',
    occupation: 'Solicitor',
    notes: 'TRT (testosterone replacement therapy) under Dr Suresh. Monthly bloods. Discreet — do not mention treatment on answerphone.',
  },
  {
    first_name: 'Patricia',   last_name: 'Walsh',
    date_of_birth: '1945-01-12', gender_identity: 'Female',
    phone_numbers: [{ number: '+447700900113', phone_type: 'Mobile' }],
    address_1: '88 Wellington Road', city: 'Birmingham', post_code: 'B15 2ER', country: 'United Kingdom',
    referral_source: 'Previous patient',
    occupation: 'Retired',
    notes: 'GP appointments for medication reviews. Prefers letter confirmation. Daughter Helen handles bookings (+447700900131). Goes by Patricia, not Pat.',
  },
  {
    first_name: 'Oliver',     last_name: 'Brennan',
    date_of_birth: '1990-06-17', gender_identity: 'Male',
    email: 'oliver.brennan@gmail.com',
    phone_numbers: [{ number: '+447700900114', phone_type: 'Mobile' }],
    address_1: '5 Greenfield Road', city: 'Birmingham', post_code: 'B17 0EH', country: 'United Kingdom',
    referral_source: 'Google',
    occupation: 'Architect',
    notes: 'Enquired about Botox for jaw clenching (bruxism) and forehead lines. First male aesthetics patient at clinic. Free consult scheduled March 10.',
  },
  {
    first_name: 'Helen',      last_name: 'Kinsella',
    date_of_birth: '1974-08-30', gender_identity: 'Female',
    email: 'helen.kinsella@gmail.com',
    phone_numbers: [{ number: '+447700900115', phone_type: 'Mobile' }],
    address_1: '19 Farquhar Road', city: 'Birmingham', post_code: 'B15 2QP', country: 'United Kingdom',
    referral_source: 'Dental colleague',
    occupation: 'Dentist',
    notes: 'Botox full face + lip filler. Knows anatomy — happy to discuss technique. Has referred 3 patients. Reward at next visit.',
  },
  {
    first_name: 'Natalie',    last_name: 'Cross',
    date_of_birth: '1989-02-14', gender_identity: 'Female',
    email: 'natalie.cross@yahoo.co.uk',
    phone_numbers: [{ number: '+447700900116', phone_type: 'Mobile' }],
    address_1: '44 Serpentine Road', city: 'Birmingham', post_code: 'B17 9RE', country: 'United Kingdom',
    referral_source: 'Fitness community',
    occupation: 'Personal trainer',
    notes: 'Monthly IV therapy — Myers Cocktail. Interested in B12 between sessions. Happy to be featured in social media with consent.',
  },
  {
    first_name: 'Christopher', last_name: 'Hill',
    date_of_birth: '1977-11-08', gender_identity: 'Male',
    email: 'chris.hill@hillmanufacturing.co.uk',
    phone_numbers: [{ number: '+447700900117', phone_type: 'Mobile' }],
    address_1: '61 Sandon Road', city: 'Birmingham', post_code: 'B17 8DL', country: 'United Kingdom',
    referral_source: 'Friend referral',
    occupation: 'Manufacturing director',
    notes: 'Wife is Louise Carter. Both had CoolSculpting. Chris had abdomen Dec 2025. Interested in flanks. Corporate account potential — company of 45 staff.',
  },
  {
    first_name: 'Amanda',     last_name: 'Ferguson',
    date_of_birth: '1986-03-21', gender_identity: 'Female',
    email: 'amanda.ferguson@gmail.com',
    phone_numbers: [{ number: '+447700900118', phone_type: 'Mobile' }],
    address_1: '30 Harborne Park Road', city: 'Birmingham', post_code: 'B17 0NP', country: 'United Kingdom',
    referral_source: 'Instagram',
    occupation: 'Event planner',
    notes: 'DNA (did not arrive) — free consultation Jan 2026. Left voicemail. No response. Enquiry was for Botox + lip filler combo. Try one more outbound call.',
  },
  {
    first_name: 'Sophie',     last_name: 'Turner',
    date_of_birth: '1995-09-05', gender_identity: 'Female',
    email: 'sophie.turner95@gmail.com',
    phone_numbers: [{ number: '+447700900119', phone_type: 'Mobile' }],
    address_1: '9 Grange Road', city: 'Birmingham', post_code: 'B15 3PL', country: 'United Kingdom',
    referral_source: 'Instagram',
    occupation: 'UX designer',
    notes: 'First Botox Feb 14 2026. Very happy with results. Would like to rebook before summer. Mentioned 2 friends may want a joint booking.',
  },
  {
    first_name: 'Marcus',     last_name: 'Webb',
    date_of_birth: '1969-05-03', gender_identity: 'Male',
    email: 'marcus.webb@webbcapital.co.uk',
    phone_numbers: [{ number: '+447700900120', phone_type: 'Mobile' }],
    address_1: '2 Carpenter Road', city: 'Birmingham', post_code: 'B15 2JH', country: 'United Kingdom',
    referral_source: 'Friend referral',
    occupation: 'Private equity investor',
    notes: 'Referred by Harriet Pemberton. Health screening + hormone consultation complete Feb 2026. Corporate package for 6 directors discussed — quotes to follow.',
  },
];

// ---------------------------------------------------------------------------
// Appointment schedule
// Each entry: { patientName, practitionerName, typeName, startsAt, attended, dna, notes }
// ---------------------------------------------------------------------------
const APPOINTMENTS = [
  // === NOV/DEC 2025 — Retention triggers ===
  { p: 'Helen Kinsella',     pr: 'Emma Walsh',      t: 'Botox — Full Face',          at: '2025-10-14T14:00:00', attended: true  },
  { p: 'Harriet Pemberton',  pr: 'Emma Walsh',      t: 'Botox — Full Face',          at: '2025-10-22T11:00:00', attended: true  },
  { p: 'Harriet Pemberton',  pr: 'Emma Walsh',      t: 'Profhilo Treatment',         at: '2025-10-22T12:00:00', attended: true  },
  { p: 'Sarah Thompson',     pr: 'Emma Walsh',      t: 'Botox — Upper Face',         at: '2025-11-04T15:30:00', attended: true  },
  { p: 'Anita Patel',        pr: 'Emma Walsh',      t: 'Botox — Upper Face',         at: '2025-11-11T11:00:00', attended: true  },
  { p: 'Michelle Davies',    pr: 'Emma Walsh',      t: 'Dermal Filler — Lips',       at: '2025-11-18T13:00:00', attended: true  },
  { p: 'Claire Sanderson',   pr: 'Priya Sharma',    t: 'B12 Injection',              at: '2025-11-25T09:30:00', attended: true  },
  { p: 'Natalie Cross',      pr: 'Priya Sharma',    t: 'IV Therapy — Vitamin C Boost', at: '2025-12-02T10:00:00', attended: true },
  { p: 'Christopher Hill',   pr: 'James Mitchell',  t: 'CoolSculpting — Single Area', at: '2025-12-05T11:30:00', attended: true },
  { p: 'Raj Mehta',          pr: 'Dr Suresh Ganta', t: 'Hormone Therapy Consultatio', at: '2025-12-09T14:00:00', attended: true },
  { p: 'Rebecca Morrison',   pr: 'Emma Walsh',      t: 'Profhilo Treatment',         at: '2025-12-12T09:00:00', attended: true  },
  { p: 'Patricia Walsh',     pr: 'Dr Suresh Ganta', t: 'GP Appointment',             at: '2025-12-16T10:30:00', attended: true  },

  // === JAN 2026 ===
  { p: 'Louise Carter',      pr: 'James Mitchell',  t: 'CoolSculpting — Single Area', at: '2026-01-05T11:00:00', attended: true },
  { p: 'Amanda Ferguson',    pr: 'Emma Walsh',      t: 'Free Consultation',          at: '2026-01-07T14:00:00', dna: true       },
  { p: 'Natalie Cross',      pr: 'Priya Sharma',    t: 'IV Therapy — Vitamin C Boost', at: '2026-01-08T09:30:00', attended: true },
  { p: 'James Okafor',       pr: 'Dr Suresh Ganta', t: 'Weight Loss Consultation',   at: '2026-01-13T11:00:00', attended: true  },
  { p: 'Harriet Pemberton',  pr: 'Emma Walsh',      t: 'Botox — Full Face',          at: '2026-01-14T14:30:00', attended: true  },
  { p: 'Harriet Pemberton',  pr: 'Emma Walsh',      t: 'Profhilo Treatment',         at: '2026-01-14T15:30:00', attended: true  },
  { p: 'David Hollingsworth', pr: 'Dr Suresh Ganta', t: 'Full Health Screening',    at: '2026-01-20T10:00:00', attended: true  },
  { p: 'Raj Mehta',          pr: 'Dr Suresh Ganta', t: 'GP Appointment',             at: '2026-01-21T11:00:00', attended: true  },
  { p: 'Yasmin Ali',         pr: 'Emma Walsh',      t: 'Free Consultation',          at: '2026-01-27T13:00:00', attended: true  },

  // === FEB 2026 ===
  { p: 'Rebecca Morrison',   pr: 'Emma Walsh',      t: 'Profhilo Treatment',         at: '2026-02-03T10:00:00', attended: true  },
  { p: 'Claire Sanderson',   pr: 'Priya Sharma',    t: 'B12 Injection',              at: '2026-02-04T09:30:00', attended: true  },
  { p: 'Thomas Griffiths',   pr: 'Dr Suresh Ganta', t: 'Full Health Screening',      at: '2026-02-05T14:00:00', attended: true  },
  { p: 'James Okafor',       pr: 'Dr Suresh Ganta', t: 'Weight Loss Consultation',   at: '2026-02-10T11:00:00', attended: true  },
  { p: 'Helen Kinsella',     pr: 'Emma Walsh',      t: 'Botox — Full Face',          at: '2026-02-11T10:30:00', attended: true  },
  { p: 'Sophie Turner',      pr: 'Emma Walsh',      t: 'Botox — Upper Face',         at: '2026-02-14T11:00:00', attended: true  },
  { p: 'Natalie Cross',      pr: 'Priya Sharma',    t: 'IV Therapy — Vitamin C Boost', at: '2026-02-17T14:00:00', attended: true },
  { p: 'Marcus Webb',        pr: 'Dr Suresh Ganta', t: 'Full Health Screening',      at: '2026-02-18T10:00:00', attended: true  },
  { p: 'Marcus Webb',        pr: 'Dr Suresh Ganta', t: 'Hormone Therapy Consultatio', at: '2026-02-19T11:00:00', attended: true },
  { p: 'Yasmin Ali',         pr: 'Emma Walsh',      t: 'Dermal Filler — Lips',       at: '2026-02-24T09:00:00', attended: true  },
  { p: 'Raj Mehta',          pr: 'Dr Suresh Ganta', t: 'Hormone Therapy Consultatio', at: '2026-02-25T14:00:00', attended: true },
  { p: 'Patricia Walsh',     pr: 'Dr Suresh Ganta', t: 'GP Appointment',             at: '2026-02-26T14:00:00', attended: true  },

  // === MAR/APR 2026 — Upcoming ===
  { p: 'Louise Carter',      pr: 'James Mitchell',  t: 'Free Consultation',          at: '2026-03-02T10:00:00' },
  { p: 'James Okafor',       pr: 'Dr Suresh Ganta', t: 'Weight Loss Consultation',   at: '2026-03-03T11:00:00' },
  { p: 'Harriet Pemberton',  pr: 'Emma Walsh',      t: 'Botox — Upper Face',         at: '2026-03-04T14:00:00', notes: 'Small top-up forehead' },
  { p: 'Natalie Cross',      pr: 'Priya Sharma',    t: 'IV Therapy — Vitamin C Boost', at: '2026-03-05T09:30:00' },
  { p: 'Raj Mehta',          pr: 'Dr Suresh Ganta', t: 'GP Appointment',             at: '2026-03-05T11:00:00', notes: 'Bloods review' },
  { p: 'Oliver Brennan',     pr: 'Emma Walsh',      t: 'Free Consultation',          at: '2026-03-10T13:00:00', notes: 'First visit, male aesthetics' },
  { p: 'Thomas Griffiths',   pr: 'Dr Suresh Ganta', t: 'GP Appointment',             at: '2026-03-11T14:00:00' },
  { p: 'Sarah Thompson',     pr: 'Emma Walsh',      t: 'Botox — Upper Face',         at: '2026-03-12T10:00:00', notes: '4-month rebook' },
  { p: 'Helen Kinsella',     pr: 'Emma Walsh',      t: 'Dermal Filler — Lips',       at: '2026-03-12T11:30:00' },
  { p: 'Rebecca Morrison',   pr: 'Emma Walsh',      t: 'Profhilo Treatment',         at: '2026-03-17T10:00:00' },
  { p: 'Christopher Hill',   pr: 'James Mitchell',  t: 'Free Consultation',          at: '2026-03-18T11:00:00', notes: 'Flanks CoolSculpting interest' },
  { p: 'Claire Sanderson',   pr: 'Priya Sharma',    t: 'IV Therapy — Vitamin C Boost', at: '2026-03-19T14:00:00' },
  { p: 'Marcus Webb',        pr: 'Dr Suresh Ganta', t: 'GP Appointment',             at: '2026-03-24T13:00:00' },
  { p: 'Harriet Pemberton',  pr: 'Emma Walsh',      t: 'Profhilo Treatment',         at: '2026-04-01T10:00:00', notes: 'Quarterly Profhilo' },
  { p: 'Raj Mehta',          pr: 'Dr Suresh Ganta', t: 'Hormone Therapy Consultatio', at: '2026-04-14T14:00:00', notes: 'Quarterly review' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🔗 Cliniko Test Data Populator`);
  console.log(`   Shard: ${SHARD} | URL: ${BASE_URL}\n`);

  // --- Test connection ---
  console.log('1. Testing connection...');
  try {
    const test = await req('/practitioners?per_page=1');
    console.log(`   ✓ Connected — ${test.total_entries} practitioner(s) found`);
  } catch (e) {
    console.error(`   ✗ Connection failed: ${e.message}`);
    process.exit(1);
  }

  // --- Fetch businesses ---
  console.log('\n2. Fetching businesses...');
  const businesses = await paginate('/businesses', 'businesses');
  if (!businesses.length) {
    console.error('   ✗ No businesses found. Set up your clinic in Cliniko settings first.');
    process.exit(1);
  }
  const businessId = idFromLink(businesses[0]);
  console.log(`   ✓ Business: "${businesses[0].name}" (ID: ${businessId})`);

  // --- Fetch practitioners ---
  console.log('\n3. Fetching practitioners...');
  const practitioners = await paginate('/practitioners', 'practitioners');
  const practMap = {};
  for (const p of practitioners) {
    const pid = idFromLink(p);
    const fullName = `${p.title ? p.title + ' ' : ''}${p.first_name} ${p.last_name}`.trim();
    practMap[fullName] = pid;
    practMap[`${p.first_name} ${p.last_name}`] = pid;
    practMap[p.last_name] = pid;
  }
  console.log(`   ✓ ${practitioners.length} practitioners:`);
  practitioners.forEach(p => console.log(`     - ${p.title || ''} ${p.first_name} ${p.last_name} (ID: ${idFromLink(p)})`));

  // --- Fetch appointment types ---
  console.log('\n4. Fetching appointment types...');
  const apptTypes = await paginate('/appointment_types', 'appointment_types');
  const typeMap = {};    // name → ID string
  const typeDurMap = {}; // ID string → duration_in_minutes
  for (const t of apptTypes) {
    const tid = idFromLink(t);
    typeMap[t.name] = tid;
    typeMap[t.name.slice(0, 20)] = tid;
    typeDurMap[tid] = t.duration_in_minutes || 30;
  }
  console.log(`   ✓ ${apptTypes.length} appointment types:`);
  apptTypes.forEach(t => console.log(`     - "${t.name}" (ID: ${idFromLink(t)}, ${t.duration_in_minutes}min)`));

  // --- Fetch existing patients to avoid duplicates ---
  console.log('\n5. Checking existing patients + creating new ones...');
  const existingPatients = await paginate('/patients', 'patients');
  const patientMap = {}; // "First Last" → cliniko_id string
  for (const ep of existingPatients) {
    patientMap[`${ep.first_name} ${ep.last_name}`] = idFromLink(ep);
  }
  let patientOk = 0, patientSkip = 0, patientFail = 0;

  for (const p of PATIENTS) {
    const fullName = `${p.first_name} ${p.last_name}`;
    if (patientMap[fullName]) {
      console.log(`   ↩ ${fullName} (already exists — ID: ${patientMap[fullName]})`);
      patientSkip++;
      continue;
    }
    try {
      const res = await req('/patients', { method: 'POST', body: JSON.stringify(p) });
      patientMap[fullName] = idFromLink(res);
      console.log(`   ✓ ${fullName} (ID: ${patientMap[fullName]})`);
      patientOk++;
    } catch (e) {
      console.error(`   ✗ ${fullName}: ${e.message}`);
      patientFail++;
    }
    await delay(400);
  }
  console.log(`\n   Patients: ${patientOk} created, ${patientSkip} skipped (exist), ${patientFail} failed`);

  // --- Create appointments ---
  console.log('\n6. Creating appointments...');
  let apptOk = 0, apptFail = 0, apptSkip = 0;
  const createdAppts = []; // { apptId, patientId, practId, typeName, date, attended }

  for (const appt of APPOINTMENTS) {
    const patientId = patientMap[appt.p];
    if (!patientId) {
      console.warn(`   ⚠ Skip — patient not found: "${appt.p}"`);
      apptSkip++;
      continue;
    }

    // Resolve practitioner — try exact match first, then partial
    let practId = practMap[appt.pr];
    if (!practId) {
      // Try matching by last name
      const lastName = appt.pr.split(' ').pop();
      practId = practMap[lastName];
    }
    if (!practId) {
      console.warn(`   ⚠ Skip — practitioner not found: "${appt.pr}"`);
      apptSkip++;
      continue;
    }

    // Resolve appointment type — try exact, then first 20 chars
    let typeId = typeMap[appt.t];
    if (!typeId) {
      typeId = typeMap[appt.t.slice(0, 20)];
    }
    if (!typeId) {
      // Try matching ignoring case
      const lowerT = appt.t.toLowerCase();
      for (const [k, v] of Object.entries(typeMap)) {
        if (k.toLowerCase().startsWith(lowerT.slice(0, 15))) {
          typeId = v;
          break;
        }
      }
    }
    if (!typeId) {
      console.warn(`   ⚠ Skip — appointment type not found: "${appt.t}"`);
      apptSkip++;
      continue;
    }

    try {
      const startIso = appt.at.includes('+') || appt.at.endsWith('Z') ? appt.at : appt.at + '+00:00';
      const duration = typeDurMap[typeId] ?? 30;
      const endIso   = addMinutes(startIso, duration);

      // Build JSON body using template string to preserve large integer IDs exactly
      // Cliniko v1 uses starts_at / ends_at
      const apptBody = `{"starts_at":"${startIso}","ends_at":"${endIso}","practitioner_id":${practId},"appointment_type_id":${typeId},"patient_id":${patientId},"business_id":${businessId}${appt.notes ? `,"notes":${JSON.stringify(appt.notes)}` : ''}}`;

      const created = await req('/individual_appointments', {
        method: 'POST',
        body: apptBody,
      });
      const createdId = idFromLink(created);

      // Mark attendance for past appointments
      if (appt.attended || appt.dna) {
        await delay(300);
        const patchBody = `{"patient_arrived":${appt.attended ? 'true' : 'false'},"did_not_arrive":${appt.dna ? 'true' : 'false'}}`;
        await req(`/individual_appointments/${createdId}`, {
          method: 'PATCH',
          body: patchBody,
        });
      }

      if (appt.attended) {
        createdAppts.push({ apptId: createdId, patientId, practId, typeName: appt.t, date: appt.at.split('T')[0] });
      }
      const status = appt.attended ? '✓ attended' : appt.dna ? '✓ DNA' : '✓ booked';
      console.log(`   ${status} — ${appt.p} | ${appt.t} | ${appt.at.split('T')[0]}`);
      apptOk++;
    } catch (e) {
      console.error(`   ✗ ${appt.p} | ${appt.t} | ${appt.at.split('T')[0]}: ${e.message}`);
      apptFail++;
    }
    await delay(450);
  }

  // --- Create invoices for attended appointments ---
  console.log(`\n7. Creating invoices for ${createdAppts.length} attended appointments...`);
  let invOk = 0, invFail = 0;

  for (const a of createdAppts) {
    const pricing = PRICES[a.typeName] ?? { price: '0.00', tax: null };
    const itemName = a.typeName.length > 30 ? a.typeName.slice(0, 30) : a.typeName;
    const isPaid = parseFloat(pricing.price) > 0;

    // Determine status: paid if > £0, otherwise draft (free consultation)
    // Cliniko accepted statuses: draft, awaiting_payment, paid, cancelled, written_off
    const status = isPaid ? 'awaiting_payment' : 'draft';

    const invBody = `{"patient_id":${a.patientId},"practitioner_id":${a.practId},"appointment_id":${a.apptId},"business_id":${businessId},"issue_date":"${a.date}","invoice_items":[{"name":${JSON.stringify(itemName)},"quantity":1,"net_price":"${pricing.price}"${pricing.tax ? `,"tax_name":"${pricing.tax.name}","tax_rate":"${pricing.tax.rate}"` : ''}}]}`;

    try {
      const inv = await req('/invoices', { method: 'POST', body: invBody });
      const invId = idFromLink(inv);

      // Mark as paid if price > 0
      if (isPaid) {
        await delay(300);
        await req(`/invoices/${invId}`, {
          method: 'PATCH',
          body: `{"status":"paid"}`,
        });
      }

      const label = isPaid ? `£${pricing.price} paid` : 'free';
      console.log(`   ✓ Invoice — ${a.typeName} | ${a.date} | ${label}`);
      invOk++;
    } catch (e) {
      console.error(`   ✗ Invoice failed — ${a.typeName} | ${a.date}: ${e.message}`);
      invFail++;
    }
    await delay(450);
  }
  console.log(`\n   Invoices: ${invOk} created, ${invFail} failed`);

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log(`  Patients:     ${patientOk} created, ${patientFail} failed`);
  console.log(`  Appointments: ${apptOk} created, ${apptFail} failed, ${apptSkip} skipped`);
  console.log(`  Invoices:     ${invOk} created, ${invFail} failed`);
  console.log('='.repeat(60));

  if (apptSkip > 0) {
    console.log('\n⚠ Skipped appointments are usually due to missing appointment types.');
    console.log('  Add the missing types in Cliniko Settings → Appointment Types, then re-run.');
    console.log('  Missing from your account (check against test data):');
    console.log('    - IV Therapy — Myers Cocktail');
    console.log('    - Botox — Top-Up');
    console.log('    - Dermal Filler — Cheeks');
    console.log('    - Dermal Filler — Jawline');
    console.log('    - CoolSculpting — Dual Area');
    console.log('    - CoolSculpting — Follow-Up Review');
    console.log('    - Skin Booster — Restylane');
    console.log('    - IV Therapy — Hydration Drip');
  }
  console.log('');
}

main().catch(e => {
  console.error('\nFatal error:', e.message);
  process.exit(1);
});
