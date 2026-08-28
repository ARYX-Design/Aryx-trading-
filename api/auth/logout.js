/* POST /api/auth/logout — clears the session cookie. */
const { json, clearSessionCookie } = require('../_lib/util');

module.exports = async function handler(req, res) {
  clearSessionCookie(res);
  return json(res, 200, { ok: true });
};
