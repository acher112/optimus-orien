// Client-side instant navigation utility for SPA routing without full-page reloads
export function navigate(url: string) {
  if (typeof window === 'undefined') return;
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new CustomEvent('optimus_navigate', { detail: { url } }));
}
