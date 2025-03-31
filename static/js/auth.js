/**
 * Общий файл для авторизации пользователя через Telegram WebApp
 * 
 * Этот файл содержит функции для:
 * 1. Проверки авторизации пользователя
 * 2. Получения данных пользователя из Telegram WebApp
 * 3. Сохранения данных пользователя в localStorage
 */

// Проверяет, авторизован ли пользователь
function isAuthenticated() {
    return localStorage.getItem('telegramUser') !== null;
}

// Получает данные пользователя из localStorage
function getUser() {
    const userData = localStorage.getItem('telegramUser');
    return userData ? JSON.parse(userData) : null;
}

// Сохраняет данные пользователя в localStorage
function saveUser(userData) {
    localStorage.setItem('telegramUser', JSON.stringify(userData));
}

// Удаляет данные пользователя из localStorage
function clearUser() {
    localStorage.removeItem('telegramUser');
}

// Получает данные пользователя из Telegram WebApp
async function getTelegramUser() {
    // Проверяем доступность Telegram WebApp API
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        
        try {
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                return tg.initDataUnsafe.user;
            }
        } catch (e) {
            console.error('Error getting user data from Telegram WebApp:', e);
        }
    }
    
    return null;
}

// Флаг для отслеживания процесса авторизации
let authenticationInProgress = false;

// Авторизует пользователя через Telegram WebApp или использует тестового пользователя
async function authenticateUser(showLoading = true, showError = true) {
    // Если пользователь уже авторизован, возвращаем его данные
    if (isAuthenticated()) {
        const existingUser = getUser();
        if (existingUser && Object.keys(existingUser).length > 0) {
            return { success: true, user: existingUser };
        } else {
            // Если данные пользователя пустые, очищаем их
            clearUser();
        }
    }
    
    // Если авторизация уже в процессе, ждем ее завершения
    if (authenticationInProgress) {
        console.log('Авторизация уже в процессе, ожидаем...');
        while (authenticationInProgress) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (isAuthenticated()) {
            const user = getUser();
            if (user && Object.keys(user).length > 0) {
                return { success: true, user: user };
            }
        }
    }
    
    authenticationInProgress = true;
    console.log('Начало процесса авторизации');
    
    const loadingElement = document.getElementById('authLoading');
    if (showLoading && loadingElement) {
        loadingElement.style.display = 'block';
    }
    
    try {
        const userData = await getTelegramUser();
        console.log('Полученные данные пользователя:', userData);
        
        if (userData) {
            const response = await fetch('/api/validate-telegram-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userData: userData
                })
            });
            
            const data = await response.json();
            console.log('Ответ сервера при валидации:', data);
            
            if (data.success && data.user && Object.keys(data.user).length > 0) {
                saveUser(data.user);
                console.log('Пользователь успешно сохранен:', data.user);
                
                if (showLoading && loadingElement) {
                    loadingElement.style.display = 'none';
                }
                
                authenticationInProgress = false;
                return { success: true, user: data.user };
            } else {
                console.error('Получен пустой объект пользователя или ошибка:', data);
                throw new Error(data.error || 'Ошибка авторизации: получены некорректные данные пользователя');
            }
        }
        
        // Если не удалось получить данные пользователя, показываем ошибку
        throw new Error('Не удалось получить данные пользователя');
    } catch (error) {
        console.error('Ошибка во время авторизации:', error);
        
        if (showLoading && loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        const errorElement = document.getElementById('authError');
        if (showError && errorElement) {
            errorElement.textContent = error.message;
            errorElement.style.display = 'block';
        }
        
        clearUser(); // Очищаем данные пользователя в случае ошибки
        authenticationInProgress = false;
        return { success: false, error: error.message };
    } finally {
        authenticationInProgress = false;
    }
}

// Добавляет заголовок с данными пользователя к fetch-запросам
function addAuthHeader(options = {}) {
    const user = getUser();
    if (user) {
        options.headers = options.headers || {};
        options.headers['X-User-Data'] = JSON.stringify(user);
    }
    return options;
}

// Сохраняем оригинальную функцию fetch
const originalFetch = window.fetch;

// Заменяем глобальную функцию fetch
function fetchWithAuth(url, options = {}) {
    try {
        // Инициализируем заголовки, если их нет
        options.headers = options.headers || {};
        
        // Добавляем данные пользователя
        const user = getUser();
        if (user) {
            console.log('Данные пользователя из localStorage:', JSON.stringify(user));
            options.headers['X-User-Data'] = JSON.stringify(user);
            console.log('Добавлен заголовок авторизации X-User-Data');
        } else {
            console.warn('ВНИМАНИЕ: Пользователь не авторизован, запрос без заголовка X-User-Data');
        }
        
        // Добавляем указание, что это XHR запрос
        options.headers['X-Requested-With'] = 'XMLHttpRequest';
        
        // Добавляем отладочную информацию о сессии в заголовки
        options.headers['X-Debug-Session'] = 'check-session';
        
        // Для отладки, выводим все куки в консоль
        console.log('Cookies для запроса:', document.cookie);
        
        // Добавляем аутентификационные заголовки
        const authHeaders = getAuthHeaders();
        for (const key in authHeaders) {
            if (authHeaders.hasOwnProperty(key)) {
                options.headers[key] = authHeaders[key];
            }
        }
        
        // Для отладки — собираем все токены авторизации
        const tokens = {
            localStorage: localStorage.getItem('token') || localStorage.getItem('auth_token') || null,
            sessionStorage: sessionStorage.getItem('token') || sessionStorage.getItem('auth_token') || null,
            telegramUser: localStorage.getItem('telegramUser')
        };
        console.log('Доступные токены:', tokens);
        
        // Выполняем запрос
        console.log('Опции запроса:', JSON.stringify(options, (k, v) => k === 'body' ? '[BODY]' : v));
        return originalFetch(url, options).then(response => {
            console.log(`Статус ответа: ${response.status}, URL: ${url}`);
            
            // Выводим заголовки ответа
            console.log('Заголовки ответа:');
            response.headers.forEach((value, key) => {
                console.log(`${key}: ${value}`);
            });
            
            return response;
        }).catch(error => {
            console.error(`Ошибка при выполнении запроса к ${url}:`, error);
            throw error;
        });
    } catch (error) {
        console.error('Ошибка в fetchWithAuth:', error);
        return Promise.reject(error);
    }
}

// Получение заголовков авторизации
function getAuthHeaders() {
    const headers = {};
    
    try {
        // Проверяем, есть ли данные пользователя в localStorage
        const userData = localStorage.getItem('telegramUser');
        const authToken = localStorage.getItem('token') || 
                          localStorage.getItem('auth_token') || 
                          localStorage.getItem('authToken');
        
        console.log('Данные пользователя из localStorage:', userData);
        console.log('Токен авторизации из localStorage:', authToken);
        
        // Если нашли токен, добавляем его в заголовки
        if (authToken) {
            console.log('✅ Найден токен авторизации:', authToken);
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        if (userData) {
            console.log('✅ Найдены данные пользователя в localStorage:', userData);
            try {
                // Пробуем распарсить JSON, если это JSON строка
                const parsedUserData = JSON.parse(userData);
                console.log('✅ Данные пользователя успешно распарсены:', parsedUserData);
                
                // Если есть token внутри объекта, используем его для авторизации
                if (parsedUserData.token) {
                    headers['Authorization'] = `Bearer ${parsedUserData.token}`;
                }
                
                // Добавляем отдельные поля в заголовки
                Object.keys(parsedUserData).forEach(key => {
                    const value = parsedUserData[key];
                    if (value) {
                        headers[`X-User-${key}`] = String(value);
                    }
                });
                
                // Также добавляем полную строку как отдельный заголовок
                headers['X-User-Data'] = userData;
            } catch (error) {
                console.error('❌ Ошибка при разборе данных пользователя:', error);
            }
        } else {
            console.warn('❌ Нет данных пользователя в localStorage');
        }
    } catch (error) {
        console.error('❌ Ошибка при получении заголовков авторизации:', error);
    }
    
    return headers;
}

// Переопределяем глобальный fetch для добавления заголовка авторизации
window.fetch = function(url, options = {}) {
    console.log(`Перехвачен fetch запрос к: ${url}`);
    return fetchWithAuth(url, options);
};

// Проверяет авторизацию при загрузке страницы
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Страница загружена, инициализация...');
    
    // Пробуем получить данные пользователя из URL параметров
    checkUserDataInURL();
    
    // Инициализация Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.expand();
        
        // Сообщаем Telegram, что приложение готово
        tg.ready();
        console.log('Telegram WebApp инициализирован');
    } else {
        console.log('Telegram WebApp не найден');
    }
    
    // Проверяем авторизацию
    const authResult = await authenticateUser(false, false);
    console.log('Результат авторизации:', authResult);
    
    // Переопределяем глобальный fetch для добавления заголовка авторизации
    window.fetch = function(url, options = {}) {
        console.log(`Перехвачен fetch запрос к: ${url}`);
        return fetchWithAuth(url, options);
    };
});

/**
 * Проверяет наличие данных пользователя в URL и использует их для авторизации
 */
function checkUserDataInURL() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const encodedUserData = urlParams.get('user_data');
        
        if (encodedUserData) {
            console.log('Найдены данные пользователя в URL параметрах');
            
            // Декодируем данные
            const decodedUserData = atob(encodedUserData);
            const userData = JSON.parse(decodedUserData);
            
            console.log('Данные пользователя из URL:', userData);
            
            // Проверяем, что данные содержат необходимые поля
            if (userData && userData.id) {
                // Сохраняем данные пользователя
                saveUser(userData);
                console.log('Данные пользователя из URL сохранены в localStorage');
                
                // Удаляем параметр из URL без перезагрузки страницы
                const url = new URL(window.location);
                url.searchParams.delete('user_data');
                window.history.replaceState({}, '', url);
                
                return true;
            }
        }
    } catch (error) {
        console.error('Ошибка при обработке данных пользователя из URL:', error);
    }
    
    return false;
} 