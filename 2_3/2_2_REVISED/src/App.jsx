import { PromptForm, GuidelinesPanel, DeclarationPanel, LogList } from './components';
import { useDashboardData } from './hooks';

export default function App() {
  const {
    guidelines,
    logs,
    declaration,
    declUpdated,
    busy,
    declBusy,
    error,
    createLog,
    refreshDeclaration,
    updateReflection,
    deleteLog
  } = useDashboardData();

  return (
    <div className="shell">
      <header>
        <div>
          <h1>AI Usage Logger</h1>
        </div>
      </header>

      {error && <div className="card error">{error}</div>}

      <div className="grid-two">
        <PromptForm onSubmit={createLog} busy={busy} />
        <GuidelinesPanel guidelines={guidelines} />
      </div>

      <DeclarationPanel
        declaration={declaration}
        declBusy={declBusy}
        declUpdated={declUpdated}
        onRefresh={refreshDeclaration}
      />

      <LogList logs={logs} onReflection={updateReflection} onDelete={deleteLog} />
    </div>
  );
}
