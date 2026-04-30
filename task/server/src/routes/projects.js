import express from "express";
import { query, transaction } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

function toInt(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function getMembership(projectId, userId) {
  const result = await query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId]
  );

  return result.rows[0] || null;
}

async function requireProjectAdmin(projectId, userId, res) {
  const membership = await getMembership(projectId, userId);

  if (!membership) {
    res.status(404).json({ message: "Project not found" });
    return null;
  }

  if (membership.role !== "admin") {
    res.status(403).json({ message: "Admin access required" });
    return null;
  }

  return membership;
}

router.get("/", async (req, res, next) => {
  try {
    const result = await query(
      `
        SELECT
          p.id,
          p.name,
          p.description,
          p.created_by,
          p.created_at,
          pm.role,
          COUNT(DISTINCT t.id)::INT AS task_count,
          COUNT(DISTINCT members.user_id)::INT AS member_count
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
        LEFT JOIN tasks t ON t.project_id = p.id
        LEFT JOIN project_members members ON members.project_id = p.id
        GROUP BY p.id, pm.role
        ORDER BY p.created_at DESC
      `,
      [req.user.id]
    );

    return res.json({ projects: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const name = (req.body.name || "").trim();
    const description = (req.body.description || "").trim();

    if (name.length < 2) {
      return res.status(400).json({ message: "Project name must be at least 2 characters" });
    }

    const project = await transaction(async (client) => {
      const projectResult = await client.query(
        "INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING *",
        [name, description, req.user.id]
      );

      await client.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'admin')",
        [projectResult.rows[0].id, req.user.id]
      );

      return projectResult.rows[0];
    });

    return res.status(201).json({
      project: {
        ...project,
        role: "admin",
        task_count: 0,
        member_count: 1
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const projectId = toInt(req.params.id);

    if (!projectId) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    const membership = await getMembership(projectId, req.user.id);

    if (!membership) {
      return res.status(404).json({ message: "Project not found" });
    }

    const result = await query("SELECT * FROM projects WHERE id = $1", [projectId]);

    return res.json({
      project: {
        ...result.rows[0],
        role: membership.role
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/members", async (req, res, next) => {
  try {
    const projectId = toInt(req.params.id);

    if (!projectId) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    const membership = await getMembership(projectId, req.user.id);

    if (!membership) {
      return res.status(404).json({ message: "Project not found" });
    }

    const result = await query(
      `
        SELECT u.id, u.name, u.email, pm.role, pm.joined_at
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = $1
        ORDER BY pm.role, u.name
      `,
      [projectId]
    );

    return res.json({ members: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/members", async (req, res, next) => {
  try {
    const projectId = toInt(req.params.id);
    const email = (req.body.email || "").trim().toLowerCase();
    const role = req.body.role === "admin" ? "admin" : "member";

    if (!projectId) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    if (!email) {
      return res.status(400).json({ message: "Member email is required" });
    }

    const admin = await requireProjectAdmin(projectId, req.user.id, res);

    if (!admin) {
      return null;
    }

    const userResult = await query("SELECT id, name, email FROM users WHERE email = $1", [email]);
    const member = userResult.rows[0];

    if (!member) {
      return res.status(404).json({ message: "User must sign up before joining a project" });
    }

    await query(
      `
        INSERT INTO project_members (project_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET role = EXCLUDED.role
      `,
      [projectId, member.id, role]
    );

    return res.status(201).json({ member: { ...member, role } });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/members/:userId", async (req, res, next) => {
  try {
    const projectId = toInt(req.params.id);
    const userId = toInt(req.params.userId);

    if (!projectId || !userId) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const admin = await requireProjectAdmin(projectId, req.user.id, res);

    if (!admin) {
      return null;
    }

    if (userId === req.user.id) {
      return res.status(400).json({ message: "Admin cannot remove themselves" });
    }

    const projectResult = await query("SELECT created_by FROM projects WHERE id = $1", [projectId]);

    if (projectResult.rows[0]?.created_by === userId) {
      return res.status(400).json({ message: "Project creator cannot be removed" });
    }

    await query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [projectId, userId]);

    return res.json({ message: "Member removed" });
  } catch (error) {
    return next(error);
  }
});

export default router;
