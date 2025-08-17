import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import tooltipsHTML from '../partials/tooltips.html?raw';

function cloneTemplate(id) {
  const tpl = document.getElementById(id);
  if (!tpl) return document.createTextNode('Missing tooltip content');
  // Clone the first element inside the template
  return tpl.content.firstElementChild
    ? tpl.content.firstElementChild.cloneNode(true)
    : tpl.content.cloneNode(true);
}

export async function initTooltips() {
  // Inject templates once
  if (!document.getElementById('tt-iterations')) {
    document.body.insertAdjacentHTML('beforeend', tooltipsHTML);
  }

  // Attach to any element with data-tooltip="key" (maps to template id tt-key)
  document.querySelectorAll('[data-tooltip]').forEach((el) => {
    const key = el.getAttribute('data-tooltip');
    tippy(el, {
      allowHTML: true,
      interactive: true,
      placement: 'right',
      arrow: false,
    //   theme: 'transparent',
      maxWidth: 360,
      appendTo: () => document.body,            // avoid transformed/clipping ancestors
      animation: 'fade',
      delay: [100, 50],
      onShow(instance) {
        instance.setContent(cloneTemplate(`tt-${key}`));
      },
      popperOptions: {
        modifiers: [
          { name: 'flip', options: { fallbackPlacements: [] } }, // don’t auto-flip
          { name: 'preventOverflow', options: { boundary: 'viewport' } }
        ]
      }
    });
  });
}