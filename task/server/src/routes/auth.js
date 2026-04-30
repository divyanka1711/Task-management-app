import express from "express";
import bcrypt from "bcryptjs";
import { query } from "../db.js";
import { requireAuth, signToken } from "../middleware/auth.js";

const router = express.Router();

function cleanUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

function validateSignup({ name, email, password }) {
  if (!name || name.trim().length < 2) {
    return "Name must be at least 2 characters";
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email";
  }

  if (!password || password.length < 6) {
    return "Password must be at least 6 characters";
  }

  return null;
}

router.post("/signup", async (req, res, next) => {
  try {
    const message = validateSignup(req.body);

    if (message) {
      return res.status(400).json({ message });
    }

    const name = req.body.name.trim();
    const email = normalizeEmail(req.body.email);
    const passwordHash = await bcrypt.hash(req.body.password, 10);

    const result = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, passwordHash]
    );

    const user = result.rows[0];

    return res.status(201).json({
      user: cleanUser(user),
      token: signToken(user)
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email already registered" });
    }

    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || "";

    const result = await query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    return res.json({
      user: cleanUser(user),
      token: signToken(user)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const result = await query("SELECT id, name, email FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user: cleanUser(user) });
  } catch (error) {
    return next(error);
  }
});

export default router;
