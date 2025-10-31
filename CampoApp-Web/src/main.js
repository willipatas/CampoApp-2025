import './style.css'; // Esto importa el CSS que acabamos de pegar

// --- LÓGICA DE JAVASCRIPT ---
const API_URL = 'http://localhost:3000/api';
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const welcomeUser = document.getElementById('welcome-user');
const fincaForm = document.getElementById('finca-form');
const fincaSelector = document.getElementById('finca-selector');
const dashboardContent = document.getElementById('dashboard-content');
const logoutButton = document.getElementById('logout-button');
const totalAnimalesEl = document.getElementById('total-animales');
const alertasSanitariasEl = document.getElementById('alertas-sanitarias');

let globalUserName = '';

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    errorMessage.textContent = '';
    const usuario = document.getElementById('usuario').value;
    const contrasena = document.getElementById('contrasena').value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, contrasena })
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.mensaje || 'Error al iniciar sesión');
        
        localStorage.setItem('token', data.accessToken);
        loginContainer.classList.add('hidden');
        dashboardContainer.classList.remove('hidden');
        await loadUserProfile();
    } catch (err) {
        errorMessage.textContent = err.message;
    }
});

async function loadUserProfile() {
    const token = localStorage.getItem('token');
    if (!token) return handleLogout();

    try {
        const response = await fetchWithAuth(`${API_URL}/usuarios/me`);
        if (!response.ok) throw new Error('Sesión inválida');
        
        const data = await response.json();
        
        globalUserName = data.usuario.nombre_completo;
        welcomeUser.textContent = `Hola, ${globalUserName}`;
        
        const fincas = data.fincas;

        if (fincas.length === 1) {
            fincaForm.classList.add('hidden');
            welcomeUser.textContent = `Hola, ${globalUserName} - ${fincas[0].rol_en_finca}`;
            loadDashboardData(fincas[0].id_finca);

        } else if (fincas.length > 1) {
            fincaForm.classList.remove('hidden'); 
            dashboardContent.classList.add('hidden'); 
            
            fincaSelector.innerHTML = '<option value="">-- Seleccione una finca --</option>';
            fincas.forEach(finca => {
                const option = document.createElement('option');
                option.value = finca.id_finca;
                option.dataset.rol = finca.rol_en_finca; 
                option.textContent = `${finca.nombre_finca} (${finca.rol_en_finca})`;
                fincaSelector.appendChild(option);
            });
        } else {
            fincaForm.classList.remove('hidden');
            dashboardContent.classList.add('hidden');
            fincaSelector.innerHTML = '<option value="">-- No tiene fincas asignadas --</option>';
        }

    } catch (err) {
        console.error(err);
        handleLogout();
    }
}

fincaSelector.addEventListener('change', () => {
    const fincaId = fincaSelector.value;
    const selectedOption = fincaSelector.options[fincaSelector.selectedIndex];
    
    if (fincaId && selectedOption.dataset.rol) {
        const selectedRole = selectedOption.dataset.rol;
        welcomeUser.textContent = `Hola, ${globalUserName} - ${selectedRole}`;
        loadDashboardData(fincaId);
    } else {
        welcomeUser.textContent = `Hola, ${globalUserName}`;
        dashboardContent.classList.add('hidden');
    }
});

async function loadDashboardData(fincaId) {
    dashboardContent.classList.remove('hidden');
    totalAnimalesEl.textContent = '...';
    alertasSanitariasEl.textContent = '...';

    try {
        const pInventario = fetchWithAuth(`${API_URL}/fincas/${fincaId}/reportes/inventario`);
        const pSanitario = fetchWithAuth(`${API_URL}/fincas/${fincaId}/reportes/sanitario?dias=30`);
        const [resInventario, resSanitario] = await Promise.all([pInventario, pSanitario]);
        if (!resInventario.ok || !resSanitario.ok) throw new Error('No se pudieron cargar los reportes');
        
        const dataInv = await resInventario.json();
        const dataSan = await resSanitario.json();

        totalAnimalesEl.textContent = dataInv.reporte.total_semovientes;
        alertasSanitariasEl.textContent = dataSan.reporte.total_encontrado;
    } catch (err) {
        console.error(err);
        totalAnimalesEl.textContent = 'X';
        alertasSanitariasEl.textContent = 'X';
    }
}

logoutButton.addEventListener('click', handleLogout);
function handleLogout() {
    localStorage.removeItem('token');
    loginContainer.classList.remove('hidden');
    dashboardContainer.classList.add('hidden');
    errorMessage.textContent = 'Sesión cerrada.';
}

function fetchWithAuth(url) {
    const token = localStorage.getItem('token');
    return fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
}

(async () => {
    const token = localStorage.getItem('token');
    if (token) {
        loginContainer.classList.add('hidden');
        dashboardContainer.classList.remove('hidden');
        await loadUserProfile();
    }
})();