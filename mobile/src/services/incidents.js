import { api } from './api';

export async function getIncidents() {
  const response = await api.get('/incidents/');
  return response.data;
}

export async function getCategories() {
  const response = await api.get('/categories/');
  return response.data;
}

export async function createCategory(category) {
  const response = await api.post('/categories/', category);
  return response.data;
}

export async function updateCategory(categoryId, category) {
  const response = await api.patch(`/categories/${categoryId}/`, category);
  return response.data;
}

export async function getCategoryRoutes(categoryId) {
  const response = await api.get(`/categories/${categoryId}/routes/`);
  return response.data;
}

export async function saveCategoryRoute(categoryId, locationId, technicianId) {
  const response = await api.post(`/categories/${categoryId}/routes/`, {
    location_id: locationId,
    technician_id: technicianId,
  });
  return response.data;
}

export async function removeCategoryRoute(categoryId, locationId) {
  await api.delete(`/categories/${categoryId}/routes/`, {
    params: { location_id: locationId },
  });
}

export async function createIncident(incident) {
  const data = new FormData();
  data.append('title', incident.title);
  data.append('description', incident.description);
  data.append('category', String(incident.categoryId));
  data.append('priority', incident.priority);
  if (incident.image) {
    data.append('evidence_image', {
      uri: incident.image.uri,
      name: incident.image.fileName || 'evidence.jpg',
      type: incident.image.mimeType || 'image/jpeg',
    });
  }

  const response = await api.post('/incidents/', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function updateIncidentStatus(incidentId, status) {
  const response = await api.patch(`/incidents/${incidentId}/`, { status });
  return response.data;
}
