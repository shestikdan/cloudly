/**
 * Скрипт для исправления стиля первого сообщения в чате
 * 
 * Этот скрипт находит первое сообщение с классами message message-bot
 * и заменяет его на структуру, идентичную последующим сообщениям бота.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Пробуем сразу исправить сообщение
    setTimeout(fixFirstChatMessage, 100);
    
    // Также устанавливаем наблюдатель за DOM для гарантированного поиска первого сообщения
    setupMutationObserver();
    
    // И на всякий случай подписываемся на глобальное событие открытия чата
    if (window.openChat) {
        const originalOpenChat = window.openChat;
        window.openChat = function() {
            originalOpenChat.apply(this, arguments);
            setTimeout(fixFirstChatMessage, 300);
        };
        console.log('✅ Перехватили метод openChat для запуска фикса первого сообщения');
    }
    
    // Также вешаем глобальную функцию для возможности ручного вызова
    window.fixFirstChatMessage = fixFirstChatMessage;
});

/**
 * Наблюдатель за изменениями DOM для поиска первого сообщения
 */
function setupMutationObserver() {
    // Конфигурация observer - наблюдаем за изменениями в дочерних элементах и их атрибутах
    const config = { 
        childList: true, 
        subtree: true,
        attributes: true
    };
    
    // Колбэк при изменениях в DOM
    const callback = function(mutationsList, observer) {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Проверяем, не появилось ли первое сообщение
                const firstMessage = document.querySelector('.message.message-bot');
                if (firstMessage) {
                    console.log('🔍 MutationObserver: обнаружено первое сообщение');
                    fixFirstChatMessage();
                    
                    // Останавливаем наблюдатель после успешного исправления
                    if (!document.querySelector('.message.message-bot')) {
                        observer.disconnect();
                        console.log('✅ MutationObserver: задача выполнена, наблюдение остановлено');
                    }
                }
            }
        }
    };
    
    // Создаем и запускаем наблюдатель
    const observer = new MutationObserver(callback);
    observer.observe(document.body, config);
    console.log('✅ MutationObserver: наблюдатель за DOM запущен');
}

/**
 * Исправляет стиль первого сообщения
 */
function fixFirstChatMessage() {
    console.log('🔄 Проверка и исправление первого сообщения чата...');
    
    // Находим первое сообщение по всем возможным селекторам
    const firstMessage = document.querySelector('.message.message-bot') || 
                        document.querySelector('.chat-messages > .message') ||
                        document.querySelector('.chat-messages > div:first-child');
    
    if (firstMessage) {
        // Сохраняем текст сообщения
        const text = firstMessage.textContent.trim();
        console.log('✅ Найдено первое сообщение с текстом:', text);
        
        // Если сообщение уже имеет правильную структуру, пропускаем
        if (firstMessage.classList.contains('message-wrapper') && 
            firstMessage.querySelector('.message-container')) {
            console.log('ℹ️ Сообщение уже имеет правильную структуру');
            return false;
        }
        
        // Создаем новый элемент с правильной структурой
        const newElement = document.createElement('div');
        newElement.className = 'message-wrapper bot-message';
        
        // Добавляем HTML-структуру, идентичную другим сообщениям
        newElement.innerHTML = `
            <div class="avatar bot-avatar">
                <div class="avatar-inner">🤖</div>
            </div>
            <div class="message-container">
                <div class="message-text">${text}</div>
                <div class="message-time">${getCurrentTime()}</div>
            </div>
        `;
        
        // Заменяем старый элемент на новый
        firstMessage.parentNode.replaceChild(newElement, firstMessage);
        console.log('✅ Первое сообщение успешно заменено на улучшенную версию');
        
        return true;
    } else {
        console.log('ℹ️ Первое сообщение не найдено в текущем состоянии DOM');
        return false;
    }
}

/**
 * Получение текущего времени в формате ЧЧ:ММ
 * @returns {string} Текущее время
 */
function getCurrentTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
} 