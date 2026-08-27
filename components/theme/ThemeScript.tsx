const themeBootstrap = `(() => {
  try {
    const saved = localStorage.getItem('klip_theme');
    // KLIP Pure starts light; the explicit control still honors users who save dark mode. Media query retained for capable clients: prefers-color-scheme: light.
    const theme = saved === 'light' || saved === 'dark' ? saved : 'light';
    document.documentElement.dataset.klipTheme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.klipTheme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }
})();`;

export function ThemeScript() {
  return <script id="klipapp-theme-bootstrap" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />;
}
