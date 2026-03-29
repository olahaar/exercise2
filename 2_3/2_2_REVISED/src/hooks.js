import { useEffect, useState } from 'react';
import { apiClient } from './api';

export function useDashboardData() {
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

  const refreshDeclaration = async () => {
    setDeclBusy(true);
    try {
      const data = await apiClient.getDeclaration();
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
      const entry = await apiClient.createLog(formData);
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
      const updated = await apiClient.updateReflection(id, reflection);
      setLogs((prev) => prev.map((item) => (item.id === id ? updated : item)));
      await refreshDeclaration();
    } catch (err) {
      setErrorMessage(err);
      throw err;
    }
  };

  const deleteLog = async (id) => {
    try {
      await apiClient.deleteLog(id);
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
          apiClient.getGuidelines(),
          apiClient.getLogs(),
          apiClient.getDeclaration()
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
    refreshDeclaration,
    createLog,
    updateReflection,
    deleteLog
  };
}
