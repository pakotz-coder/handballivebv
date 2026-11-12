// Tema luminoasa / intunecata. Se incarca in <head> fara „defer”, ca pagina sa apara direct in tema
// aleasa (fara o clipire in tema cealalta). Implicit: tema intunecata a site-ului. Alegerea se tine minte
// in browser (localStorage); daca browserul nu permite, butonul merge doar pana la reincarcarea paginii.
(() => {
  const KEY = 'tema';
  const root = document.documentElement;
  const colors = { dark: '#0B0B0C', light: '#FFFFFF' };
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* stocare blocata */ }

  const apply = (theme) => {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[theme]);
  };
  apply(saved === 'light' ? 'light' : 'dark');

  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme); // meta theme-color exista abia acum daca scriptul a rulat inaintea ei
    const btn = document.getElementById('theme-btn');
    if (!btn) return;
    const label = btn.querySelector('.theme-label');
    const sync = () => {
      const light = root.dataset.theme === 'light';
      btn.setAttribute('aria-pressed', String(light));
      btn.title = light ? 'Treci la tema întunecată' : 'Treci la tema luminoasă';
      label.textContent = light ? 'Întunecat' : 'Luminos';
    };
    btn.addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch { /* stocare blocata */ }
      sync();
    });
    sync();
    btn.hidden = false;
  });
})();
