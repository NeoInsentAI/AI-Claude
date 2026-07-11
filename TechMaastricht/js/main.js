document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('site-header');
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');

  const onScroll = () => {
    if (window.scrollY > 40) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  };
  window.addEventListener('scroll', onScroll);
  onScroll();

  toggle.addEventListener('click', () => {
    const isOpen = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  links.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  const tabs = document.querySelectorAll('.form-tab');
  const panels = document.querySelectorAll('.form-panel');
  if (tabs.length && panels.length) {
    const targets = Array.from(panels).map((panel) => panel.id);

    const activate = (target) => {
      tabs.forEach((tab) => {
        const isActive = tab.dataset.target === target;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
      });
      panels.forEach((panel) => {
        panel.hidden = panel.id !== target;
      });
    };

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        activate(tab.dataset.target);
        history.replaceState(null, '', '#' + tab.dataset.target);
      });
    });

    const hash = window.location.hash.replace('#', '');
    activate(targets.includes(hash) ? hash : targets[0]);
  }
});
