export class DropZoneHandler {
  constructor(element, onFileLoaded) {
    this.el = element;
    this.onFileLoaded = onFileLoaded;
    this.init();
  }

  init() {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    this.el.appendChild(input);

    // 2. Klick-Handler: Leitet Klick an das Hidden-Input weiter
    this.el.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
        if (e.target.files.length){
            const file = e.target.files[0];
            if (!file.type.startsWith('audio/')) return;
            this.onFileLoaded(file);
        }
    });

    // 3. Drag & Drop Handler
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        this.el.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    this.el.addEventListener('dragover', () => this.el.classList.add('is-dragover'));
    this.el.addEventListener('dragleave', () => this.el.classList.remove('is-dragover'));
    this.el.addEventListener('drop', (e) => {
        this.el.classList.remove('is-dragover');
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length) {
            const file = files[0];
            if (!file.type.startsWith('audio/')) return;
            this.onFileLoaded(file);
        }
    });
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Methoden zum Aufräumen, falls das Element entfernt wird
  destroy() {
    // Event-Listener entfernen, um Memory Leaks zu vermeiden
  }
}