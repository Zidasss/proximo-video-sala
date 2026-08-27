const themeBootstrap = `(() => {
  try {
    const saved = localStorage.getItem('klip_theme');
    const system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const theme = saved === 'light' || saved === 'dark' ? saved : system;
    document.documentElement.dataset.klipTheme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.klipTheme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }
})();`;

export function ThemeScript() {
  return <script id="klipapp-theme-bootstrap" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />;
}
