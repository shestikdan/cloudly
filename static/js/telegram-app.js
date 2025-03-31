/**
 * Основной JS файл для работы с Telegram WebApp API
 * 
 * Этот файл отвечает за:
 * 1. Получение данных пользователя из Telegram
 * 2. Отправку данных на сервер для валидации
 * 3. Настройку параметров WebApp
 */

document.addEventListener('DOMContentLoaded', function() {
    // Логируем информацию о пользовательском агенте для отладки
    console.log('User Agent:', navigator.userAgent);
    
    // Проверяем доступность window.Telegram и window.Telegram.WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        console.log('Telegram WebApp API is available');
        
        // Добавляем обработчик события viewportChanged
        window.Telegram.WebApp.onEvent('viewportChanged', function() {
            console.log('Viewport changed:', window.Telegram.WebApp.viewportHeight, window.Telegram.WebApp.viewportStableHeight);
        });

        // Добавляем обработчик события themeChanged
        window.Telegram.WebApp.onEvent('themeChanged', function() {
            console.log('Theme changed:', window.Telegram.WebApp.colorScheme);
        });

        // Добавляем обработчик события mainButtonClicked
        window.Telegram.WebApp.onEvent('mainButtonClicked', function() {
            console.log('Main button clicked');
        });

        // Инициализируем WebApp
        initializeTelegramWebApp();
    } else {
        console.log('Telegram WebApp API is not available');
        handleNonTelegramEnvironment();
    }
});

/**
 * Инициализирует Telegram WebApp интерфейс
 */
function initializeTelegramWebApp() {
    console.log('Initializing Telegram WebApp...');
    
    try {
        // Проверяем доступность Telegram WebApp
        if (window.Telegram && window.Telegram.WebApp) {
            console.log('Telegram WebApp details:', {
                version: window.Telegram.WebApp.version,
                platform: window.Telegram.WebApp.platform,
                initDataUnsafe: window.Telegram.WebApp.initDataUnsafe,
                colorScheme: window.Telegram.WebApp.colorScheme,
                viewportHeight: window.Telegram.WebApp.viewportHeight,
                viewportStableHeight: window.Telegram.WebApp.viewportStableHeight
            });

            // Настраиваем параметры WebApp
            window.Telegram.WebApp.setHeaderColor('#ffffff');
            window.Telegram.WebApp.setBackgroundColor('#ffffff');
            
            // Явно активируем WebApp
            window.Telegram.WebApp.ready();
            
            // Расширяем viewPort до максимума
            window.Telegram.WebApp.expand();
            
            // Получаем данные пользователя
            const user = window.Telegram.WebApp.initDataUnsafe?.user;
            if (user) {
                console.log('User data received:', user);
                localStorage.setItem('telegramUser', JSON.stringify(user));
                
                // Отправляем данные на сервер для валидации
                sendValidationRequest(user, window.Telegram.WebApp.initData);
            } else {
                console.warn('No user data in WebApp initDataUnsafe');
                handleMissingUserData();
            }
        } else {
            console.warn('Telegram WebApp is not available');
            handleNonTelegramEnvironment();
        }
    } catch (error) {
        console.error('Error during WebApp initialization:', error);
        handleWebAppError(error);
    }
}

/**
 * Обработка случая отсутствия данных пользователя
 */
function handleMissingUserData() {
    // Проверяем сохраненные данные
    const savedUser = localStorage.getItem('telegramUser');
    if (savedUser) {
        console.log('Using saved user data');
        updateUIWithUserData(JSON.parse(savedUser));
    } else {
        // Перенаправляем на страницу авторизации
        console.log('Нет данных пользователя, перенаправление на страницу авторизации');
        redirectToAccessPage();
    }
}

/**
 * Обработка ошибок инициализации WebApp
 */
function handleWebAppError(error) {
    console.error('WebApp initialization error:', error);
    // Показываем сообщение об ошибке пользователю
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.innerHTML = `
        <div style="padding: 20px; background-color: #ffebee; color: #c62828; border-radius: 8px; margin: 20px;">
            <h3>Ошибка инициализации</h3>
            <p>Произошла ошибка при запуске приложения. Пожалуйста, попробуйте:</p>
            <ol>
                <li>Обновить страницу</li>
                <li>Очистить кэш браузера</li>
                <li>Открыть приложение в другом браузере</li>
            </ol>
        </div>
    `;
    document.body.insertBefore(errorMessage, document.body.firstChild);
}

/**
 * Обработка случая, когда приложение открыто вне Telegram
 */
function handleNonTelegramEnvironment() {
    const savedUser = localStorage.getItem('telegramUser');
    if (savedUser) {
        console.log('User is already authorized, continuing without Telegram WebApp API');
        updateUIWithUserData(JSON.parse(savedUser));
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('bypass_auth') === '1') {
            console.log('bypass_auth parameter detected, continuing without Telegram WebApp API');
            sendValidationRequest(null, null);
        } else {
            redirectToAccessPage();
        }
    }
}

/**
 * Отправляет данные пользователя и initData на сервер для валидации
 */
function sendValidationRequest(userData, initData) {
    // Определяем URL для запроса
    let url = '/api/validate-telegram-data';
    if (!userData) {
        // Если нет данных пользователя, добавляем параметр bypass_auth
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('bypass_auth') === '1') {
            url += '?bypass_auth=1';
        }
    }
    
    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            userData: userData,
            initData: initData
        })
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                // Если сервер вернул 401 (Unauthorized), перенаправляем на страницу авторизации
                window.location.href = '/auth';
                throw new Error('Unauthorized');
            }
            throw new Error('Network response was not ok: ' + response.status);
        }
        return response.json();
    })
    .then(data => {
        console.log('Validation response:', data);
        if (data.success) {
            // Сохраняем информацию о пользователе
            localStorage.setItem('telegramUser', JSON.stringify(data.user));
            
            // Обновляем интерфейс с учетом полученных данных
            updateUIWithUserData(data.user);
        } else {
            console.error('Validation failed:', data.error);
        }
    })
    .catch(error => {
        console.error('Error during validation:', error);
    });
}

/**
 * Обновляет интерфейс с учетом данных пользователя
 */
function updateUIWithUserData(user) {
    const userNameElement = document.getElementById('userName');
    if (userNameElement) {
        userNameElement.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    
    // Можно добавить другие обновления интерфейса
}

/**
 * Перенаправляет на страницу с инструкциями по доступу
 */
function redirectToAccessPage() {
    console.log('Checking if redirection is needed');
    
    // Проверяем, есть ли данные пользователя в localStorage
    const savedUser = localStorage.getItem('telegramUser');
    
    // Если данные пользователя уже есть, значит он авторизован
    // В этом случае не перенаправляем на страницу redirect
    if (savedUser) {
        console.log('User is already authorized, not redirecting');
        return;
    }
    
    // Проверяем, есть ли параметр bypass_auth в URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('bypass_auth') === '1') {
        console.log('bypass_auth parameter detected, not redirecting');
        return;
    }
    
    console.log('Redirecting to access page');
    window.location.href = '/redirect';
}

/**
 * Валидирует данные пользователя Telegram
 * @returns {Promise} Promise с результатом валидации
 */
async function validateTelegramData() {
    let userData = null;
    let initData = null;
    
    // Проверяем доступность Telegram WebApp API
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        
        try {
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                userData = tg.initDataUnsafe.user;
                console.log('User data from initDataUnsafe:', userData);
            }
            initData = tg.initData;
        } catch (e) {
            console.error('Error getting user data from Telegram WebApp:', e);
        }
    } else {
        console.log('Telegram WebApp API is not available');
        
        // Проверяем, есть ли данные пользователя в localStorage
        const savedUser = localStorage.getItem('telegramUser');
        if (savedUser) {
            console.log('Using saved user data from localStorage');
            userData = JSON.parse(savedUser);
        }
    }
    
    // Если у нас есть данные пользователя, используем их для авторизации
    if (!userData) {
        console.log('Не получены данные пользователя');
        return { success: false, error: 'Не получены данные пользователя' };
    }
    
    try {
        const response = await fetch('/api/validate-telegram-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userData: userData,
                initData: initData
            })
        });
        
        const data = await response.json();
        console.log('Validation response:', data);
        
        if (data.success) {
            // Сохраняем информацию о пользователе
            localStorage.setItem('telegramUser', JSON.stringify(data.user));
        }
        
        return data;
    } catch (error) {
        console.error('Error during validation:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Вызываем инициализацию при загрузке страницы
document.addEventListener('DOMContentLoaded', initializeTelegramWebApp); 