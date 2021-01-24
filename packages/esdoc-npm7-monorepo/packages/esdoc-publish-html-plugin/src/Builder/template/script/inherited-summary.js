(function(){
  function toggle(ev) {
    const button = ev.target;
    let parent = ev.target.parentElement;
    while(parent) {
      if (parent.tagName === 'TABLE' && parent.classList.contains('summary')) break;
      parent = parent.parentElement;
    }

    if (!parent) return;

    const tbody = parent.querySelector('tbody');
    if (button.classList.contains('opened')) {
      button.classList.remove('opened');
      button.classList.add('closed');
      tbody.style.display = 'none';
    } else {
      button.classList.remove('closed');
      button.classList.add('opened');
      tbody.style.display = 'block';
    }
  }

  const buttons = document.querySelectorAll('.inherited-summary thead .toggle');
  for (let ii = 0; ii < buttons.length; ii = ii + 1) {
    buttons[ii].addEventListener('click', toggle);
  }
})();
