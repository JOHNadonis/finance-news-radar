"use client";

import { useState, useEffect, useCallback } from "react";

type AdminTab = "groups" | "keys";

interface ModelGroupRow {
  id: number;
  name: string;
  api_base_url: string;
  api_key: string; // masked
  model_name: string;
  created_at: string;
}

interface AccessKeyRow {
  id: number;
  key_value: string;
  label: string | null;
  model_group_id: number;
  group_name: string;
  model_name: string;
  is_active: number;
  created_at: string;
  last_used_at: string | null;
}

export default function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<AdminTab>("groups");

  // Model groups
  const [groups, setGroups] = useState<ModelGroupRow[]>([]);
  const [newGroup, setNewGroup] = useState({ name: "", api_base_url: "", api_key: "", model_name: "" });

  // Access keys
  const [keys, setKeys] = useState<AccessKeyRow[]>([]);
  const [newKeyGroupId, setNewKeyGroupId] = useState<number | "">("");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/groups");
      if (res.status === 401) {
        setIsLoggedIn(false);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) setGroups(data);
    } catch {
      // ignore
    }
  }, []);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/keys");
      if (res.status === 401) {
        setIsLoggedIn(false);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) setKeys(data);
    } catch {
      // ignore
    }
  }, []);

  // Check auth on load
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/groups");
      if (res.ok) {
        setIsLoggedIn(true);
        const data = await res.json();
        if (Array.isArray(data)) setGroups(data);
      }
    })();
  }, []);

  // Refresh data when logged in
  useEffect(() => {
    if (isLoggedIn) {
      fetchGroups();
      fetchKeys();
    }
  }, [isLoggedIn, fetchGroups, fetchKeys]);

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsLoggedIn(true);
        setPassword("");
      } else {
        setLoginError(data.error || "登录失败");
      }
    } catch {
      setLoginError("请求失败");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAddGroup = async () => {
    const { name, api_base_url, api_key, model_name } = newGroup;
    if (!name || !api_base_url || !api_key || !model_name) return;

    try {
      const res = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newGroup),
      });
      if (res.ok) {
        setNewGroup({ name: "", api_base_url: "", api_key: "", model_name: "" });
        fetchGroups();
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteGroup = async (id: number) => {
    if (!confirm("确定删除该模型组？关联的密钥也会被删除。")) return;
    try {
      await fetch(`/api/admin/groups?id=${id}`, { method: "DELETE" });
      fetchGroups();
      fetchKeys();
    } catch {
      // ignore
    }
  };

  const handleGenerateKey = async () => {
    if (!newKeyGroupId) return;
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_group_id: Number(newKeyGroupId),
          ...(newKeyLabel ? { label: newKeyLabel } : {}),
        }),
      });
      if (res.ok) {
        setNewKeyLabel("");
        fetchKeys();
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteKey = async (id: number) => {
    if (!confirm("确定删除该密钥？")) return;
    try {
      await fetch(`/api/admin/keys?id=${id}`, { method: "DELETE" });
      fetchKeys();
    } catch {
      // ignore
    }
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Login form
  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--color-line)] bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-xl font-bold text-[var(--foreground)]">
            Admin 登录
          </h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="请输入管理密码"
            className="mb-4 w-full rounded-xl border border-[var(--color-line)]
              bg-[rgba(255,255,255,0.8)] px-4 py-3 text-sm text-[var(--foreground)]
              placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent-2)]
              focus:outline-none"
          />
          {loginError && (
            <p className="mb-3 text-sm text-[var(--color-down)]">{loginError}</p>
          )}
          <button
            onClick={handleLogin}
            disabled={loggingIn || !password}
            className="w-full cursor-pointer rounded-xl bg-[var(--color-accent-2)] px-4 py-3
              text-sm font-medium text-white transition-all hover:opacity-90
              disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loggingIn ? "登录中..." : "登录"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold text-[var(--foreground)]">
          Admin 管理面板
        </h1>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl border border-[var(--color-line)] bg-white p-1">
          <button
            onClick={() => setTab("groups")}
            className={`flex-1 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              tab === "groups"
                ? "bg-[var(--color-accent-2)] text-white"
                : "text-[var(--color-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            模型组管理
          </button>
          <button
            onClick={() => setTab("keys")}
            className={`flex-1 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              tab === "keys"
                ? "bg-[var(--color-accent-2)] text-white"
                : "text-[var(--color-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            密钥管理
          </button>
        </div>

        {/* Model Groups Tab */}
        {tab === "groups" && (
          <div className="space-y-6">
            {/* Add form */}
            <div className="rounded-2xl border border-[var(--color-line)] bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-[var(--foreground)]">
                添加模型组
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  placeholder="组名称 (如: GPT-4o)"
                  className="rounded-xl border border-[var(--color-line)] bg-[rgba(255,255,255,0.8)]
                    px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)]
                    focus:border-[var(--color-accent-2)] focus:outline-none"
                />
                <input
                  type="text"
                  value={newGroup.api_base_url}
                  onChange={(e) => setNewGroup({ ...newGroup, api_base_url: e.target.value })}
                  placeholder="API Base URL"
                  className="rounded-xl border border-[var(--color-line)] bg-[rgba(255,255,255,0.8)]
                    px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)]
                    focus:border-[var(--color-accent-2)] focus:outline-none"
                />
                <input
                  type="password"
                  value={newGroup.api_key}
                  onChange={(e) => setNewGroup({ ...newGroup, api_key: e.target.value })}
                  placeholder="API Key"
                  className="rounded-xl border border-[var(--color-line)] bg-[rgba(255,255,255,0.8)]
                    px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)]
                    focus:border-[var(--color-accent-2)] focus:outline-none"
                />
                <input
                  type="text"
                  value={newGroup.model_name}
                  onChange={(e) => setNewGroup({ ...newGroup, model_name: e.target.value })}
                  placeholder="模型名称 (如: gpt-4o)"
                  className="rounded-xl border border-[var(--color-line)] bg-[rgba(255,255,255,0.8)]
                    px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)]
                    focus:border-[var(--color-accent-2)] focus:outline-none"
                />
              </div>
              <button
                onClick={handleAddGroup}
                disabled={!newGroup.name || !newGroup.api_base_url || !newGroup.api_key || !newGroup.model_name}
                className="mt-4 cursor-pointer rounded-xl bg-[var(--color-accent-2)] px-5 py-2.5
                  text-sm font-medium text-white transition-all hover:opacity-90
                  disabled:cursor-not-allowed disabled:opacity-50"
              >
                添加
              </button>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-line)] bg-[rgba(0,0,0,0.02)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">名称</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">Base URL</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">API Key</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">模型</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">创建时间</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-muted)]">
                        暂无模型组
                      </td>
                    </tr>
                  ) : (
                    groups.map((g) => (
                      <tr key={g.id} className="border-b border-[var(--color-line)] last:border-0">
                        <td className="px-4 py-3 font-medium text-[var(--foreground)]">{g.name}</td>
                        <td className="max-w-[160px] truncate px-4 py-3 text-[var(--color-muted)]">{g.api_base_url}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--color-muted)]">{g.api_key}</td>
                        <td className="px-4 py-3 text-[var(--foreground)]">{g.model_name}</td>
                        <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{g.created_at}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteGroup(g.id)}
                            className="cursor-pointer text-xs text-[var(--color-down)] transition-opacity hover:opacity-70"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Access Keys Tab */}
        {tab === "keys" && (
          <div className="space-y-6">
            {/* Generate form */}
            <div className="rounded-2xl border border-[var(--color-line)] bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-[var(--foreground)]">
                生成密钥
              </h2>
              <div className="flex items-end gap-3">
                <label className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
                    选择模型组
                  </span>
                  <select
                    value={newKeyGroupId}
                    onChange={(e) => setNewKeyGroupId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full rounded-xl border border-[var(--color-line)] bg-[rgba(255,255,255,0.8)]
                      px-3 py-2.5 text-sm text-[var(--foreground)]
                      focus:border-[var(--color-accent-2)] focus:outline-none"
                  >
                    <option value="">请选择...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.model_name})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
                    标签 (可选)
                  </span>
                  <input
                    type="text"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    placeholder="如: 测试用户A"
                    className="w-full rounded-xl border border-[var(--color-line)] bg-[rgba(255,255,255,0.8)]
                      px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)]
                      focus:border-[var(--color-accent-2)] focus:outline-none"
                  />
                </label>
                <button
                  onClick={handleGenerateKey}
                  disabled={!newKeyGroupId}
                  className="shrink-0 cursor-pointer rounded-xl bg-[var(--color-accent-2)] px-5 py-2.5
                    text-sm font-medium text-white transition-all hover:opacity-90
                    disabled:cursor-not-allowed disabled:opacity-50"
                >
                  生成密钥
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-line)] bg-[rgba(0,0,0,0.02)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">密钥</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">标签</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">模型组</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">模型</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">状态</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--color-muted)]">最后使用</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[var(--color-muted)]">
                        暂无密钥
                      </td>
                    </tr>
                  ) : (
                    keys.map((k) => (
                      <tr key={k.id} className="border-b border-[var(--color-line)] last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <code className="max-w-[140px] truncate rounded bg-[rgba(0,0,0,0.04)] px-1.5 py-0.5 font-mono text-xs text-[var(--foreground)]">
                              {k.key_value}
                            </code>
                            <button
                              onClick={() => copyToClipboard(k.key_value, k.id)}
                              className="shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-xs
                                text-[var(--color-accent-2)] transition-colors hover:bg-[rgba(15,111,127,0.08)]"
                            >
                              {copiedId === k.id ? "已复制" : "复制"}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--foreground)]">{k.label || "-"}</td>
                        <td className="px-4 py-3 text-[var(--foreground)]">{k.group_name}</td>
                        <td className="px-4 py-3 text-[var(--foreground)]">{k.model_name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              k.is_active
                                ? "bg-[rgba(0,200,83,0.1)] text-[var(--color-up)]"
                                : "bg-[rgba(255,23,68,0.1)] text-[var(--color-down)]"
                            }`}
                          >
                            {k.is_active ? "活跃" : "停用"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--color-muted)]">
                          {k.last_used_at || "从未"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteKey(k.id)}
                            className="cursor-pointer text-xs text-[var(--color-down)] transition-opacity hover:opacity-70"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
