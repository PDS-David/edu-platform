/**
 * authenticatedDownload.js
 *
 * Opens a resource for viewing/downloading with proper auth.
 *
 * Root cause of "No internet connection" errors:
 *   The server issues a 302 redirect to a Cloudflare R2 signed URL.
 *   When fetch() follows that redirect cross-origin (to *.r2.cloudflarestorage.com),
 *   the browser enforces CORS and throws a network error — not an HTTP error —
 *   so it lands in our catch block as "Download failed. Check your connection."
 *
 * Fix:
 *   Use ?direct=1 to get the signed URL as JSON, then open it in a new tab.
 *   The signed URL is already authenticated (HMAC-signed, time-limited by R2)
 *   so no Bearer token is needed for the actual file fetch.
 *   For local-disk files (no R2), the server streams directly — we still use
 *   fetch() + blob() for those, which works because it's same-origin.
 */

import { getToken } from './token';

export async function openResourceAuth(resourceId, fallbackUrl = null) {
  if (!resourceId) {
    if (fallbackUrl) window.open(fallbackUrl, '_blank', 'noopener');
    return;
  }

  const token   = getToken() || '';
  const rawBase = import.meta.env.VITE_API_URL || '';
  const apiBase = rawBase.endsWith('/api')
    ? rawBase
    : rawBase ? `${rawBase}/api` : '/api';

  try {
    // Step 1: ask the server for the download URL (with auth)
    const resp = await fetch(`${apiBase}/resources/${resourceId}/download?direct=1`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        alert('Your session has expired. Please log in again.');
      } else if (resp.status === 403) {
        alert('You do not have access to this file. Ask your teacher to push it to you.');
      } else {
        alert(body?.error || `Could not open file (HTTP ${resp.status}).`);
      }
      return;
    }

    const data = await resp.json().catch(() => null);

    if (data?.url) {
      // R2 path: server returned a signed URL — open it directly, no CORS issue
      window.open(data.url, '_blank', 'noopener');
      return;
    }

    // Local-disk path: server didn't return a URL (returned streamed bytes or JSON
    // without a url field). Fall back to blob approach for same-origin streams.
    const blobResp = await fetch(`${apiBase}/resources/${resourceId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      redirect: 'follow',
    });

    if (!blobResp.ok) {
      alert(`Could not open file (HTTP ${blobResp.status}).`);
      return;
    }

    const blob      = await blobResp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a         = document.createElement('a');
    a.href          = objectUrl;
    a.target        = '_blank';
    a.rel           = 'noopener';
    const cd        = blobResp.headers.get('Content-Disposition') || '';
    const nameMatch = cd.match(/filename="?([^";]+)"?/i);
    if (nameMatch) a.download = nameMatch[1];
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);

  } catch (err) {
    console.error('[openResourceAuth]', err);
    alert('Could not open file. Please try again.');
  }
}

/**
 * downloadPastPaper
 *
 * Same root cause as the "No internet connection" bug documented above, but
 * for a different route: PastPapersPage.jsx's "Download PDF" was a plain
 * <a href="/api/past-papers/:id/download">. protect (server/middleware/auth.js)
 * only ever reads req.headers.authorization — this app has no cookie-based
 * auth fallback — and a plain anchor-tag navigation can never attach a
 * custom header. So the request 401'd with "no token provided" every time,
 * regardless of what the download route itself does once you're past auth.
 *
 * GET /api/past-papers/:id/download always streams the file's actual bytes
 * from this server now (no redirect to an R2 URL — see pastPaperRoutes.js),
 * so unlike openResourceAuth() above there's no cross-origin/CORS case to
 * special-case here: just fetch with the Bearer header, then save the blob.
 */
export async function downloadPastPaper(paperId, fallbackTitle = 'paper') {
  if (!paperId) return;

  const token   = getToken() || '';
  const rawBase = import.meta.env.VITE_API_URL || '';
  const apiBase = rawBase.endsWith('/api')
    ? rawBase
    : rawBase ? `${rawBase}/api` : '/api';

  try {
    const resp = await fetch(`${apiBase}/past-papers/${paperId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        alert('Please log in to download this paper.');
      } else if (resp.status === 403) {
        alert('You do not have access to this file.');
      } else if (resp.status === 404) {
        alert('This paper could not be found.');
      } else {
        alert(body?.error || `Could not download file (HTTP ${resp.status}).`);
      }
      return;
    }

    const blob      = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a         = document.createElement('a');
    a.href          = objectUrl;
    const cd        = resp.headers.get('Content-Disposition') || '';
    const nameMatch = cd.match(/filename="?([^";]+)"?/i);
    a.download      = nameMatch ? decodeURIComponent(nameMatch[1]) : `${fallbackTitle}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);

  } catch (err) {
    console.error('[downloadPastPaper]', err);
    alert('Could not download file. Please try again.');
  }
}
