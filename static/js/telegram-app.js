/**
 * Telegram Mini App JavaScript
 * Этот файл содержит функции для работы с Telegram WebApp API
 */

// Проверяем, доступен ли Telegram WebApp API
const isTelegramWebAppAvailable = window.Telegram && window.Telegram.WebApp;

// Если API доступен, инициализируем приложение
if (isTelegramWebAppAvailable) {
    // Инициализация Telegram WebApp
    const tg = window.Telegram.WebApp;

    // Расширяем приложение на весь экран
    tg.expand();

    // Получаем данные инициализации от Telegram
    const initData = tg.initData;

    // Получаем цвета темы Telegram и применяем их к CSS переменным
    function applyTelegramTheme() {
        document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#ffffff');
        document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#000000');
        document.documentElement.style.setProperty('--tg-theme-hint-color', tg.themeParams.hint_color || '#999999');
        document.documentElement.style.setProperty('--tg-theme-link-color', tg.themeParams.link_color || '#2481cc');
        document.documentElement.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color || '#2481cc');
        document.documentElement.style.setProperty('--tg-theme-button-text-color', tg.themeParams.button_text_color || '#ffffff');
    }

    // Проверяем данные Telegram
    async function validateTelegramData() {
        try {
            const response = await fetch('/api/validate-telegram-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ initData })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Error validating Telegram data:', error);
            return { success: false, error: 'Network error' };
        }
    }

    // Отображаем информацию о пользователе
    function displayUserInfo(userData) {
        const userInfo = document.getElementById('user-info');
        if (!userInfo) return;
        
        userInfo.innerHTML = `
            <div class="user-profile">
                <h2>Привет, ${userData.first_name || 'пользователь'}!</h2>
                <p class="user-id">ID: ${userData.id || 'Неизвестно'}</p>
                ${userData.username ? `<p class="username">@${userData.username}</p>` : ''}
            </div>
        `;
    }

    // Отображаем сообщение об ошибке
    function displayError(message) {
        const userInfo = document.getElementById('user-info');
        if (!userInfo) return;
        
        userInfo.innerHTML = `
            <div class="error-message">
                <p class="error">${message}</p>
                <p>Пожалуйста, попробуйте открыть приложение снова из Telegram.</p>
            </div>
        `;
    }

    // Настраиваем кнопки Telegram
    function setupTelegramButtons() {
        // Основная кнопка
        tg.MainButton.setText('Обновить данные');
        tg.MainButton.onClick(() => {
            location.reload();
        });
        
        // Показываем основную кнопку только если она поддерживается
        if (tg.MainButton.isVisible) {
            tg.MainButton.show();
        }
        
        // Скрываем кнопку "Назад"
        if (tg.BackButton) {
            tg.BackButton.hide();
        }
    }

    // Инициализация приложения
    async function initApp() {
        // Применяем тему Telegram
        applyTelegramTheme();
        
        // Проверяем данные Telegram
        const data = await validateTelegramData();
        
        if (data.success) {
            // Отображаем информацию о пользователе
            displayUserInfo(data.user);
            
            // Показываем основной контент
            const content = document.getElementById('content');
            if (content) {
                content.style.display = 'block';
            }
            
            // Настраиваем кнопки Telegram
            setupTelegramButtons();
            
            // Отправляем событие о готовности приложения в Telegram
            tg.ready();
        } else {
            // Отображаем сообщение об ошибке
            displayError(`Ошибка аутентификации: ${data.error}`);
        }
    }

    // Запускаем инициализацию приложения после загрузки DOM
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // Если Telegram WebApp API недоступен, перенаправляем на страницу с инструкциями
    document.addEventListener('DOMContentLoaded', () => {
        // Проверяем, находимся ли мы уже на странице перенаправления
        if (!window.location.pathname.includes('/redirect')) {
            window.location.href = '/redirect';
        }
    });
} 