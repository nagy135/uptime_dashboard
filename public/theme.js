// Apply the saved preference before the first paint, under the app's self-only CSP.
try {
  const theme = localStorage.getItem('fleet-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Follow the system when browser storage is unavailable.
}
