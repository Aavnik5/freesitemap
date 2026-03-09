import { getFirestore, collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { db } from './firebase.js';

// Function to generate a slug from a given string
const generateSlug = (text) => {
    if (!text) return '';
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

const navLinksDocRef = doc(db, "navLinks", "main-menu");
const API_KEY = "AIzaSyDRdALy4oYz3LWiGuaQ5jB7P6pCYTrvRhA"; // You should move this to a more secure location
const auth = getAuth();

async function getNavLinks() {
    const docSnap = await getDoc(navLinksDocRef);
    if (docSnap.exists()) {
        return docSnap.data().links || [];
    } else {
        return [];
    }
}

async function saveNavLinks(navLinks) {
    if (auth.currentUser) {
        await setDoc(navLinksDocRef, { links: navLinks });
    } else {
        alert("You must be logged in to save changes.");
        window.location.href = 'admin/anikaai.html';
    }
}

async function fetchFiles(folderId) {
    let allFiles = [];
    let pageToken = null;
    const pageSize = 1000;
    do {
        const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${API_KEY}&fields=files(id,name,mimeType,parents),nextPageToken&orderBy=createdTime desc&pageSize=${pageSize}&pageToken=${pageToken || ''}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.files) {
            allFiles = allFiles.concat(data.files);
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return allFiles;
}

async function getViewCounts() {
    const viewCounts = {};
    const viewsSnapshot = await getDocs(collection(db, 'views'));
    viewsSnapshot.forEach(doc => { viewCounts[doc.id] = doc.data().count || 0; });
    const pdfViewsSnapshot = await getDocs(collection(db, 'pdf_views'));
    pdfViewsSnapshot.forEach(doc => { viewCounts[doc.id] = doc.data().count || 0; });
    return viewCounts;
}

async function getLikeCounts() {
    const likeCounts = {};
    const likesSnapshot = await getDocs(collection(db, 'likes'));
    likesSnapshot.forEach(doc => { likeCounts[doc.id] = doc.data().count || 0; });
    const pdfLikesSnapshot = await getDocs(collection(db, 'pdf_likes'));
    pdfLikesSnapshot.forEach(doc => { likeCounts[doc.id] = doc.data().count || 0; });
    return likeCounts;
}

async function getShareCounts() {
    const shareCounts = {};
    const sharesSnapshot = await getDocs(collection(db, 'shares'));
    sharesSnapshot.forEach(doc => { shareCounts[doc.id] = doc.data().count || 0; });
    const pdfSharesSnapshot = await getDocs(collection(db, 'pdf_shares'));
    pdfSharesSnapshot.forEach(doc => { shareCounts[doc.id] = doc.data().count || 0; });
    return shareCounts;
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("Admin script loaded and DOM is ready.");
    const form = document.getElementById('add-page-form');
    const menuStructureUl = document.getElementById('menu-structure');
    let editingIndex = null;

    const populateParentMenu = async () => {
        const parentMenuSelect = document.getElementById('parent-menu');
        parentMenuSelect.innerHTML = '<option value="">-- None (Top-level) --</option>';
        const navLinks = await getNavLinks();
        navLinks.forEach((link, index) => {
            if (link.children) {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = link.name;
                parentMenuSelect.appendChild(option);
            }
        });
    };

    const populateFormForEdit = async (parentIndex, childIndex = null) => {
        const navLinks = await getNavLinks();
        const itemToEdit = childIndex === null ? navLinks[parentIndex] : navLinks[parentIndex].children[childIndex];

        document.getElementById('page-name').value = itemToEdit.name;
        document.getElementById('folder-id').value = itemToEdit.folderId;
        document.getElementById('page-type').value = itemToEdit.type;
        document.getElementById('seo-title').value = itemToEdit.seoTitle || '';
        document.getElementById('meta-description').value = itemToEdit.metaDescription || '';
        document.getElementById('slug').value = itemToEdit.slug || generateSlug(itemToEdit.name) || '';
        document.getElementById('caption-keywords').value = (itemToEdit.captionKeywords || []).join(', ');

        if (childIndex !== null) {
            document.getElementById('parent-menu').value = parentIndex;
        } else {
            document.getElementById('parent-menu').value = '';
        }

        editingIndex = { parent: parentIndex, child: childIndex };
        document.querySelector('#add-page-form button[type="submit"]').textContent = 'Update Page';
    };

    const renderMenuStructure = async () => {
        menuStructureUl.innerHTML = '<li class="list-group-item">Loading...</li>';
        const [navLinks, allViews, allLikes, allShares] = await Promise.all([
            getNavLinks(),
            getViewCounts(),
            getLikeCounts(),
            getShareCounts()
        ]);
        
        const folderIds = navLinks.map(link => link.folderId);
        const filePromises = folderIds.map(id => fetchFiles(id));
        const fileArrays = await Promise.all(filePromises);
        const allFiles = fileArrays.flat();

        const folderViewCounts = {};
        const folderLikeCounts = {};
        const folderShareCounts = {};

        for (const file of allFiles) {
            if (file.parents && file.parents.length > 0) {
                const folderId = file.parents[0];
                if (!folderViewCounts[folderId]) {
                    folderViewCounts[folderId] = 0;
                }
                if (!folderLikeCounts[folderId]) {
                    folderLikeCounts[folderId] = 0;
                }
                if (!folderShareCounts[folderId]) {
                    folderShareCounts[folderId] = 0;
                }
                folderViewCounts[folderId] += allViews[file.id] || 0;
                folderLikeCounts[folderId] += allLikes[file.id] || 0;
                folderShareCounts[folderId] += allShares[file.id] || 0;
            }
        }

        menuStructureUl.innerHTML = '';

        for (const [index, link] of navLinks.entries()) {
            const li = document.createElement('li');
            li.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
            
            const totalViews = folderViewCounts[link.folderId] || 0;
            const totalLikes = folderLikeCounts[link.folderId] || 0;
            const totalShares = folderShareCounts[link.folderId] || 0;

            li.innerHTML = `${link.name} 
                <div>
                    <span class="badge bg-primary rounded-pill me-1">${totalViews.toLocaleString()} views</span>
                    <span class="badge bg-success rounded-pill me-1">${totalLikes.toLocaleString()} likes</span>
                    <span class="badge bg-info rounded-pill">${totalShares.toLocaleString()} shares</span>
                </div>`;

            const buttonsDiv = document.createElement('div');

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('btn', 'btn-sm', 'btn-outline-danger');
            deleteButton.textContent = 'Delete';
            deleteButton.onclick = async () => {
                if (confirm(`Are you sure you want to delete "${link.name}"?`)) {
                    const currentNavLinks = await getNavLinks();
                    currentNavLinks.splice(index, 1);
                    await saveNavLinks(currentNavLinks);
                    renderMenuStructure();
                    populateParentMenu();
                }
            };

            const editButton = document.createElement('button');
            editButton.classList.add('btn', 'btn-sm', 'btn-outline-primary', 'ms-2');
            editButton.textContent = 'Edit';
            editButton.onclick = () => {
                populateFormForEdit(index);
            };

            buttonsDiv.appendChild(editButton);
            buttonsDiv.appendChild(deleteButton);
            li.appendChild(buttonsDiv);
            menuStructureUl.appendChild(li);

            if (link.children && link.children.length > 0) {
                const subUl = document.createElement('ul');
                subUl.classList.add('list-group', 'mt-2');
                for (const [childIndex, child] of link.children.entries()) {
                    const subLi = document.createElement('li');
                    subLi.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
                    
                    const childFiles = allFiles.filter(file => file.parents && file.parents.includes(child.folderId));
                    let childTotalViews = 0;
                    let childTotalLikes = 0;
                    let childTotalShares = 0;
                    for (const file of childFiles) {
                        childTotalViews += allViews[file.id] || 0;
                        childTotalLikes += allLikes[file.id] || 0;
                        childTotalShares += allShares[file.id] || 0;
                    }

                    subLi.innerHTML = `<span>↳ ${child.name}</span> 
                        <div class="ms-auto me-3">
                            <span class="badge bg-secondary rounded-pill me-1">${childTotalViews.toLocaleString()} views</span>
                            <span class="badge bg-success rounded-pill me-1">${childTotalLikes.toLocaleString()} likes</span>
                            <span class="badge bg-info rounded-pill">${childTotalShares.toLocaleString()} shares</span>
                        </div>`;

                    const childSeoInfo = document.createElement('div');
                    childSeoInfo.className = 'text-muted small mt-1';
                    childSeoInfo.innerHTML = `<strong>SEO Title:</strong> ${child.seoTitle || 'Not set'}<br><strong>Meta Desc:</strong> ${child.metaDescription || 'Not set'}`;
                    subLi.appendChild(childSeoInfo);

                    const childButtonsDiv = document.createElement('div');

                    const childDeleteButton = document.createElement('button');
                    childDeleteButton.classList.add('btn', 'btn-sm', 'btn-outline-danger');
                    childDeleteButton.textContent = 'Delete';
                    childDeleteButton.onclick = async () => {
                        if (confirm(`Are you sure you want to delete "${child.name}"?`)) {
                            const currentNavLinks = await getNavLinks();
                            currentNavLinks[index].children.splice(childIndex, 1);
                            await saveNavLinks(currentNavLinks);
                            renderMenuStructure();
                        }
                    };

                    const childEditButton = document.createElement('button');
                    childEditButton.classList.add('btn', 'btn-sm', 'btn-outline-primary', 'ms-2');
                    childEditButton.textContent = 'Edit';
                    childEditButton.onclick = () => {
                        populateFormForEdit(index, childIndex);
                    };

                    childButtonsDiv.appendChild(childEditButton);
                    childButtonsDiv.appendChild(childDeleteButton);
                    subLi.appendChild(childButtonsDiv);
                    subUl.appendChild(subLi);
                }
                li.appendChild(subUl);
            }
        }
    };

    const displayTotalStats = async () => {
        const totalViewsElement = document.getElementById('total-views');
        const totalLikesElement = document.getElementById('total-likes');
        const totalSharesElement = document.getElementById('total-shares');

        if (totalViewsElement && totalLikesElement && totalSharesElement) {
            try {
                const [viewsSnapshot, pdfViewsSnapshot, likesSnapshot, pdfLikesSnapshot, sharesSnapshot, pdfSharesSnapshot] = await Promise.all([
                    getDocs(collection(db, 'views')),
                    getDocs(collection(db, 'pdf_views')),
                    getDocs(collection(db, 'likes')),
                    getDocs(collection(db, 'pdf_likes')),
                    getDocs(collection(db, 'shares')),
                    getDocs(collection(db, 'pdf_shares'))
                ]);

                let totalViews = 0;
                viewsSnapshot.forEach(doc => { totalViews += doc.data().count || 0; });
                pdfViewsSnapshot.forEach(doc => { totalViews += doc.data().count || 0; });

                let totalLikes = 0;
                likesSnapshot.forEach(doc => { totalLikes += doc.data().count || 0; });
                pdfLikesSnapshot.forEach(doc => { totalLikes += doc.data().count || 0; });

                let totalShares = 0;
                sharesSnapshot.forEach(doc => { totalShares += doc.data().count || 0; });
                pdfSharesSnapshot.forEach(doc => { totalShares += doc.data().count || 0; });

                totalViewsElement.textContent = `Total Views: ${totalViews.toLocaleString()}`;
                totalLikesElement.textContent = `Total Likes: ${totalLikes.toLocaleString()}`;
                totalSharesElement.textContent = `Total Shares: ${totalShares.toLocaleString()}`;
            } catch (error) {
                console.error("Error fetching total stats:", error);
                totalViewsElement.textContent = 'Error';
                totalLikesElement.textContent = 'Error';
                totalSharesElement.textContent = 'Error';
            }
        }
    };

    populateParentMenu();
    renderMenuStructure();
    displayTotalStats();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const pageName = document.getElementById('page-name').value;
        const folderId = document.getElementById('folder-id').value;
        const pageType = document.getElementById('page-type').value;
        const parentMenuIndex = document.getElementById('parent-menu').value;
        const seoTitle = document.getElementById('seo-title').value;
        const metaDescription = document.getElementById('meta-description').value;
        let slug = document.getElementById('slug').value;
        const captionKeywords = document.getElementById('caption-keywords').value.split(',').map(k => k.trim()).filter(k => k);

        if (!slug) {
            slug = generateSlug(pageName);
        }

        let navLinks = await getNavLinks();

        if (editingIndex !== null) {
            // Update existing item
            const { parent, child } = editingIndex;
            const updatedLink = {
                name: pageName,
                folderId: folderId,
                type: pageType,
                seoTitle: seoTitle,
                metaDescription: metaDescription,
                slug: slug,
                captionKeywords: captionKeywords
            };

            if (child === null) {
                navLinks[parent] = { ...navLinks[parent], ...updatedLink };
            } else {
                navLinks[parent].children[child] = updatedLink;
            }

            await saveNavLinks(navLinks);
            alert('Page updated successfully!');
            editingIndex = null;
            document.querySelector('#add-page-form button[type="submit"]').textContent = 'Add Page';
        } else {
            // Add new item
            let newLink = {
                name: pageName,
                folderId: folderId,
                type: pageType,
                seoTitle: seoTitle,
                metaDescription: metaDescription,
                slug: slug,
                captionKeywords: captionKeywords
            };

            if (parentMenuIndex !== "") {
                const parentIndex = parseInt(parentMenuIndex, 10);
                if (navLinks[parentIndex]) {
                    if (!navLinks[parentIndex].children) {
                        navLinks[parentIndex].children = [];
                    }
                    navLinks[parentIndex].children.push(newLink);
                }
            } else {
                newLink.children = [];
                navLinks.push(newLink);
            }

            await saveNavLinks(navLinks);
            alert('Page added successfully!');
        }

        form.reset();
        populateParentMenu();
        renderMenuStructure();
    });

    // --- ARTICLE MANAGEMENT ---

    const articleForm = document.getElementById('article-form');
    const articlesListUl = document.getElementById('articles-list');
    const clearArticleFormBtn = document.getElementById('clear-article-form-btn');

    const loadArticlesForAdmin = async () => {
        articlesListUl.innerHTML = '<li class="list-group-item">Loading articles...</li>';
        try {
            const articlesRef = collection(db, "articles");
            const q = query(articlesRef, orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                articlesListUl.innerHTML = '<li class="list-group-item">No articles found.</li>';
                return;
            }

            articlesListUl.innerHTML = '';
            snapshot.forEach(doc => {
                const article = doc.data();
                const articleId = doc.id;
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between align-items-start';
                
                li.innerHTML = `
                    <div>
                        <h5 class="mb-1">${article.title}</h5>
                        <small class="text-muted">Created: ${new Date(article.createdAt.seconds * 1000).toLocaleString()}</small>
                    </div>
                `;

                const buttonsDiv = document.createElement('div');
                buttonsDiv.className = 'btn-group';

                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-sm btn-outline-primary';
                editBtn.textContent = 'Edit';
                editBtn.onclick = () => populateArticleForm(articleId);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-sm btn-outline-danger';
                deleteBtn.textContent = 'Delete';
                deleteBtn.onclick = () => deleteArticle(articleId, article.title);

                buttonsDiv.appendChild(editBtn);
                buttonsDiv.appendChild(deleteBtn);
                li.appendChild(buttonsDiv);
                articlesListUl.appendChild(li);
            });
        } catch (error) {
            console.error("Error loading articles:", error);
            articlesListUl.innerHTML = '<li class="list-group-item text-danger">Error loading articles.</li>';
        }
    };

    const populateArticleForm = async (articleId) => {
        try {
            const docRef = doc(db, "articles", articleId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const article = docSnap.data();
                document.getElementById('article-id').value = articleId;
                document.getElementById('article-title').value = article.title || '';
                document.getElementById('article-content').value = article.content || '';
                document.getElementById('article-slug').value = article.slug || '';
                document.getElementById('article-seo-title').value = article.seoTitle || '';
                document.getElementById('article-seo-desc').value = article.seoDescription || '';
                document.getElementById('article-seo-keywords').value = article.seoKeywords || '';
                
                articleForm.querySelector('button[type="submit"]').textContent = 'Update Article';
                articleForm.scrollIntoView({ behavior: 'smooth' });
            } else {
                alert("Article not found!");
            }
        } catch (error) {
            console.error("Error populating article form:", error);
            alert("Could not fetch article details.");
        }
    };

    const deleteArticle = async (articleId, articleTitle) => {
        if (!confirm(`Are you sure you want to delete the article "${articleTitle}"?`)) {
            return;
        }
        try {
            await deleteDoc(doc(db, "articles", articleId));
            alert('Article deleted successfully!');
            loadArticlesForAdmin();
        } catch (error) {
            console.error("Error deleting article:", error);
            alert("Error deleting article.");
        }
    };

    const clearArticleForm = () => {
        articleForm.reset();
        document.getElementById('article-id').value = '';
        articleForm.querySelector('button[type="submit"]').textContent = 'Save Article';
    };

    articleForm.addEventListener('submit', async (e) => {
        console.log("Article form submitted.");
        e.preventDefault();
        const articleId = document.getElementById('article-id').value;
        const articleData = {
            title: document.getElementById('article-title').value,
            content: document.getElementById('article-content').value,
            seoTitle: document.getElementById('article-seo-title').value,
            seoDescription: document.getElementById('article-seo-desc').value,
            seoKeywords: document.getElementById('article-seo-keywords').value,
            slug: document.getElementById('article-slug').value || generateSlug(document.getElementById('article-title').value),
        };

        console.log("Saving article data:", articleData);
        try {
            if (articleId) {
                const docRef = doc(db, "articles", articleId);
                articleData.updatedAt = serverTimestamp();
                await updateDoc(docRef, articleData);
                alert('Article updated successfully!');
            } else {
                const articlesRef = collection(db, "articles");
                articleData.createdAt = serverTimestamp();
                await addDoc(articlesRef, articleData);
                alert('Article saved successfully!');
            }
            clearArticleForm();
            loadArticlesForAdmin();
        } catch (error) {
            console.error("Error saving article:", error);
            alert("Error saving article.");
        }
    });

    clearArticleFormBtn.addEventListener('click', clearArticleForm);

    loadArticlesForAdmin();
});