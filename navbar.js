import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { db } from './firebase.js';

const navLinksDocRef = doc(db, "navLinks", "main-menu");

async function getNavLinks() {
    const docSnap = await getDoc(navLinksDocRef, { source: 'server' });
    if (docSnap.exists()) {
        return docSnap.data().links || [];
    } else {
        return [];
    }
}

// Function to generate a slug from a given string
const generateSlug = (text) => {
    return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const navCollapseDiv = document.getElementById('nav');
        console.log('navCollapseDiv:', navCollapseDiv);

        if (navCollapseDiv) {
            const navLinks = await getNavLinks();
            navCollapseDiv.innerHTML = '';

            const ul = document.createElement('ul');
            ul.classList.add('navbar-nav', 'ms-auto');

            // Add static links
            const staticLinks = [
            { name: 'Home', href: 'index.html' },
            { name: 'Video', href: 'video.html' }
        ];

            staticLinks.forEach(link => {
                const li = document.createElement('li');
                li.classList.add('nav-item');
                const a = document.createElement('a');
                a.classList.add('nav-link');
                a.href = link.href;
                a.textContent = link.name;
                li.appendChild(a);
                ul.appendChild(li);
            });

            // Add dynamic links
            navLinks.forEach(link => {
                if (link.children && link.children.length > 0) {
                    // This is a dropdown menu
                    const li = document.createElement('li');
                    li.classList.add('nav-item', 'dropdown');

                    const a = document.createElement('a');
                    a.classList.add('nav-link', 'dropdown-toggle');
                    a.href = '#';
                    a.role = 'button';
                    a.dataset.bsToggle = 'dropdown';
                    a.ariaExpanded = 'false';
                    a.textContent = link.name;

                    const dropdownMenu = document.createElement('ul');
                    dropdownMenu.classList.add('dropdown-menu');

                    link.children.forEach(childLink => {
                        const dropdownLi = document.createElement('li');
                        const dropdownA = document.createElement('a');
                        dropdownA.classList.add('dropdown-item');
                        const slugToUse = childLink.slug || generateSlug(childLink.name);
                        dropdownA.href = `template.html?type=${childLink.type}&slug=${slugToUse}&folderId=${childLink.folderId}`;
                        dropdownA.textContent = childLink.name;
                        dropdownLi.appendChild(dropdownA);
                        dropdownMenu.appendChild(dropdownLi);
                    });

                    li.appendChild(a);
                    li.appendChild(dropdownMenu);
                    ul.appendChild(li);
                } else {
                    // This is a simple link
                    const li = document.createElement('li');
                    li.classList.add('nav-item');
                    const a = document.createElement('a');
                    a.classList.add('nav-link');
                    const slugToUse = link.slug || generateSlug(link.name);
                    a.href = `template.html?type=${link.type}&slug=${slugToUse}&folderId=${link.folderId}`;
                    a.textContent = link.name;
                    li.appendChild(a);
                    ul.appendChild(li);
                }
            });

            navCollapseDiv.appendChild(ul);
        }
    } catch (error) {
        console.error('Error loading navbar:', error);
    }
});