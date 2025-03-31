/**
 * Скрипт для исправления стиля уточняющих вопросов в чате
 * 
 * Этот скрипт модифицирует функцию addFollowUpMessage, чтобы
 * уточняющие вопросы выглядели как обычные сообщения бота.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Ждем, когда загрузится основной скрипт чата
    setTimeout(fixFollowUpMessages, 300);
    
    // Также устанавливаем наблюдатель за DOM для поиска уточняющих вопросов
    setupFollowUpObserver();
});

/**
 * Перехватывает оригинальную функцию добавления уточняющих вопросов и модифицирует ее
 */
function fixFollowUpMessages() {
    // Проверяем, существует ли функция addFollowUpMessage
    if (typeof window.addFollowUpMessage === 'function') {
        console.log('🔄 Модифицируем функцию добавления уточняющих вопросов...');
        
        // Сохраняем оригинальную функцию
        const originalAddFollowUp = window.addFollowUpMessage;
        
        // Заменяем на нашу модифицированную версию
        window.addFollowUpMessage = function(message) {
            const chatMessages = window.getChatMessagesContainer ? window.getChatMessagesContainer() : 
                document.querySelector('.chat-messages');
            
            if (!chatMessages) {
                console.error('❌ Не найден контейнер сообщений чата');
                // Вызываем оригинальную функцию как запасной вариант
                return originalAddFollowUp(message);
            }
            
            // Создаем уникальный ID
            const messageId = 'follow-up-' + Date.now();
            
            // Создаем элемент с ОБЫЧНОЙ структурой сообщения бота (без специальных стилей)
            const messageElement = document.createElement('div');
            messageElement.className = 'message-wrapper bot-message';
            messageElement.id = messageId;
            
            // Добавляем стандартный HTML для сообщения бота
            messageElement.innerHTML = `
                <div class="avatar bot-avatar">
                    <div class="avatar-inner">🤖</div>
                </div>
                <div class="message-container">
                    <div class="message-text">${message}</div>
                    <div class="message-time">${getCurrentTime()}</div>
                </div>
            `;
            
            // Добавляем в контейнер
            chatMessages.appendChild(messageElement);
            
            // Прокручиваем к новому сообщению
            messageElement.scrollIntoView({ behavior: 'smooth' });
            
            // Логируем информацию (сохраняем оригинальное поведение)
            console.log(`📣 Показан уточняющий вопрос (стандартный стиль): "${message}"`);
            
            // Увеличиваем счетчики (если они существуют)
            if (typeof window.followUpCounter !== 'undefined') window.followUpCounter++;
            if (typeof window.totalFollowUpCount !== 'undefined') window.totalFollowUpCount++;
            
            return messageId;
        };
        
        console.log('✅ Функция добавления уточняющих вопросов успешно модифицирована');
        return true;
    } else {
        console.log('❌ Функция addFollowUpMessage не найдена');
        return false;
    }
}

/**
 * Наблюдатель за DOM для поиска и исправления уже существующих уточняющих вопросов
 */
function setupFollowUpObserver() {
    // Конфигурация observer
    const config = { 
        childList: true, 
        subtree: true,
        attributes: true
    };
    
    // Колбэк при изменениях в DOM
    const callback = function(mutationsList, observer) {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Ищем уточняющие вопросы в DOM
                const clarifyQuestions = document.querySelectorAll('.clarify-question');
                if (clarifyQuestions.length > 0) {
                    // Для каждого уточняющего вопроса применяем исправление стиля
                    clarifyQuestions.forEach(fixExistingFollowUp);
                }
            }
        }
    };
    
    // Создаем и запускаем наблюдатель
    const observer = new MutationObserver(callback);
    observer.observe(document.body, config);
    console.log('✅ Наблюдатель за уточняющими вопросами запущен');
    
    // Также проверяем существующие уточняющие вопросы
    const existingClarifyQuestions = document.querySelectorAll('.clarify-question');
    if (existingClarifyQuestions.length > 0) {
        console.log(`🔍 Найдено ${existingClarifyQuestions.length} существующих уточняющих вопросов`);
        existingClarifyQuestions.forEach(fixExistingFollowUp);
    }
}

/**
 * Исправляет стиль существующего уточняющего вопроса
 * @param {HTMLElement} element - Элемент уточняющего вопроса
 */
function fixExistingFollowUp(element) {
    // Проверяем, что это элемент с нужными классами
    if (!element || !element.classList.contains('clarify-question')) return;
    
    // Удаляем класс clarify-question
    element.classList.remove('clarify-question');
    
    // Находим лишние элементы для удаления
    const pulseIndicator = element.querySelector('.pulse-indicator');
    const clarifyHeader = element.querySelector('.clarify-header');
    
    // Удаляем их, если найдены
    if (pulseIndicator) pulseIndicator.remove();
    if (clarifyHeader) clarifyHeader.remove();
    
    // Исправляем иконку аватара, если она другая
    const avatarInner = element.querySelector('.avatar-inner');
    if (avatarInner && avatarInner.textContent === '❓') {
        avatarInner.textContent = '🤖';
    }
    
    // Сбрасываем фон контейнера сообщения на обычный (белый)
    const messageContainer = element.querySelector('.message-container');
    if (messageContainer) {
        messageContainer.style.backgroundColor = '#fff';
    }
    
    // Убираем левую рамку
    element.style.borderLeft = 'none';
    
    console.log('✅ Исправлен стиль существующего уточняющего вопроса');
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