require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const path = require('path');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be set to at least 32 characters.');
}
const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'style-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'], 'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'], 'img-src': ["'self'", 'data:', 'https://d1csarkz8obe9u.cloudfront.net'], 'script-src': ["'self'", 'https://cdn.jsdelivr.net'] } } }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ name: 'cadms.sid', secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 60 * 1000 } }));
app.use(flash());
app.use((req, res, next) => { res.locals.currentUser = req.session.user || null; next(); });
app.use('/', require('./routes/authRoutes'));
app.use('/', require('./routes/pageRoutes'));
app.use('/api', require('./routes/apiRoutes'));
app.use((req, res) => res.status(404).send('Page not found.'));
app.use((err, req, res, next) => { console.error('[CADMS] Request failed:', err.message); res.status(500).send('The request could not be completed.'); });

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`[CADMS] Listening on port ${port}`));
