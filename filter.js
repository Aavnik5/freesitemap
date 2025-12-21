document.addEventListener("DOMContentLoaded", function() {
  const filterButtons = document.querySelectorAll('.filter-buttons .btn');
  filterButtons.forEach(button => {
    button.addEventListener('click', function() {
      const activeButton = document.querySelector('.filter-buttons .btn.active');
      if (activeButton) {
        activeButton.classList.remove('active', 'btn-danger');
        if (!activeButton.classList.contains('btn-danger')) {
            activeButton.classList.add('btn-outline-danger');
        }
      }

      this.classList.add('active', 'btn-danger');
      this.classList.remove('btn-outline-danger');

      const filterType = this.dataset.filter;

      if (typeof loadGallery === 'function') {
        loadGallery(filterType);
      } else if (typeof sortGallery === 'function') {
        sortGallery(filterType);
      }
    });
  });
});
