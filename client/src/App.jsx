import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock3,
  LogOut,
  Plus,
  Trash2,
  UserPlus,
  Users
} from "lucide-react";
import { api } from "./api.js";

const statuses = ["To Do", "In Progress", "Done"];
const priorities = ["Low", "Medium", "High"];
const blankTask = {
  title: "",
  description: "",
  dueDate: "",
  priority: "Medium",
  assignedTo: ""
};

function formatDate(value) {
  if (!value) {
    return "No due date";
  }

  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function statusIcon(status) {
  if (status === "Done") {
    return <CheckCircle2 size={18} />;
  }

  if (status === "In Progress") {
    return <Clock3 size={18} />;
  }

  return <Circle size={18} />;
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api(`/auth/${mode}`, {
        method: "POST",
        body: form
      });

      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Team Task App</p>
          <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">
            Login
          </button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")} type="button">
            Signup
          </button>
        </div>

        <form className="stack" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Name
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Your name"
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="name@example.com"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="Minimum 6 characters"
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="primary wide" disabled={loading} type="submit">
            {loading ? "Please wait" : mode === "login" ? "Login" : "Signup"}
          </button>
        </form>
      </section>
    </main>
  );
}

function StatCard({ label, value }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("team_task_token"));
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const [memberForm, setMemberForm] = useState({ email: "", role: "member" });
  const [taskForm, setTaskForm] = useState(blankTask);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  function authHeaders() {
    return { token };
  }

  async function loadMain() {
    if (!token) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [meData, projectData, dashboardData] = await Promise.all([
        api("/auth/me", authHeaders()),
        api("/projects", authHeaders()),
        api("/dashboard", authHeaders())
      ]);

      setUser(meData.user);
      setProjects(projectData.projects);
      setDashboard(dashboardData);

      if (!selectedProjectId && projectData.projects.length > 0) {
        setSelectedProjectId(projectData.projects[0].id);
      }
    } catch (err) {
      setError(err.message);

      if (err.message.toLowerCase().includes("token") || err.message.toLowerCase().includes("login")) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadProject(projectId) {
    if (!token || !projectId) {
      setMembers([]);
      setTasks([]);
      return;
    }

    try {
      const [memberData, taskData] = await Promise.all([
        api(`/projects/${projectId}/members`, authHeaders()),
        api(`/tasks/project/${projectId}`, authHeaders())
      ]);

      setMembers(memberData.members);
      setTasks(taskData.tasks);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadMain();
  }, [token]);

  useEffect(() => {
    loadProject(selectedProjectId);
  }, [selectedProjectId, token]);

  function handleAuth(data) {
    localStorage.setItem("team_task_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("team_task_token");
    setToken(null);
    setUser(null);
    setProjects([]);
    setSelectedProjectId(null);
    setMembers([]);
    setTasks([]);
    setDashboard(null);
  }

  async function createProject(event) {
    event.preventDefault();
    setError("");

    try {
      const data = await api("/projects", {
        ...authHeaders(),
        method: "POST",
        body: projectForm
      });

      setProjects([data.project, ...projects]);
      setProjectForm({ name: "", description: "" });
      setSelectedProjectId(data.project.id);
      await loadMain();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addMember(event) {
    event.preventDefault();

    if (!selectedProject) {
      return;
    }

    setError("");

    try {
      await api(`/projects/${selectedProject.id}/members`, {
        ...authHeaders(),
        method: "POST",
        body: memberForm
      });

      setMemberForm({ email: "", role: "member" });
      await Promise.all([loadProject(selectedProject.id), loadMain()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeMember(userId) {
    if (!selectedProject) {
      return;
    }

    setError("");

    try {
      await api(`/projects/${selectedProject.id}/members/${userId}`, {
        ...authHeaders(),
        method: "DELETE"
      });

      await Promise.all([loadProject(selectedProject.id), loadMain()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createTask(event) {
    event.preventDefault();

    if (!selectedProject) {
      return;
    }

    setError("");

    try {
      await api(`/tasks/project/${selectedProject.id}`, {
        ...authHeaders(),
        method: "POST",
        body: {
          ...taskForm,
          assignedTo: taskForm.assignedTo ? Number(taskForm.assignedTo) : null
        }
      });

      setTaskForm(blankTask);
      await Promise.all([loadProject(selectedProject.id), loadMain()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateTask(taskId, changes) {
    setError("");

    try {
      await api(`/tasks/${taskId}`, {
        ...authHeaders(),
        method: "PATCH",
        body: changes
      });

      await Promise.all([loadProject(selectedProject.id), loadMain()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTask(taskId) {
    setError("");

    try {
      await api(`/tasks/${taskId}`, {
        ...authHeaders(),
        method: "DELETE"
      });

      await Promise.all([loadProject(selectedProject.id), loadMain()]);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!token) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  const isAdmin = selectedProject?.role === "admin";
  const overdueCount = dashboard?.overdueTasks?.length || 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Team Task App</p>
          <h1>Workspace</h1>
        </div>
        <div className="user-menu">
          <span>{user?.name}</span>
          <button className="icon-button" onClick={logout} title="Logout" type="button">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      <section className="stats-grid">
        <StatCard label="Total Tasks" value={dashboard?.totalTasks || 0} />
        <StatCard label="To Do" value={dashboard?.tasksByStatus?.["To Do"] || 0} />
        <StatCard label="In Progress" value={dashboard?.tasksByStatus?.["In Progress"] || 0} />
        <StatCard label="Done" value={dashboard?.tasksByStatus?.Done || 0} />
        <StatCard label="Overdue" value={overdueCount} />
      </section>

      <section className="workspace-grid">
        <aside className="panel">
          <div className="panel-heading">
            <h2>Projects</h2>
            {loading && <span className="muted">Loading</span>}
          </div>

          <form className="stack compact" onSubmit={createProject}>
            <label>
              Name
              <input
                value={projectForm.name}
                onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
                placeholder="Website launch"
              />
            </label>
            <label>
              Description
              <textarea
                value={projectForm.description}
                onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
                placeholder="Project notes"
                rows="3"
              />
            </label>
            <button className="primary" type="submit">
              <Plus size={18} />
              Create Project
            </button>
          </form>

          <div className="project-list">
            {projects.map((project) => (
              <button
                className={`project-item ${selectedProjectId === project.id ? "active" : ""}`}
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                type="button"
              >
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.member_count} members</small>
                </span>
                <em>{project.role === "admin" ? "Admin" : "Member"}</em>
              </button>
            ))}
          </div>
        </aside>

        <section className="main-panel">
          {!selectedProject ? (
            <div className="empty-state">
              <h2>No project selected</h2>
              <p>Create a project to start adding members and tasks.</p>
            </div>
          ) : (
            <>
              <div className="project-header">
                <div>
                  <h2>{selectedProject.name}</h2>
                  <p>{selectedProject.description || "No description"}</p>
                </div>
                <span className="role-pill">{isAdmin ? "Admin" : "Member"}</span>
              </div>

              <div className="content-grid">
                <section className="panel flat">
                  <div className="panel-heading">
                    <h3>
                      <Users size={18} />
                      Members
                    </h3>
                  </div>

                  {isAdmin && (
                    <form className="inline-form" onSubmit={addMember}>
                      <input
                        type="email"
                        value={memberForm.email}
                        onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })}
                        placeholder="member@example.com"
                      />
                      <select
                        value={memberForm.role}
                        onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value })}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="icon-button filled" title="Add member" type="submit">
                        <UserPlus size={18} />
                      </button>
                    </form>
                  )}

                  <div className="member-list">
                    {members.map((member) => (
                      <div className="member-row" key={member.id}>
                        <span>
                          <strong>{member.name}</strong>
                          <small>{member.email}</small>
                        </span>
                        <div className="row-actions">
                          <em>{member.role === "admin" ? "Admin" : "Member"}</em>
                          {isAdmin && member.id !== user?.id && (
                            <button
                              className="icon-button"
                              onClick={() => removeMember(member.id)}
                              title="Remove member"
                              type="button"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {isAdmin && (
                  <section className="panel flat">
                    <div className="panel-heading">
                      <h3>
                        <Plus size={18} />
                        New Task
                      </h3>
                    </div>

                    <form className="stack compact" onSubmit={createTask}>
                      <label>
                        Title
                        <input
                          value={taskForm.title}
                          onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
                          placeholder="Design dashboard"
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          value={taskForm.description}
                          onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
                          placeholder="Task details"
                          rows="3"
                        />
                      </label>
                      <div className="form-row">
                        <label>
                          Due Date
                          <input
                            type="date"
                            value={taskForm.dueDate}
                            onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })}
                          />
                        </label>
                        <label>
                          Priority
                          <select
                            value={taskForm.priority}
                            onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}
                          >
                            {priorities.map((priority) => (
                              <option key={priority} value={priority}>
                                {priority}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label>
                        Assign To
                        <select
                          value={taskForm.assignedTo}
                          onChange={(event) => setTaskForm({ ...taskForm, assignedTo: event.target.value })}
                        >
                          <option value="">Unassigned</option>
                          {members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="primary" type="submit">
                        <Plus size={18} />
                        Add Task
                      </button>
                    </form>
                  </section>
                )}
              </div>

              <section className="tasks-section">
                <div className="panel-heading">
                  <h3>Tasks</h3>
                  <span className="muted">{tasks.length} shown</span>
                </div>

                <div className="task-list">
                  {tasks.map((task) => (
                    <article className="task-card" key={task.id}>
                      <div className="task-main">
                        <div className={`status-icon ${task.status.replaceAll(" ", "-").toLowerCase()}`}>
                          {statusIcon(task.status)}
                        </div>
                        <div>
                          <h4>{task.title}</h4>
                          <p>{task.description || "No description"}</p>
                          <div className="task-meta">
                            <span>{formatDate(task.due_date)}</span>
                            <span>{task.priority}</span>
                            <span>{task.assigned_name || "Unassigned"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="task-actions">
                        <select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value })}>
                          {statuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>

                        {isAdmin && (
                          <>
                            <select
                              value={task.assigned_to || ""}
                              onChange={(event) =>
                                updateTask(task.id, {
                                  assignedTo: event.target.value ? Number(event.target.value) : null
                                })
                              }
                            >
                              <option value="">Unassigned</option>
                              {members.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.name}
                                </option>
                              ))}
                            </select>
                            <button className="icon-button" onClick={() => deleteTask(task.id)} title="Delete task" type="button">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}

                  {tasks.length === 0 && (
                    <div className="empty-state">
                      <h3>No tasks</h3>
                      <p>{isAdmin ? "Create the first task for this project." : "No assigned tasks in this project."}</p>
                    </div>
                  )}
                </div>
              </section>

              {dashboard?.tasksPerUser?.length > 0 && (
                <section className="summary-strip">
                  <h3>Tasks Per User</h3>
                  {dashboard.tasksPerUser.map((row) => (
                    <span key={row.name}>
                      {row.name}: {row.count}
                    </span>
                  ))}
                </section>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
