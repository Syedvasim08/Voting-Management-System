CREATE TABLE IF NOT EXISTS voters (
  voter_id   TEXT PRIMARY KEY,            -- unique Voter ID (duplicate detection)
  name       TEXT NOT NULL,
  photo      TEXT NOT NULL,               -- registered image (data URL)
  img_hash   TEXT NOT NULL,               -- 64-bit perceptual hash of the image
  has_voted  INTEGER NOT NULL DEFAULT 0   -- 0 = NOT VOTED, 1 = VOTED
);
CREATE TABLE IF NOT EXISTS candidates (
  candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL,
  party TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS votes (        -- anonymous: no link to voter
  vote_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(candidate_id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
INSERT OR IGNORE INTO settings VALUES ('election_open','1');
