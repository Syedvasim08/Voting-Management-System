const express = require('express');
const { DatabaseSync } = require('node:sqlite');   // built into Node 22.5+ (no install needed)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MATCH_THRESHOLD = 20;                       // max differing bits (of 64) to accept a face/image
const ID_FORMAT = /^[A-Z]{3}[0-9]{7}$/;           // e.g. ABC1234567 (EPIC-style Voter ID)

const db = new DatabaseSync(path.join(__dirname, 'voting.db'));
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
if (!db.prepare('SELECT COUNT(*) c FROM candidates').get().c) {
  const ins = db.prepare('INSERT INTO candidates (name, party) VALUES (?, ?)');
  [['Arun Kumar', 'Progress Party'], ['Meena Devi', 'Unity Front'], ['Rahul Sharma', 'Independent']]
    .forEach(c => ins.run(...c));
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();                       // token -> { voterId } | { admin: true }
const newToken = (data) => { const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, data); return t; };
const hamming = (a, b) => [...a].reduce((n, ch, i) => n + (ch !== b[i]), 0);
const electionOpen = () => db.prepare("SELECT value FROM settings WHERE key='election_open'").get().value === '1';
const admin = (req, res, next) => sessions.get(req.headers['x-token'])?.admin ? next() : res.status(401).json({ error: 'Admin login required' });

// 1. Voter registration: ID validation + duplicate detection
app.post('/api/register', (req, res) => {
  const { voterId, name, photo, hash } = req.body;
  if (!voterId || !name || !photo || !/^[01]{64}$/.test(hash || '')) return res.status(400).json({ error: 'All fields and a photo are required.' });
  const id = voterId.trim().toUpperCase();
  if (!ID_FORMAT.test(id)) return res.status(400).json({ error: 'Invalid Voter ID format. Use 3 letters + 7 digits (e.g. ABC1234567).' });
  if (db.prepare('SELECT 1 FROM voters WHERE voter_id=?').get(id)) return res.status(409).json({ error: 'Duplicate alert: this Voter ID is already registered.' });
  db.prepare('INSERT INTO voters (voter_id, name, photo, img_hash) VALUES (?,?,?,?)').run(id, name.trim(), photo, hash);
  res.json({ message: `Voter ${name.trim()} registered successfully.` });
});

// 2. Secure login: Voter ID + image verification + voting-status check
app.post('/api/login', (req, res) => {
  const id = (req.body.voterId || '').trim().toUpperCase();
  const voter = db.prepare('SELECT * FROM voters WHERE voter_id=?').get(id);
  if (!voter) return res.status(404).json({ error: 'Voter ID not found. Access denied.' });
  if (hamming(voter.img_hash, req.body.hash || '') > MATCH_THRESHOLD) return res.status(403).json({ error: 'Image verification failed. Access denied.' });
  if (voter.has_voted) return res.status(403).json({ error: 'You have already voted. Voting blocked.' });
  if (!electionOpen()) return res.status(403).json({ error: 'Election is closed.' });
  res.json({ token: newToken({ voterId: id }), name: voter.name });
});

app.get('/api/candidates', (_, res) => res.json(db.prepare('SELECT * FROM candidates').all()));

// 3. One-time voting (atomic: store vote + mark voter as VOTED)
app.post('/api/vote', (req, res) => {
  const s = sessions.get(req.body.token);
  if (!s?.voterId) return res.status(401).json({ error: 'Please verify your identity first.' });
  if (!electionOpen()) return res.status(403).json({ error: 'Election is closed.' });
  if (!db.prepare('SELECT 1 FROM candidates WHERE candidate_id=?').get(req.body.candidateId)) return res.status(400).json({ error: 'Invalid candidate.' });
  let cast = false;
  db.exec('BEGIN IMMEDIATE');                    // atomic: mark VOTED + store vote together
  try {
    const r = db.prepare('UPDATE voters SET has_voted=1 WHERE voter_id=? AND has_voted=0').run(s.voterId);
    if (r.changes) { db.prepare('INSERT INTO votes (candidate_id) VALUES (?)').run(req.body.candidateId); cast = true; }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  sessions.delete(req.body.token);
  cast ? res.json({ message: 'Your vote has been recorded. Thank you!' }) : res.status(403).json({ error: 'You have already voted.' });
});

app.get('/api/stats', (_, res) => res.json({
  registered: db.prepare('SELECT COUNT(*) c FROM voters').get().c,
  voted: db.prepare('SELECT COUNT(*) c FROM voters WHERE has_voted=1').get().c,
  open: electionOpen()
}));

// 4. Result generation: COUNT votes GROUP BY candidate (published once election is closed)
app.get('/api/results', (req, res) => {
  const isAdmin = sessions.get(req.headers['x-token'])?.admin;
  if (electionOpen() && !isAdmin) return res.status(403).json({ error: 'Results are published after the election is closed.' });
  const rows = db.prepare(`SELECT c.candidate_id, c.name, c.party, COUNT(v.vote_id) votes
    FROM candidates c LEFT JOIN votes v ON v.candidate_id=c.candidate_id GROUP BY c.candidate_id ORDER BY votes DESC`).all();
  const top = rows[0]?.votes ?? 0;
  res.json({ results: rows, total: rows.reduce((n, r) => n + r.votes, 0), winners: top ? rows.filter(r => r.votes === top).map(r => r.name) : [] });
});

// Admin
app.post('/api/admin/login', (req, res) =>
  req.body.password === ADMIN_PASSWORD ? res.json({ token: newToken({ admin: true }) }) : res.status(401).json({ error: 'Wrong password.' }));
app.post('/api/admin/candidates', admin, (req, res) => {
  if (!req.body.name || !req.body.party) return res.status(400).json({ error: 'Name and party required.' });
  db.prepare('INSERT INTO candidates (name, party) VALUES (?,?)').run(req.body.name.trim(), req.body.party.trim());
  res.json({ message: 'Candidate added.' });
});
app.post('/api/admin/election', admin, (req, res) => {
  db.prepare("UPDATE settings SET value=? WHERE key='election_open'").run(req.body.open ? '1' : '0');
  res.json({ open: !!req.body.open });
});
app.get('/api/admin/voters', admin, (_, res) => res.json(db.prepare('SELECT voter_id, name, photo, has_voted FROM voters').all()));

app.delete('/api/admin/voters/:id', admin, (req, res) => {
  const r = db.prepare('DELETE FROM voters WHERE voter_id=?').run(req.params.id);
  r.changes ? res.json({ message: 'Voter deleted.' }) : res.status(404).json({ error: 'Voter not found.' });
});
app.post('/api/admin/reset', admin, (_, res) => {   // wipe voters + votes, reopen election
  db.exec("DELETE FROM votes; DELETE FROM voters; UPDATE settings SET value='1' WHERE key='election_open';");
  res.json({ message: 'All voters and votes cleared.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Voting Management System running at http://localhost:${PORT}`));
