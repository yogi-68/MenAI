"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tantml:invoke>
<invoke name="useState, useEffect } from "react";
import { CheckCircle2, Circle, Edit2, Trash2, Clock, Plus, X, AlertCircle } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  scheduled_time: string | null;
  estimated_minutes: number | null;
  completed_at: string | null;
  auto_generated: boolean;
  goals: { title: string; category: string } | null;
}

export default function TasksPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["all-tasks"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await supabase
        .from("tasks")
        .select("*, goals(title, category)")
        .eq("user_id", user.id)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      return (data || []) as Task[];
    },
    staleTime: 30_000,
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "completed" ? "pending" : "completed";
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (updates: Partial<Task> & { id: string }) => {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      setIsEditing(null);
      setEditForm({});
    },
  });

  const createTask = useMutation({
    mutationFn: async (taskData: Partial<Task>) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskData),
      });
      if (!res.ok) throw new Error("Failed to create task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      setIsCreating(false);
      setEditForm({});
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tasks?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      setDeleteConfirm(null);
    },
  });

  const formatTime = (minutes: number | null) => {
    if (!minutes) return "No estimate";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const upcomingTasks = tasks?.filter(t => t.status !== "completed") || [];
  const completedTasks = tasks?.filter(t => t.status === "completed") || [];

  return (
    <div style={{ padding: "64px 48px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
            Tasks
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", marginTop: "12px", fontWeight: 300 }}>
            Manage your execution items
          </p>
        </div>
        <button
          onClick={() => {
            setIsCreating(true);
            setEditForm({ status: "pending", priority: "medium" });
          }}
          className="btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <Plus size={18} />
          New Task
        </button>
      </div>

      {/* Create/Edit Modal */}
      {(isCreating || isEditing) && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px"
        }} onClick={() => { setIsCreating(false); setIsEditing(null); setEditForm({}); }}>
          <div className="glass-card" style={{ padding: "32px", maxWidth: "600px", width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                {isCreating ? "Create Task" : "Edit Task"}
              </h2>
              <button
                onClick={() => { setIsCreating(false); setIsEditing(null); setEditForm({}); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "8px", display: "block" }}>
                  Title *
                </label>
                <input
                  type="text"
                  value={editForm.title || ""}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                  className="input-field"
                  style={{ width: "100%" }}
                  placeholder="What needs to be done?"
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "8px", display: "block" }}>
                  Description
                </label>
                <textarea
                  value={editForm.description || ""}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  className="input-field"
                  style={{ width: "100%", minHeight: "100px" }}
                  placeholder="Add details..."
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "8px", display: "block" }}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={editForm.due_date || ""}
                    onChange={e => setEditForm({ ...editForm, due_date: e.target.value })}
                    className="input-field"
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "8px", display: "block" }}>
                    Time Estimate (minutes)
                  </label>
                  <input
                    type="number"
                    value={editForm.estimated_minutes || ""}
                    onChange={e => setEditForm({ ...editForm, estimated_minutes: parseInt(e.target.value) || null })}
                    className="input-field"
                    style={{ width: "100%" }}
                    placeholder="60"
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "8px", display: "block" }}>
                  Priority
                </label>
                <select
                  value={editForm.priority || "medium"}
                  onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                  className="input-field"
                  style={{ width: "100%" }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <button
                  onClick={() => {
                    if (isCreating) {
                      createTask.mutate(editForm);
                    } else if (isEditing) {
                      updateTask.mutate({ ...editForm, id: isEditing });
                    }
                  }}
                  disabled={!editForm.title || createTask.isPending || updateTask.isPending}
                  className="btn-primary"
                  style={{ flex: 1 }}
                >
                  {createTask.isPending || updateTask.isPending ? "Saving..." : "Save Task"}
                </button>
                <button
                  onClick={() => { setIsCreating(false); setIsEditing(null); setEditForm({}); }}
                  className="btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px"
        }} onClick={() => setDeleteConfirm(null)}>
          <div className="glass-card" style={{ padding: "32px", maxWidth: "450px", width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
              <AlertCircle size={24} style={{ color: "#ef4444", marginTop: "2px" }} />
              <div>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "8px" }}>
                  Delete Task?
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.6 }}>
                  This action cannot be undone. The task will be permanently removed.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => deleteTask.mutate(deleteConfirm)}
                disabled={deleteTask.isPending}
                style={{
                  flex: 1,
                  padding: "12px 24px",
                  borderRadius: "var(--radius-md)",
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  cursor: deleteTask.isPending ? "wait" : "pointer",
                  fontSize: "0.95rem",
                  fontWeight: 500
                }}
              >
                {deleteTask.isPending ? "Deleting..." : "Delete"}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Tasks */}
      <section className="glass-card" style={{ padding: "40px", marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "28px", color: "var(--text-primary)" }}>
          Upcoming ({upcomingTasks.length})
        </h2>

        {isLoading ? (
          <div className="skeleton shimmer" style={{ height: "200px", width: "100%", borderRadius: "8px" }} />
        ) : upcomingTasks.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {upcomingTasks.map(task => (
              <div key={task.id} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "14px",
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-color)",
                transition: "all 0.3s ease"
              }}>
                <button
                  onClick={() => toggleTask.mutate({ id: task.id, status: task.status })}
                  style={{
                    marginTop: "2px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: "var(--text-muted)",
                    transition: "all 0.25s ease"
                  }}
                >
                  <Circle size={20} />
                </button>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "1rem", color: "var(--text-primary)", fontWeight: 400, marginBottom: "4px" }}>
                    {task.title}
                  </div>
                  {task.description && (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "8px", lineHeight: 1.6 }}>
                      {task.description}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {task.due_date && (
                      <span>{new Date(task.due_date).toLocaleDateString()}</span>
                    )}
                    {task.estimated_minutes && (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={12} /> {formatTime(task.estimated_minutes)}
                      </span>
                    )}
                    {task.priority && task.priority !== "medium" && (
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: task.priority === "high" ? "rgba(239, 68, 68, 0.1)" : "rgba(156, 163, 175, 0.1)",
                        color: task.priority === "high" ? "#ef4444" : "var(--text-muted)"
                      }}>
                        {task.priority}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      setIsEditing(task.id);
                      setEditForm(task);
                    }}
                    style={{
                      padding: "8px",
                      background: "none",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      transition: "all 0.2s ease"
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-primary)"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-color)"}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(task.id)}
                    style={{
                      padding: "8px",
                      background: "none",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      transition: "all 0.2s ease"
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = "#ef4444";
                      e.currentTarget.style.color = "#ef4444";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = "var(--border-color)";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
            No upcoming tasks. Create one to get started.
          </p>
        )}
      </section>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <section className="glass-card" style={{ padding: "40px" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "28px", color: "var(--text-primary)" }}>
            Completed ({completedTasks.length})
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {completedTasks.map(task => (
              <div key={task.id} style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "12px",
                opacity: 0.6,
                transition: "all 0.3s ease"
              }}>
                <button
                  onClick={() => toggleTask.mutate({ id: task.id, status: task.status })}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: "var(--accent-primary)"
                  }}
                >
                  <CheckCircle2 size={18} />
                </button>
                <span style={{
                  fontSize: "0.9rem",
                  color: "var(--text-muted)",
                  textDecoration: "line-through",
                  flex: 1
                }}>
                  {task.title}
                </span>
                <button
                  onClick={() => setDeleteConfirm(task.id)}
                  style={{
                    padding: "6px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    opacity: 0.5
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
