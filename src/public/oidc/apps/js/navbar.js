document.addEventListener('DOMContentLoaded', () => {
    const openMenuButton = document.getElementById('mobile-open-menu');
    const closeMenuButton = document.getElementById('mobile-close-menu');
    const sidebar = document.getElementById('sidebar');
    const settingsLogoutButtons = document.getElementById('settings-logout-buttons');
    const navItems = document.getElementById('nav-items');

    // Toggle mobile menu
    function toggleMenu(isOpen) {
        if (isOpen) {
            navItems.classList.remove('hidden');
            navItems.classList.add('block');
            openMenuButton.classList.add('hidden');
            closeMenuButton.classList.remove('hidden');
            settingsLogoutButtons.classList.remove('hidden');
        } else {
            navItems.classList.add('hidden');
            navItems.classList.remove('block');
            openMenuButton.classList.remove('hidden');
            closeMenuButton.classList.add('hidden');
            settingsLogoutButtons.classList.add('hidden');
        }
    }

    // Handle open menu button click
    openMenuButton.addEventListener('click', () => {
        sidebar.classList.add('open');
        toggleMenu(true);
    });

    // Handle close menu button click
    closeMenuButton.addEventListener('click', () => {
        sidebar.classList.remove('open');
        toggleMenu(false);
    });
});
