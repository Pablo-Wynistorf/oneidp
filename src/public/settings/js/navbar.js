document.getElementById('mobile-open-menu').addEventListener('click', function() {
    toggleMenu(true);
});

document.getElementById('mobile-close-menu').addEventListener('click', function() {
    toggleMenu(false);
});

function toggleMenu(isOpen) {
    var navItems = document.getElementById('nav-items');
    var mobileMenuIcon = document.getElementById('mobile-open-menu');
    var closeMenuIcon = document.getElementById('mobile-close-menu');
    var settingsItem = document.getElementById('settings-item');
    var logoutItem = document.getElementById('logout-item');

    if (isOpen) {
        navItems.classList.remove('hidden');
        navItems.classList.add('block');
        mobileMenuIcon.classList.add('hidden');
        closeMenuIcon.classList.remove('hidden');
        settingsItem.classList.remove('hidden');
        logoutItem.classList.remove('hidden');
    } else {
        navItems.classList.add('hidden');
        navItems.classList.remove('block');
        mobileMenuIcon.classList.remove('hidden');
        closeMenuIcon.classList.add('hidden');
        settingsItem.classList.add('hidden');
        logoutItem.classList.add('hidden');
    }
}
