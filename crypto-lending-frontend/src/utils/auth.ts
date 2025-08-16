export function saveAuth(token: string, role: string, userId: string) {
  localStorage.setItem('pf_token', token);
  localStorage.setItem('pf_role', role);
  localStorage.setItem('pf_user', userId);
}
export function getAuth() {
  return {
    token: localStorage.getItem('pf_token') || '',
    role: localStorage.getItem('pf_role') || 'user',
    userId: localStorage.getItem('pf_user') || '',
  };
}
export function authHeader() {
  const t = localStorage.getItem('pf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}
