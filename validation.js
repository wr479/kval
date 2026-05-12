/**
 * Общие правила валидации полей (зеркало ТЗ и клиентской части).
 */

const RE_LOGIN = /^[a-zA-Z0-9]{6,}$/;
const RE_FIO = /^[а-яА-ЯёЁ]+(?:\s+[а-яА-ЯёЁ]+)*$/;
const RE_PHONE = /^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PAYMENT_METHODS = new Set(['cash', 'phone_transfer']);
const STATUSES = new Set(['new', 'learning', 'done']);

function validateRegistration(payload) {
  const errors = [];
  const login = String(payload.login ?? '').trim();
  const password = String(payload.password ?? '');
  const fullName = String(payload.full_name ?? '').trim();
  const phone = String(payload.phone ?? '').trim();
  const email = String(payload.email ?? '').trim();

  if (!RE_LOGIN.test(login)) {
    errors.push('Логин: только латиница и цифры, не менее 6 символов.');
  }
  if (password.length < 8) {
    errors.push('Пароль: не менее 8 символов.');
  }
  if (!RE_FIO.test(fullName)) {
    errors.push('ФИО: только кириллица и пробелы между словами.');
  }
  if (!RE_PHONE.test(phone)) {
    errors.push('Телефон: формат 8(XXX)XXX-XX-XX.');
  }
  if (!RE_EMAIL.test(email)) {
    errors.push('Укажите корректный email.');
  }

  return {
    ok: errors.length === 0,
    errors,
    data: { login, password, full_name: fullName, phone, email },
  };
}

function validateApplication(payload) {
  const errors = [];
  const courseName = String(payload.course_name ?? '').trim();
  const startDate = String(payload.start_date ?? '').trim();
  const paymentMethod = String(payload.payment_method ?? '').trim();

  if (!courseName || courseName.length > 500) {
    errors.push('Укажите название курса.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    errors.push('Укажите дату начала в формате ГГГГ-ММ-ДД.');
  }
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    errors.push('Выберите способ оплаты: наличные или перевод по номеру телефона.');
  }

  return {
    ok: errors.length === 0,
    errors,
    data: { course_name: courseName, start_date: startDate, payment_method: paymentMethod },
  };
}

function validateReview(text) {
  const reviewText = String(text ?? '').trim();
  if (!reviewText) {
    return { ok: false, errors: ['Введите текст отзыва.'], data: '' };
  }
  if (reviewText.length > 4000) {
    return { ok: false, errors: ['Отзыв слишком длинный.'], data: '' };
  }
  return { ok: true, errors: [], data: reviewText };
}

function validateAdminStatus(status) {
  const s = String(status ?? '').trim();
  if (!STATUSES.has(s)) {
    return {
      ok: false,
      errors: ['Недопустимый статус: Новая, Идёт обучение или Обучение завершено.'],
      data: null,
    };
  }
  return { ok: true, errors: [], data: s };
}

module.exports = {
  RE_LOGIN,
  RE_FIO,
  RE_PHONE,
  RE_EMAIL,
  PAYMENT_METHODS,
  STATUSES,
  validateRegistration,
  validateApplication,
  validateReview,
  validateAdminStatus,
};
