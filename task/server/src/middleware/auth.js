import jwt from "jsonwebtoken";

const fallbackSecret = "dev_secret_change_me";

export function getJwtSecret() {
  return process.env.JWT_SECRET || fallbackSecret;
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Login required" });
  }

  try {
    req.user = jwt.verify(token, getJwtSecret());
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
