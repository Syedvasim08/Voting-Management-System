# Voting Management System

Web version of the **Voting Management System** project (SRM IST, Tiruchirappalli – 21CSC206P).
Technology for Transparent Voting.

**Team:** Kishore (RA2511056050022) · Niyas Ahmed (RA2511056050024) · Kathir Vel (RA2511056050052) · Syed Mohamed Vasim (RA2511056050030)
 
 **Guide:** Dr.R.Baskar,
 Associate professor,School of Computing,SRM IST Tiruchirappalli

## Features (from the report)
- Voter registration with Voter ID format validation and **duplicate Voter ID detection**
- **Image-based verification** (perceptual hash of the registered photo vs. the photo shown at login)
- **One-time voting** – status flips NOT VOTED → VOTED inside a single database transaction
- **Automatic result generation** – `COUNT(votes) GROUP BY candidate`, published after the election is closed
- Admin panel: add candidates, close/reopen election, view voter list

## Tech stack
| Layer | Technology |
|---|---|
| Front end | HTML, CSS, JavaScript |
| Back end | Node.js + Express (REST API) |
| Database | SQL (SQLite via Node's built-in `node:sqlite`, Node 22.5+; schema in `schema.sql`, portable to MySQL) |

## Run locally
```bash
npm install
npm start
# open http://localhost:3000
```
Admin password: `admin123` (change with `ADMIN_PASSWORD=yourpass npm start`).

## Demo flow
1. **Register** a voter (e.g. `ABC1234567`) with a photo → try again to see the duplicate alert
2. **Vote** → enter the ID + the same person's photo → pick a candidate → try again to see "already voted"
3. **Admin** → login → close the election
4. **Results** → see the winner and vote counts

## API
`POST /api/register` · `POST /api/login` · `GET /api/candidates` · `POST /api/vote` · `GET /api/stats` · `GET /api/results` · `POST /api/admin/login|candidates|election` · `GET /api/admin/voters`
