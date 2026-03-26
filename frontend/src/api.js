import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: BASE_URL + '/api' });

export const fetchGraph = () => api.get('/graph').then(r => r.data);
export const fetchStats = () => api.get('/stats').then(r => r.data);
export const fetchNodeDetail = (type, id) => api.get(`/node/${type}/${id}`).then(r => r.data);
export const fetchNodeExpand = (type, id) => api.get(`/node/${type}/${id}/expand`).then(r => r.data);
export const sendChat = (message, history) => api.post('/chat', { message, history }).then(r => r.data);
