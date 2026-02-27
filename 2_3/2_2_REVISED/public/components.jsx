function StatusPill({ compliance }) {
  if (!compliance) return null;
  const cls = compliance.status === 'compliant' ? 'ok' : 'warn';
  const label = compliance.status === 'compliant' ? 'Compliant' : 'Needs review';
  return <span className={`pill ${cls}`}>{label}</span>;
}

function LogCard({ entry, onReflection, onDelete }) {
  const [draft, setDraft] = React.useState(entry.reflection || '');
  const [busy, setBusy] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setDraft(entry.reflection || '');
  }, [entry.reflection]);

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
              {entry.compliance.reasons.map((reason, idx) => <li key={idx}>{reason}</li>)}
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

function PromptForm({ onSubmit, busy }) {
  const [form, setForm] = React.useState({ tool: '', prompt: '', reflection: '' });

  const submit = async (event) => {
    event.preventDefault();
    const ok = await onSubmit(form);
    if (ok) {
      setForm({ tool: '', prompt: '', reflection: '' });
    }
  };

  return (
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
  );
}

function GuidelinesPanel({ guidelines }) {
  return (
    <div className="card stack">
      <h3>NTNU AI guidelines</h3>
      <ul className="guideline-list">
        {guidelines.map((guideline, idx) => <li key={idx}>{guideline}</li>)}
      </ul>
    </div>
  );
}

function DeclarationPanel({ declaration, declBusy, declUpdated, onRefresh }) {
  return (
    <div className="card stack">
      <h3>Declaration</h3>
      {declaration ? (
        <div className="stack">
          <pre className="declaration declaration-output">{declaration.declaration_text}</pre>
          <div className="meta">
            Total logs: {declaration.total_logs} · Compliant: {declaration.compliant_logs} · Needs review: {declaration.needs_review_logs}
          </div>
          {declUpdated && <div className="meta">Updated: {declUpdated}</div>}
        </div>
      ) : (
        <div className="meta">No declaration yet.</div>
      )}
      <button onClick={onRefresh} disabled={declBusy}>{declBusy ? 'Refreshing...' : 'Refresh declaration'}</button>
    </div>
  );
}

function LogList({ logs, onReflection, onDelete }) {
  return (
    <div className="stack">
      <h3>Logged prompts</h3>
      {logs.length === 0 ? (
        <div className="card">Nothing logged yet.</div>
      ) : (
        <div className="list">
          {logs.map((entry) => (
            <LogCard key={entry.id} entry={entry} onReflection={onReflection} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

window.UIComponents = {
  StatusPill,
  LogCard,
  PromptForm,
  GuidelinesPanel,
  DeclarationPanel,
  LogList
};
