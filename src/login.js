// login.js
const API_URL = 'http://localhost:3000/api';

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const loginData = {
        email: emailInput.value,
        password: passwordInput.value
    };

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(loginData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed.');
        }
        
        // Token'ı localStorage'a kaydet
        localStorage.setItem('authToken', data.token);

        // Ana sayfaya yönlendir
        window.location.href = '/index.html';

    } catch (error) {
        showToast(error.message, 'error');
    }
});

function showToast(message, type = 'error') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}