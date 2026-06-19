/**
 * authenticatedDownload.js
 *
 * Replaces raw <a href="/api/resources/:id/download"> links, which send no
 * Authorization header and always receive a 401 Unauthorized from the server.
 *
 * Usage:
 *   import { openResourceAuth } from '../utils/authenticatedDownload';
 *   <button onClick={() => openResourceAuth(file.id)}>Open</button>
 *   <button onClick={() => openResourceAuth(null, file.file_url)}>Open</button>
 */

import { getToken } from './token';

/**
 * Fetch a resource through the authenticated download endpoint and open/download it.
 * Falls back to file_url for public URLs (legacy R2 public links).
 *
 * @param {string|null} resourceId  - The resource UUID (preferred)
 * @param {string|null} fallbackUrl - Direct URL fallback if no id
 */
export async function openResourceAuth(resourceId, fallbackUrl = null) {
  if (!resourceId) {
    if (fallbackUrl) window.open(fallbackUrl, '_blank', 'noopener');
    return;
  }

  // Read token from in-memory / sessionStorage store (token.js).
  // Never use localStorage — tokens no longer live there.
  const token   = getToken() || '';
  const rawBase = import.meta.env.VITE_API_URL || '';
  const apiBase = rawBase.endsWith('/api')
    ? rawBase
    : rawBase ? `${rawBase}/api` : '/api';

  try {
    const resp = await fetch(`${apiBase}/resources/${resourceId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      redirect: 'follow',
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const msg  = body?.error || `Could not open file (HTTP ${resp.status}).`;
      if (resp.status === 401) {
        alert('Your session has expired. Please log in again.');
      } else if (resp.status === 403) {
        alert('You do not have access to this file. Ask your teacher to (re-)push it to you.');
      } else {
        alert(msg);
      }
      return;
    }

    const blob      = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a         = document.createElement('a');
    a.href          = objectUrl;
    a.target        = '_blank';
    a.rel           = 'noopener';
    const cd        = resp.headers.get('Content-Disposition') || '';
    const nameMatch = cd.match(/filename="?([^";]+)"?/i);
    if (nameMatch) a.download = nameMatch[1];
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
  } catch (err) {
    console.error('[openResourceAuth]', err);
    alert('Download failed — check your internet connection.');
  }
}
