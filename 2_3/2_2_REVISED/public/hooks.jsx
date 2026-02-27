const { useState, useEffect } = React;

function useDashboardData() {
  const [guidelines, setGuidelines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [declaration, setDeclaration] = useState(null);
  const [busy, setBusy] = useState(false);
  const [declBusy, setDeclBusy] = useState(false);
  const [declUpdated, setDeclUpdated] = useState('');
  const [error, setError] = useState('');

  const setErrorMessage = (err) => {
    setError(err?.message || 'Unexpected error, please retry.');
  };

  const refreshLogs = async () => {
    try {
      const nextLogs = await window.apiClient.getLogs();
      setLogs(nextLogs);
    } catch (err) {
      setErrorMessage(err);
    }
  };

  const refreshDeclaration = async () => {
    setDeclBusy(true);
    try {
      const data = await window.apiClient.getDeclaration();
      setDeclaration(data);
      setDeclUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setErrorMessage(err);
    } finally {
      setDeclBusy(false);
    }
  };

  const createLog = async (formData) => {
    setBusy(true);
    setError('');
    try {
      const entry = await window.apiClient.createLog(formData);
      setLogs((prev) => [entry, ...prev]);
      await refreshDeclaration();
      return true;
    } catch (err) {
      setErrorMessage(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updateReflection = async (id, reflection) => {
    try {
      const updated = await window.apiClient.updateReflection(id, reflection);
      setLogs((prev) => prev.map((item) => (item.id === id ? updated : item)));
      await refreshDeclaration();
    } catch (err) {
      setErrorMessage(err);
      throw err;
    }
  };

  const deleteLog = async (id) => {
    try {
      await window.apiClient.deleteLog(id);
      setLogs((prev) => prev.filter((item) => item.id !== id));
      await refreshDeclaration();
    } catch (err) {
      setErrorMessage(err);
      throw err;
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadInitial = async () => {
      setError('');
      try {
        const [nextGuidelines, nextLogs, nextDeclaration] = await Promise.all([
          window.apiClient.getGuidelines(),
          window.apiClient.getLogs(),
          window.apiClient.getDeclaration()
        ]);

        if (!mounted) return;
        setGuidelines(nextGuidelines);
        setLogs(nextLogs);
        setDeclaration(nextDeclaration);
        setDeclUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        if (!mounted) return;
        setErrorMessage(err);
      }
    };

    loadInitial();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    guidelines,
    logs,
    declaration,
    declUpdated,
    busy,
    declBusy,
    error,
    refreshLogs,
    refreshDeclaration,
    createLog,
    updateReflection,
    deleteLog
  };
}

window.AppHooks = { useDashboardData };
