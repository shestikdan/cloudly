/**
 * Bypass Helpers для Telegram Mini App
 * Этот файл содержит вспомогательные функции для обхода проверки Telegram
 * и прямого доступа к мини-приложению в случае проблем
 */

/**
 * Вспомогательные функции для решения проблем доступа в Telegram Mini Apps
 */
const BypassHelpers = {
    /**
     * Очищает кэш страницы и перезагружает
     */
    clearAppCache: function() {
        if ('caches' in window) {
            caches.keys().then(function(cacheNames) {
                return Promise.all(
                    cacheNames.filter(function(cacheName) {
                        return true; // Удаляем весь кэш
                    }).map(function(cacheName) {
                        console.log('Deleting cache:', cacheName);
                        return caches.delete(cacheName);
                    })
                );
            }).then(function() {
                console.log('Caches cleared, reloading page');
                window.location.reload(true);
            }).catch(function(err) {
                console.error('Error clearing caches:', err);
                // Перезагружаем страницу в любом случае
                window.location.reload(true);
            });
        } else {
            // Если API кэшей недоступен, просто перезагружаем страницу
            console.log('Cache API not available, force reloading');
            window.location.reload(true);
        }
    },
    
    /**
     * Создает эмуляцию Telegram WebApp API
     * Это помогает запустить приложение без реального Telegram окружения
     */
    emulateTelegramWebApp: function() {
        console.log('Emulating Telegram WebApp API');
        
        // Базовая эмуляция Telegram WebApp
        window.Telegram = {
            WebApp: {
                ready: function() {
                    console.log('Emulated WebApp.ready() called');
                },
                expand: function() {
                    console.log('Emulated WebApp.expand() called');
                },
                initData: 'query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22%D0%A2%D0%B5%D1%81%D1%82%D0%BE%D0%B2%D1%8B%D0%B9%22%2C%22last_name%22%3A%22%D0%9F%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%22%2C%22username%22%3A%22testuser%22%2C%22language_code%22%3A%22ru%22%7D&auth_date=1676447296&hash=c5b65dabf38bd74ae4b179dda75892d94fa72bd7c45640e1549928fad3048dfa',
                initDataUnsafe: {
                    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
                    user: {
                        id: 123456789,
                        first_name: 'Тестовый',
                        last_name: 'Пользователь',
                        username: 'testuser',
                        language_code: 'ru'
                    },
                    auth_date: 1676447296,
                    hash: 'c5b65dabf38bd74ae4b179dda75892d94fa72bd7c45640e1549928fad3048dfa'
                },
                platform: 'web',
                colorScheme: 'light',
                version: '6.0',
                viewportHeight: window.innerHeight,
                viewportStableHeight: window.innerHeight,
                MainButton: {
                    isVisible: false,
                    show: function() { this.isVisible = true; console.log('MainButton show'); },
                    hide: function() { this.isVisible = false; console.log('MainButton hide'); },
                    setText: function(text) { console.log('MainButton setText:', text); },
                    onClick: function(callback) { console.log('MainButton onClick set'); }
                },
                BackButton: {
                    isVisible: false,
                    show: function() { this.isVisible = true; console.log('BackButton show'); },
                    hide: function() { this.isVisible = false; console.log('BackButton hide'); }
                },
                onEvent: function(eventName, callback) {
                    console.log('Subscribe to event:', eventName);
                }
            }
        };
        
        console.log('Telegram WebApp API successfully emulated');
        return window.Telegram.WebApp;
    },
    
    /**
     * Перенаправляет на главную страницу с параметрами обхода
     */
    redirectToMainWithBypass: function() {
        console.log('Redirecting to main with bypass');
        window.location.href = '/?bypass_auth=1&mobile=1';
    }
};

// Экспортируем в глобальную область для использования в HTML
window.BypassHelpers = BypassHelpers; 