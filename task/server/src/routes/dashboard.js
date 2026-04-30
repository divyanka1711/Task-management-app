import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

const accessibleTasksFrom = `
  FROM tasks t
  JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $1
  LEFT JOIN users u ON u.id = t.assigned_to
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE pm.role = 'admin' OR t.assigned_to = $1
`;

router.get("/", async (req, res, next) => {
  try {
    const [totalResult, statusResult, userResult, overdueResult] = await Promise.all([
      query(`SELECT COUNT(*)::INT AS count ${accessibleTasksFrom}`, [req.user.id]),
      query(`SELECT t.status, COUNT(*)::INT AS count ${accessibleTasksFrom} GROUP BY t.status`, [req.user.id]),
      query(
        `
          SELECT COALESCE(u.name, 'Unassigned') AS name, COUNT(*)::INT AS count
          ${accessibleTasksFrom}
          GROUP BY COALESCE(u.name, 'Unassigned')
          ORDER BY count DESC, name ASC
        `,
        [req.user.id]
      ),
      query(
        `
          SELECT t.id, t.title, t.due_date, t.status, p.name AS project_name
          ${accessibleTasksFrom}
          AND t.due_date < CURRENT_DATE
          AND t.status <> 'Done'
          ORDER BY t.due_date ASC
        `,
        [req.user.id]
      )
    ]);

    const byStatus = {
      "To Do": 0,
      "In Progress": 0,
      Done: 0
    };

    for (const row of statusResult.rows) {
      byStatus[row.status] = row.count;
    }

    return res.json({
      totalTasks: totalResult.rows[0].count,
      tasksByStatus: byStatus,
      tasksPerUser: userResult.rows,
      overdueTasks: overdueResult.rows
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
