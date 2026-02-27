async function readErrorMessage(res) {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
  } catch {
  }
  return `Request failed (${res.status})`;
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

window.apiClient = {
  async getGuidelines() {
    const data = await request('/api/guidelines');
    return data.guidelines || [];
  },
  async getLogs() {
    const data = await request('/api/logs');
    return data.logs || [];
  },
  async createLog(payload) {
    const data = await request('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return data.entry;
  },
  async updateReflection(id, reflection) {
    const data = await request(`/api/logs/${id}/reflection`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reflection })
    });
    return data.entry;
  },
  async deleteLog(id) {
    await request(`/api/logs/${id}`, { method: 'DELETE' });
  },
  async getDeclaration() {
    return request('/api/declaration');
  }
};
