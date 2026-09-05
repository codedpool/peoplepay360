const { verifyAccessToken } = require("../lib/jwt");

// A forced password change has to be a server-side gate, not just a client
// redirect — otherwise an admin-set password stays a fully working credential
// for anyone who skips the UI and calls the API directly. The only thing a
// gated session may do is set its own new password.
const PASSWORD_CHANGE_EXEMPT_PATHS = new Set(["/api/auth/change-password"]);

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired access token" });
  }

  req.user = {
    id: payload.sub,
    roles: payload.roles,
    employeeId: payload.employeeId,
    mustChangePassword: payload.mustChangePassword === true,
  };

  if (req.user.mustChangePassword) {
    const path = req.originalUrl.split("?")[0];
    if (!PASSWORD_CHANGE_EXEMPT_PATHS.has(path)) {
      // 428 Precondition Required: the request is well-formed and the caller
      // is authenticated, but a prerequisite step is outstanding. A bare 403
      // would be indistinguishable from a permissions problem, and the client
      // needs to tell those apart to know it should route to the change form.
      return res.status(428).json({
        error: "Password change required before continuing",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    }
  }

  next();
}

module.exports = { requireAuth, PASSWORD_CHANGE_EXEMPT_PATHS };
