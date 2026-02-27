const { useState, useEffect } = React;

async function readErrorMessage(res) {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
  } catch {
    // ignore
  }
  return `Request failed (${res.status})`;
}

const api = {
  async getGuidelines() {
    const res = await fetch('/api/guidelines');
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const data = await res.json();
    return data.guidelines || [];
  },
  async getLogs() {
    const res = await fetch('/api/logs');
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const data = await res.json();
    return data.logs || [];
  },
  async createLog(payload) {
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const data = await res.json();
    return data.entry;
  },
  async updateReflection(id, reflection) {
    const res = await fetch(`/api/logs/${id}/reflection`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reflection })
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const data = await res.json();
    return data.entry;
  },
  async getDeclaration() {
    const res = await fetch('/api/declaration');
    if (!res.ok) throw new Error(await readErrorMessage(res));
    return res.json();
  },
  async deleteLog(id) {
    const res = await fetch(`/api/logs/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await readErrorMessage(res));
  }
};

function StatusPill({ compliance }) {
  if (!compliance) return null;
  const cls = compliance.status === 'compliant' ? 'ok' : 'warn';
  const label = compliance.status === 'compliant' ? 'Compliant' : 'Needs review';
  return <span className={`pill ${cls}`}>{label}</span>;
}

function LogCard({ entry, onReflection, onDelete }) {
  const [draft, setDraft] = useState(entry.reflection || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await onReflection(entry.id, draft);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = window.confirm('Delete this log entry?');
    if (!ok) return;
    setDeleteBusy(true);
    setError('');
    try {
      await onDelete(entry.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="card stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
        <div>
          <div className="pill">{entry.tool || 'Unknown tool'}</div>
          <div className="meta">{new Date(entry.timestamp).toLocaleString()}</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="icon-button"
            onClick={remove}
            aria-label="Delete log"
            title="Delete"
            disabled={deleteBusy}
          >
            🗑️
          </button>
          <StatusPill compliance={entry.compliance} />
        </div>
      </div>
      <div>
        <strong>Prompt</strong>
        <p>{entry.prompt}</p>
        {entry.compliance?.reasons?.length ? (
          <div className="reasons">
            <strong>Why flagged:</strong>
            <ul>
              {entry.compliance.reasons.map((r, idx) => <li key={idx}>{r}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="reflection">
        <h4>Reflection / description</h4>
        <textarea
          value={draft}
          placeholder="What did the AI output change?"
          onChange={(e) => setDraft(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save reflection'}</button>
          {saved && <span className="meta">Saved</span>}
          {error && <span className="error">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [guidelines, setGuidelines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [declaration, setDeclaration] = useState(null);
  const [form, setForm] = useState({ tool: '', prompt: '', reflection: '' });
  const [busy, setBusy] = useState(false);
  const [declBusy, setDeclBusy] = useState(false);
  const [declUpdated, setDeclUpdated] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getGuidelines().then(setGuidelines).catch((err) => setError(err.message));
    refreshLogs();
    refreshDeclaration();
  }, []);

  const refreshLogs = () => {
    api.getLogs().then(setLogs).catch((err) => setError(err.message));
  };

  const refreshDeclaration = () => {
    setDeclBusy(true);
    setError('');
    api.getDeclaration()
      .then((data) => {
        setDeclaration(data);
        setDeclUpdated(new Date().toLocaleTimeString());
      })
      .catch((err) => setError(err.message))
      .finally(() => setDeclBusy(false));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const entry = await api.createLog({ ...form });
      setLogs((prev) => [entry, ...prev]);
      setForm({ tool: '', prompt: '', reflection: '' });
      refreshDeclaration();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReflection = async (id, reflection) => {
    const updated = await api.updateReflection(id, reflection);
    setLogs((prev) => prev.map((item) => item.id === id ? updated : item));
    refreshDeclaration();
  };

  const handleDelete = async (id) => {
    await api.deleteLog(id);
    setLogs((prev) => prev.filter((item) => item.id !== id));
    refreshDeclaration();
  };

  return (
    <div className="shell">
      <header>
        <div>
          <h1>AI Usage Logger</h1>
        </div>
      </header>

      {error && <div className="card error">{error}</div>}

      <div className="grid-two">
        <div className="card stack">
          <h3>Log a prompt</h3>
          <form className="stack" onSubmit={submit}>
            <div>
              <label htmlFor="tool">AI tool</label>
              <input
                id="tool"
                value={form.tool}
                onChange={(e) => setForm({ ...form, tool: e.target.value })}
                placeholder="e.g. ChatGPT"
                required
              />
            </div>
            <div>
              <label htmlFor="prompt">Prompt</label>
              <textarea
                id="prompt"
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                placeholder="Paste the exact prompt used"
                required
              />
            </div>
            <div>
              <label htmlFor="reflection">Reflection (optional)</label>
              <textarea
                id="reflection"
                value={form.reflection}
                onChange={(e) => setForm({ ...form, reflection: e.target.value })}
                placeholder="What did you change based on the AI output?"
              />
            </div>
            <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save log'}</button>
          </form>
        </div>
        <div className="card stack">
          <h3>NTNU AI guidelines</h3>
          <ul className="guideline-list">
            {guidelines.map((g, idx) => <li key={idx}>{g}</li>)}
          </ul>
        </div>
      </div>

      <div className="card stack">
        <h3>Declaration</h3>
        {declaration ? (
          <div className="stack">
            <pre className="declaration declaration-output">{declaration.declaration_text}</pre>
            <div className="meta">Total logs: {declaration.total_logs} · Compliant: {declaration.compliant_logs} · Needs review: {declaration.needs_review_logs}</div>
            {declUpdated && <div className="meta">Updated: {declUpdated}</div>}
          </div>
        ) : (
          <div className="meta">No declaration yet.</div>
        )}
        <button onClick={refreshDeclaration} disabled={declBusy}>{declBusy ? 'Refreshing...' : 'Refresh declaration'}</button>
      </div>

      <div className="stack">
        <h3>Logged prompts</h3>
        {logs.length === 0 ? (
          <div className="card">Nothing logged yet.</div>
        ) : (
          <div className="list">
            {logs.map((entry) => (
              <LogCard key={entry.id} entry={entry} onReflection={handleReflection} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
