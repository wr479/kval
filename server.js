/**
 * Express API + раздача статики. Сессии cookie для пользователя и администратора.
 */
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');
const {
  validateRegistration,
  validateApplication,
  validateReview,
  validateAdminStatus,
} = require('./validation');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const app = express();

app.use(express.json({ limit: '1mb' }));

app.use(
  session({
    name: 'korochki.sid',
    secret: process.env.SESSION_SECRET || 'korochki-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

function sendError(res, status, message, details) {
  const body = { error: message };
  if (details && details.length) body.details = details;
  return res.status(status).json(body);
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return sendError(res, 401, 'Требуется вход в систему.');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return sendError(res, 403, 'Доступ только для администратора.');
  }
  next();
}

/** Регистрация нового пользователя */
app.post('/api/register', (req, res) => {
  const v = validateRegistration(req.body);
  if (!v.ok) {
    return sendError(res, 400, 'Проверьте введённые данные.', v.errors);
  }
  const { login, password, full_name, phone, email } = v.data;
  try {
    const hash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare(
      `INSERT INTO users (login, password_hash, full_name, phone, email, is_admin)
       VALUES (?, ?, ?, ?, ?, 0)`
    );
    const info = stmt.run(login, hash, full_name, phone, email);
    return res.status(201).json({
      ok: true,
      message: 'Регистрация успешна. Теперь можно войти.',
      userId: Number(info.lastInsertRowid),
    });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return sendError(res, 409, 'Пользователь с таким логином уже существует.');
    }
    console.error(e);
    return sendError(res, 500, 'Ошибка сервера при сохранении.');
  }
});

/** Вход: обычный пользователь или Admin / KorokNET */
app.post('/api/login', (req, res) => {
  const login = String(req.body.login ?? '').trim();
  const password = String(req.body.password ?? '');
  if (!login || !password) {
    return sendError(res, 400, 'Введите логин и пароль.');
  }

  const row = db
    .prepare(`SELECT id, login, password_hash, full_name, is_admin FROM users WHERE login = ?`)
    .get(login);

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return sendError(res, 401, 'Неверный логин или пароль.');
  }

  req.session.userId = row.id;
  req.session.login = row.login;
  req.session.isAdmin = Boolean(row.is_admin);

  return res.json({
    ok: true,
    user: {
      id: row.id,
      login: row.login,
      full_name: row.full_name,
      is_admin: Boolean(row.is_admin),
    },
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('korochki.sid');
    res.json({ ok: true });
  });
});

app.get('/api/session', (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  const row = db
    .prepare(`SELECT id, login, full_name, is_admin FROM users WHERE id = ?`)
    .get(req.session.userId);
  if (!row) {
    req.session.destroy(() => {});
    return res.status(401).json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    user: {
      id: row.id,
      login: row.login,
      full_name: row.full_name,
      is_admin: Boolean(row.is_admin),
    },
  });
});

/** Заявки текущего пользователя */
app.get('/api/applications', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, course_name, start_date, payment_method, status, submitted_at, review_text
       FROM applications WHERE user_id = ? ORDER BY submitted_at DESC`
    )
    .all(req.session.userId);
  res.json({ applications: rows });
});

/** Новая заявка со статусом «Новая» */
app.post('/api/applications', requireAuth, (req, res) => {
  const v = validateApplication(req.body);
  if (!v.ok) {
    return sendError(res, 400, 'Проверьте данные заявки.', v.errors);
  }
  const { course_name, start_date, payment_method } = v.data;
  const submittedAt = new Date().toISOString();
  const insertApp = db.prepare(
    `INSERT INTO applications (user_id, course_name, start_date, payment_method, status, submitted_at)
     VALUES (?, ?, ?, ?, 'new', ?)`
  );
  const info = insertApp.run(req.session.userId, course_name, start_date, payment_method, submittedAt);

  const created = db
    .prepare(`SELECT * FROM applications WHERE id = ?`)
    .get(Number(info.lastInsertRowid));
  res.status(201).json({ ok: true, application: created });
});

/** Отзыв к заявке своей */
app.patch('/api/applications/:id/review', requireAuth, (req, res) => {
  const appId = Number(req.params.id);
  if (!Number.isInteger(appId) || appId < 1) {
    return sendError(res, 400, 'Некорректный номер заявки.');
  }
  const v = validateReview(req.body.review_text);
  if (!v.ok) {
    return sendError(res, 400, 'Проверьте отзыв.', v.errors);
  }

  const owner = db
    .prepare(`SELECT user_id FROM applications WHERE id = ?`)
    .get(appId);
  if (!owner) {
    return sendError(res, 404, 'Заявка не найдена.');
  }
  if (owner.user_id !== req.session.userId) {
    return sendError(res, 403, 'Можно оставить отзыв только к своей заявке.');
  }

  db.prepare(`UPDATE applications SET review_text = ? WHERE id = ?`).run(v.data, appId);
  const updated = db.prepare(`SELECT * FROM applications WHERE id = ?`).get(appId);
  res.json({ ok: true, application: updated });
});

/** Все заявки (админ) */
app.get('/api/admin/applications', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.id, a.course_name, a.start_date, a.payment_method, a.status, a.submitted_at,
              a.review_text, u.login AS user_login, u.full_name AS user_full_name
       FROM applications a
       JOIN users u ON u.id = a.user_id
       ORDER BY a.submitted_at DESC`
    )
    .all();
  res.json({ applications: rows });
});

/** Смена статуса заявки (админ). Тело: { status: "new"|"learning"|"done" } */
app.patch('/api/admin/applications/:id', requireAdmin, (req, res) => {
  let status = String(req.body.status ?? '').trim();
  if (status === 'finished') status = 'done';

  const v = validateAdminStatus(status);
  if (!v.ok) {
    return sendError(res, 400, v.errors[0] || 'Некорректный статус.', v.errors);
  }

  const appId = Number(req.params.id);
  if (!Number.isInteger(appId) || appId < 1) {
    return sendError(res, 400, 'Некорректный номер заявки.');
  }

  const existing = db.prepare(`SELECT id FROM applications WHERE id = ?`).get(appId);
  if (!existing) {
    return sendError(res, 404, 'Заявка не найдена.');
  }

  db.prepare(`UPDATE applications SET status = ? WHERE id = ?`).run(v.data, appId);
  const updated = db.prepare(`SELECT * FROM applications WHERE id = ?`).get(appId);
  res.json({ ok: true, application: updated });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Корочки.есть — http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Порт ${PORT} уже занят (часто это предыдущий запуск node server.js).\n` +
        `Варианты: закройте процесс, занимающий порт, или запустите на другом порту:\n` +
        `  Windows PowerShell:  $env:PORT=3001; npm start`
    );
    process.exit(1);
  }
  throw err;
});
