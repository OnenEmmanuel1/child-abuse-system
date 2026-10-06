# CADMS

Internal case management for authorized child protection personnel. This application uses Node.js, Express, EJS, HTML, JavaScript, Bootstrap 5, MySQL and Nginx.

## Technology choice

The original project objective mentions PHP and HTML forms. This implementation follows the required Node.js + Express.js + EJS pipeline instead. Forms submit to Express routes, and all database access uses parameterized `mysql2` queries.

## Local setup

1. Install Node.js 20+ and MySQL 8+.
2. Copy `.env.example` to `.env`; configure a random session secret of at least 32 characters. Local MySQL uses the `root` account with no database password.
3. Create the database and apply `db/schema.sql`.
4. Run `npm install`, then `npm run seed` to insert the fictional demo records.
5. Run `npm start` and open `http://localhost:3000/login`.

Demo accounts (change these passwords for any shared deployment):

| Role | Username | Password |
|---|---|---|
| Administrator | `admin` | `password123` |
| Caseworker | `jane.doe` | `password123` |
| Caseworker | `john.smith` | `password123` |

All seed data is fictional, uses placeholder identities and categorical case labels, and contains no realistic narrative case content. Do not use these credentials or demo data in a production deployment.

## Docker Compose and TLS

Set `SESSION_SECRET` in `.env`. The development Compose database uses a passwordless root account. Place a valid TLS certificate and private key at `certs/fullchain.pem` and `certs/privkey.pem` (obtain them from your certificate authority or ACME client), then run:

```sh
docker compose up --build -d
docker compose exec app npm run seed
```

Nginx redirects HTTP to HTTPS and proxies to the app. The application marks session cookies secure in production. The database uses a persistent Docker volume. Schema initialization runs when MySQL initializes a new volume; `npm run seed` is safe to re-run and skips an already populated database.

## Confidentiality notes

Caseworkers are restricted to assigned cases; administrators can oversee all cases and access aggregate-only reports. Case detail reads and record writes are sent to the audit engine. Accounts are provisioned by administrators; there is no public registration. Configure backups, database access, certificate renewal, and operational monitoring for the deployment environment.

## Environment variables

See `.env.example` for the app port, MySQL connection, session secret, bcrypt rounds, and Docker database passwords. Never commit `.env` or production secrets.
