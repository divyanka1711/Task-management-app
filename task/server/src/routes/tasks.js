import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

const statuses = ["To Do", "In Progress", "Done"];
const priorities = ["Low", "Medium", "High"];

function toInt(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanDate(value) {
  if (!value) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : false;
}

async function getMembership(projectId, userId) {
  const result = await query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId]
  );

  return result.rows[0] || null;
}

async function userBelongsToProject(projectId, userId) {
  if (!userId) {
    return true;
  }

  const result = await query(
    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId]
  );

  return result.rowCount > 0;
}

async function getTaskForUser(taskId, userId) {
  const result = await query(
    `
      SELECT t.*, pm.role AS project_role
      FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $2
      WHERE t.id = $1
    `,
    [taskId, userId]
  );

  return result.rows[0] || null;
}

router.get("/project/:projectId", async (req, res, next) => {
  try {
    const projectId = toInt(req.params.projectId);

    if (!projectId) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    const membership = await getMembership(projectId, req.user.id);

    if (!membership) {
      return res.status(404).json({ message: "Project not found" });
    }

    const params = [projectId];
    let memberFilter = "";

    if (membership.role !== "admin") {
      params.push(req.user.id);
      memberFilter = "AND t.assigned_to = $2";
    }

    const result = await query(
      `
        SELECT
          t.id,
          t.project_id,
          t.title,
          t.description,
          t.due_date,
          t.priority,
          t.status,
          t.assigned_to,
          t.created_by,
          t.created_at,
          t.updated_at,
          assignee.name AS assigned_name,
          creator.name AS created_by_name
        FROM tasks t
        LEFT JOIN users assignee ON assignee.id = t.assigned_to
        LEFT JOIN users creator ON creator.id = t.created_by
        WHERE t.project_id = $1 ${memberFilter}
        ORDER BY
          CASE t.status WHEN 'To Do' THEN 1 WHEN 'In Progress' THEN 2 ELSE 3 END,
          t.due_date NULLS LAST,
          t.created_at DESC
      `,
      params
    );

    return res.json({ tasks: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/project/:projectId", async (req, res, next) => {
  try {
    const projectId = toInt(req.params.projectId);
    const title = (req.body.title || "").trim();
    const description = (req.body.description || "").trim();
    const dueDate = cleanDate(req.body.dueDate);
    const priority = priorities.includes(req.body.priority) ? req.body.priority : "Medium";
    const assignedTo = req.body.assignedTo ? toInt(req.body.assignedTo) : null;

    if (!projectId) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    const membership = await getMembership(projectId, req.user.id);

    if (!membership) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (membership.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    if (title.length < 2) {
      return res.status(400).json({ message: "Task title must be at least 2 characters" });
    }

    if (dueDate === false) {
      return res.status(400).json({ message: "Due date must use YYYY-MM-DD" });
    }

    if (!(await userBelongsToProject(projectId, assignedTo))) {
      return res.status(400).json({ message: "Assigned user must be a project member" });
    }

    const result = await query(
      `
        INSERT INTO tasks (project_id, title, description, due_date, priority, assigned_to, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [projectId, title, description, dueDate, priority, assignedTo, req.user.id]
    );

    return res.status(201).json({ task: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const taskId = toInt(req.params.id);

    if (!taskId) {
      return res.status(400).json({ message: "Invalid task id" });
    }

    const task = await getTaskForUser(taskId, req.user.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.project_role !== "admin") {
      if (task.assigned_to !== req.user.id) {
        return res.status(403).json({ message: "You can update only assigned tasks" });
      }

      if (!statuses.includes(req.body.status)) {
        return res.status(400).json({ message: "Members can update status only" });
      }

      const result = await query(
        "UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        [req.body.status, taskId]
      );

      return res.json({ task: result.rows[0] });
    }

    const updates = [];
    const values = [];

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();

      if (title.length < 2) {
        return res.status(400).json({ message: "Task title must be at least 2 characters" });
      }

      values.push(title);
      updates.push(`title = $${values.length}`);
    }

    if (req.body.description !== undefined) {
      values.push(String(req.body.description || "").trim());
      updates.push(`description = $${values.length}`);
    }

    if (req.body.dueDate !== undefined) {
      const dueDate = cleanDate(req.body.dueDate);

      if (dueDate === false) {
        return res.status(400).json({ message: "Due date must use YYYY-MM-DD" });
      }

      values.push(dueDate);
      updates.push(`due_date = $${values.length}`);
    }

    if (req.body.priority !== undefined) {
      if (!priorities.includes(req.body.priority)) {
        return res.status(400).json({ message: "Invalid priority" });
      }

      values.push(req.body.priority);
      updates.push(`priority = $${values.length}`);
    }

    if (req.body.status !== undefined) {
      if (!statuses.includes(req.body.status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      values.push(req.body.status);
      updates.push(`status = $${values.length}`);
    }

    if (req.body.assignedTo !== undefined) {
      const assignedTo = req.body.assignedTo ? toInt(req.body.assignedTo) : null;

      if (!(await userBelongsToProject(task.project_id, assignedTo))) {
        return res.status(400).json({ message: "Assigned user must be a project member" });
      }

      values.push(assignedTo);
      updates.push(`assigned_to = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No task updates provided" });
    }

    values.push(taskId);

    const result = await query(
      `UPDATE tasks SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );

    return res.json({ task: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const taskId = toInt(req.params.id);

    if (!taskId) {
      return res.status(400).json({ message: "Invalid task id" });
    }

    const task = await getTaskForUser(taskId, req.user.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.project_role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    await query("DELETE FROM tasks WHERE id = $1", [taskId]);

    return res.json({ message: "Task deleted" });
  } catch (error) {
    return next(error);
  }
});

export default router;
