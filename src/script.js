const API_URL = 'http://localhost:3000/api';
const TOKEN = localStorage.getItem('authToken');

// Ana sayfa yüklendiğinde ilk yapılacaklar
document.addEventListener('DOMContentLoaded', () => {
    // Token yoksa, kullanıcıyı login sayfasına at
    if (!TOKEN) {
        window.location.href = '/login.html';
        return;
    }
    
    // Kullanıcı bilgilerini yükle ve ana uygulamayı başlat
    loadCurrentUser();
    showSection('dashboard');
    
    // Logout butonu
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    });
});

async function fetchAPI(endpoint, options = {}) {
    // Her API isteğine token'ı ekle
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
    };

    try {
        const response = await fetch(`${API_URL}/${endpoint}`, { ...options, headers });
        // Eğer token geçersizse (401 veya 403), login'e yönlendir
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
            return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'API error');
        return data;
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

async function loadCurrentUser() {
    try {
        const user = await fetchAPI('me');
        document.getElementById('userNameDisplay').textContent = user.name;
        document.getElementById('userRoleDisplay').textContent = user.role;
        // Avatar için ismin baş harfleri
        const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        document.getElementById('userAvatar').textContent = initials;
    } catch (error) {
        console.error('Failed to load user info', error);
    }
}

// Geri kalan tüm fonksiyonlar (showSection, fetchUsers, renderUsersTable vb.)
// önceki "tasarım iyileştirilmiş" versiyondaki gibi kalabilir.
// Sadece fetchAPI fonksiyonunun güncellenmesi yeterlidir.

// Önceki versiyondan gelen diğer tüm fonksiyonlar...
function showSection(sectionId) {
    document.querySelectorAll('.main-content').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    const activeBtn = document.querySelector(`.nav-btn[onclick*="${sectionId}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    if (sectionId === 'users') fetchUsers();
}

async function fetchUsers() {
    const loader = document.getElementById('user-table-loader');
    const tableBody = document.querySelector('#userTable tbody');

    tableBody.innerHTML = '';
    loader.style.display = 'table-row';

    try {
        const users = await fetchAPI('users');
        renderUsersTable(users);
    } catch (error) {
        loader.style.display = 'none';
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Failed to load users.</td></tr>';
    }
}

function renderUsersTable(users) {
     const tableBody = document.querySelector('#userTable tbody');
    const loader = document.getElementById('user-table-loader');
    
    loader.style.display = 'none';
    tableBody.innerHTML = '';

    if (!users || users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No users found.</td></tr>';
        return;
    }
    users.forEach((user, index) => {
        const row = document.createElement('tr');
        row.className = 'fade-in-row';
        row.style.animationDelay = `${index * 0.05}s`;
        
        const statusClass = user.status ? user.status.toLowerCase() : 'inactive';
        row.innerHTML = `
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td><span class="badge badge-${statusClass}">${user.status}</span></td>
            <td>
                <button class="btn btn-sm btn-secondary">Edit</button>
                <button class="btn btn-sm btn-danger">Delete</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}
// Diğer fonksiyonlar (openUserModal, closeModal, editUser, deleteUser...) eklenebilir.