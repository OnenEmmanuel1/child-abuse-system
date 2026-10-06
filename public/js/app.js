/* ─────────────────────────────────────────────────────────────
   CADMS — Client-side JavaScript
   Minimal — progressive enhancement only.
   ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Delete confirmation ── */
  document.querySelectorAll('.cadms-confirm-delete').forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
        e.preventDefault();
      }
    });
  });

  /* ── Auto-dismiss flash messages ── */
  document.querySelectorAll('.cadms-alert').forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transition = 'opacity 0.3s ease';
      setTimeout(() => alert.remove(), 300);
    }, 5000);
  });

  /* ── Active sidebar link ── */
  const path = window.location.pathname;
  document.querySelectorAll('.cadms-sidebar__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === path || (href !== '/dashboard' && path.startsWith(href))) {
      link.classList.add('active');
    }
  });

});
