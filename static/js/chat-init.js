/**
 * КПТ-Дневник - Чат интерфейс
 * Версия: 2.0
 * 
 * Этот файл содержит логику работы чат-интерфейса для когнитивно-поведенческого дневника.
 * Основные функции:
 * - Отображение вопросов в формате чата
 * - Анализ ответов пользователя на полноту
 * - Отображение уточняющих вопросов при необходимости
 */

// Конфигурация API
const API_CONFIG = {
    analyzeUrl: '/api/analyze-response',
    headers: {
        'Content-Type': 'application/json'
    }
};

// Функция для получения базового URL API
function getApiBaseUrl() {
    // Если мы в Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        return window.location.origin;
    }
    // Для локальной разработки
    return 'http://localhost:5001';
}

// Функция для выполнения API запросов
async function makeApiRequest(url, options = {}) {
    try {
        const baseUrl = getApiBaseUrl();
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
        
        console.log('Making API request to:', fullUrl);
        
        const response = await fetch(fullUrl, {
            ...options,
            headers: {
                ...API_CONFIG.headers,
                ...options.headers
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// Глобальные переменные для отслеживания состояния
window.currentQuestionIndex = 0; // Индекс текущего вопроса
window.followUpCounter = 0; // Счетчик уточняющих вопросов для текущего вопроса
window.totalFollowUpCount = 0; // Общий счетчик уточняющих вопросов
window.userResponses = {}; // Объект для хранения ответов пользователя

// Массив вопросов для диалога
window.chatQuestions = [
    {
        id: "situation",
        question_text: "Опишите событие, вызвавшее сильные эмоции. Где, когда, с кем это произошло?",
        type: "situation"
    },
    {
        id: "thoughts",
        question_text: "Какие мысли пришли вам в голову в этот момент?",
        type: "thoughts"
    },
    {
        id: "emotions",
        question_text: "Какие эмоции вы испытывали? Выберите из предложенных вариантов.",
        type: "emotions"
    },
    {
        id: "intensity",
        question_text: "Выберите интенсивность этой эмоции от 1 до 10.",
        type: "intensity"
    },
    {
        id: "body",
        question_text: "Опишите, как отреагировало ваше тело (учащенное сердцебиение, напряжение, потливость и т.д.)",
        type: "body"
    },
    {
        id: "evidence_for",
        question_text: "Есть ли реальные доказательства того, что ваша мысль соответствует действительности?",
        type: "evidence_for"
    },
    {
        id: "evidence_against",
        question_text: "Есть ли факты, которые опровергают вашу мысль?",
        type: "evidence_against"
    },
    {
        id: "reframe",
        question_text: "Как можно переосмыслить эту ситуацию более объективно?",
        type: "reframe"
    },
    {
        id: "emotion_change",
        question_text: "Как изменилась ваша эмоция после переоценки ситуации? Оцените от 1 до 10.",
        type: "emotion_change"
    },
    {
        id: "future_plan",
        question_text: "Что можно сделать по-другому в будущем, чтобы справиться с подобной ситуацией?",
        type: "future_plan"
    }
];

// Инициализация чата
document.addEventListener('DOMContentLoaded', function() {
    console.log('Чат КПТ-дневника инициализирован');
    // Добавляем стили для чата
    addChatStyles();
    initChat();
    
    // Дополнительно запускаем замену первого сообщения с небольшой задержкой
    // для гарантированной замены, даже если страница модифицируется после загрузки
    setTimeout(() => {
        if (!window.initialQuestionReplaced) {
            console.log('🔄 Повторная попытка замены первого сообщения');
            replaceInitialQuestion();
        }
    }, 500);
});

/**
 * Инициализация чата
 */
function initChat() {
    // Найти и проверить элементы интерфейса
    const chatContainer = document.getElementById('chatContainer');
    const chatMessages = getChatMessagesContainer();
    const chatInput = document.getElementById('chatInput') || document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton') || document.getElementById('chatSend');
    
    // Проверка наличия необходимых элементов
    if (!chatContainer || !chatMessages || !chatInput || !sendButton) {
        console.error('❌ Ошибка: не найдены необходимые элементы интерфейса чата:', {
            chatContainer: !!chatContainer,
            chatMessages: !!chatMessages,
            chatInput: !!chatInput,
            sendButton: !!sendButton
        });
        return;
    }
    
    // Стилизуем кнопку отправки, если она не содержит содержимого
    if (sendButton.innerHTML.trim() === '') {
        sendButton.innerHTML = '➤';
    }
    
    // Проверяем наличие контейнера ввода, иначе создаем его
    let inputContainer = document.querySelector('.chat-input-container');
    if (!inputContainer) {
        // Найдем родителя для input и button
        const inputParent = chatInput.parentNode;
        const buttonParent = sendButton.parentNode;
        
        // Создаем новый контейнер для ввода
        inputContainer = document.createElement('div');
        inputContainer.className = 'chat-input-container';
        
        // Если input и button в одном родителе
        if (inputParent === buttonParent) {
            // Заменяем содержимое родителя на наш контейнер
            inputParent.innerHTML = '';
            inputParent.appendChild(inputContainer);
            inputContainer.appendChild(chatInput);
            inputContainer.appendChild(sendButton);
        } else {
            // Если они в разных родителях, вставляем контейнер после сообщений
            chatMessages.parentNode.insertBefore(inputContainer, chatMessages.nextSibling);
            inputContainer.appendChild(chatInput);
            inputContainer.appendChild(sendButton);
        }
        
        console.log('✅ Создан и стилизован контейнер для ввода сообщений');
    }
    
    // Добавляем обработчики событий
    sendButton.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });
    
    // Применяем стили к существующим сообщениям
    applyStylesToExistingMessages();
    
    // Найдем существующий первый вопрос в DOM и заменим его на стилизованную версию
    replaceInitialQuestion();
    
    // Отображаем первый вопрос (если его нет в DOM)
    if (!window.initialQuestionReplaced) {
        showNextQuestion();
    }
    
    console.log('✅ Чат инициализирован успешно');
}

/**
 * Применяет стили к существующим сообщениям в DOM
 */
function applyStylesToExistingMessages() {
    const existingMessages = document.querySelectorAll('.chat-messages > div:not(.message-wrapper)');
    
    if (existingMessages.length > 0) {
        console.log(`🎨 Применяем стили к ${existingMessages.length} существующим сообщениям`);
        
        existingMessages.forEach((message, index) => {
            // Определяем, это сообщение бота или пользователя
            const isBot = index === 0 || message.classList.contains('bot') || 
                         !message.classList.contains('user') && !message.nextElementSibling;
            
            // Получаем текст сообщения
            const messageText = message.textContent.trim();
            
            // Создаем новый элемент с правильной структурой
            const newElement = document.createElement('div');
            newElement.className = isBot ? 'message-wrapper bot-message' : 'message-wrapper user-message';
            
            if (isBot) {
                // Структура для сообщения бота
                newElement.innerHTML = `
                    <div class="avatar bot-avatar">
                        <div class="avatar-inner">🤖</div>
                    </div>
                    <div class="message-container">
                        <div class="message-text">${messageText}</div>
                        <div class="message-time">${getCurrentTime()}</div>
                    </div>
                `;
            } else {
                // Структура для сообщения пользователя
                newElement.innerHTML = `
                    <div class="message-container">
                        <div class="message-text">${messageText}</div>
                        <div class="message-time">${getCurrentTime()}</div>
                    </div>
                    <div class="avatar user-avatar">
                        <div class="avatar-inner">👤</div>
                    </div>
                `;
            }
            
            // Заменяем старый элемент на новый
            message.parentNode.replaceChild(newElement, message);
        });
        
        console.log('✅ Стили применены ко всем существующим сообщениям');
    }
}

/**
 * Заменяет начальный вопрос, уже существующий в DOM, на стилизованную версию
 */
function replaceInitialQuestion() {
    const chatMessages = getChatMessagesContainer();
    
    // Ищем текст первого вопроса всеми возможными способами
    let questionText = '';

    // Метод 1: Пытаемся найти сообщение в DOM без наших классов
    const existingMessages = document.querySelectorAll('.chat-messages > *');
    
    if (existingMessages.length > 0) {
        // Берем текст первого сообщения, даже если оно уже имеет наши классы
        const firstMessageElement = existingMessages[0];
        questionText = firstMessageElement.textContent.trim();
        
        // Удаляем первое сообщение
        if (firstMessageElement.parentNode) {
            firstMessageElement.parentNode.removeChild(firstMessageElement);
        }
        
        console.log('🔄 Удалено существующее первое сообщение с текстом:', questionText);
    }
    
    // Метод 2: Если не нашли текст, берем из массива вопросов
    if (!questionText && window.chatQuestions && window.chatQuestions.length > 0) {
        questionText = window.chatQuestions[0].question_text;
        console.log('🔄 Используем текст из массива вопросов:', questionText);
    }
    
    // Если нашли текст вопроса - создаем новое сообщение с правильной структурой
    if (questionText) {
        // Создаем новое сообщение с точно такой же структурой, как у других бот-сообщений
        const messageElement = document.createElement('div');
        messageElement.className = 'message-wrapper bot-message';
        
        messageElement.innerHTML = `
            <div class="avatar bot-avatar">
                <div class="avatar-inner">🤖</div>
            </div>
            <div class="message-container">
                <div class="message-text">${questionText}</div>
                <div class="message-time">${getCurrentTime()}</div>
            </div>
        `;
        
        // Добавляем в начало контейнера сообщений
        if (chatMessages.firstChild) {
            chatMessages.insertBefore(messageElement, chatMessages.firstChild);
        } else {
            chatMessages.appendChild(messageElement);
        }
        
        // Отмечаем, что первый вопрос был заменен
        window.initialQuestionReplaced = true;
        
        console.log('✅ Первый вопрос заменен на стилизованную версию с точной структурой HTML');
        return true;
    }
    
    return false;
}

/**
 * Получение контейнера сообщений с учетом разных возможных идентификаторов
 * @returns {HTMLElement} Контейнер сообщений
 */
function getChatMessagesContainer() {
    // Пробуем найти по разным селекторам
    const chatMessages = 
        document.getElementById('chatMessages') || 
        document.querySelector('.chat-messages');
    
    // Если не найден, создаем новый контейнер
    if (!chatMessages) {
        console.warn('⚠️ Контейнер сообщений не найден, создаем новый');
        
        const newContainer = document.createElement('div');
        newContainer.id = 'chatMessages';
        newContainer.className = 'chat-messages';
        
        // Добавляем в контейнер чата или в body
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            chatContainer.appendChild(newContainer);
        } else {
            document.body.appendChild(newContainer);
        }
        
        return newContainer;
    }
    
    return chatMessages;
}

/**
 * Обработчик отправки сообщения пользователя
 */
function handleSendMessage() {
    const chatInput = document.getElementById('chatInput') || document.getElementById('userInput');
    if (!chatInput) {
        console.error('❌ Ошибка: элемент ввода не найден');
        return;
    }
    
    const userMessage = chatInput.value.trim();
    if (!userMessage) {
        console.warn('⚠️ Пустое сообщение, не отправляем');
        return;
    }
    
    // Отображаем сообщение пользователя
    addUserMessage(userMessage);
    
    // Очищаем поле ввода
    chatInput.value = '';
    
    // Анализируем ответ
    analyzeUserResponse(userMessage);
}

/**
 * Добавление сообщения бота в чат
 * @param {string} message Текст сообщения
 * @param {boolean} isEndMessage Является ли сообщение завершающим
 */
function addBotMessage(message, isEndMessage = false) {
    const chatMessages = getChatMessagesContainer();
    
    // Создаем элемент сообщения
    const messageElement = document.createElement('div');
    messageElement.className = 'message-wrapper bot-message';
    
    if (isEndMessage) {
        messageElement.classList.add('end-message');
    }
    
    // Добавляем содержимое с аватаром
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
}

/**
 * Добавление сообщения пользователя в чат
 * @param {string} message Текст сообщения
 */
function addUserMessage(message) {
    const chatMessages = getChatMessagesContainer();
    
    // Создаем элемент сообщения
    const messageElement = document.createElement('div');
    messageElement.className = 'message-wrapper user-message';
    
    // Добавляем содержимое с аватаром
    messageElement.innerHTML = `
        <div class="message-container">
            <div class="message-text">${message}</div>
            <div class="message-time">${getCurrentTime()}</div>
        </div>
        <div class="avatar user-avatar">
            <div class="avatar-inner">👤</div>
        </div>
    `;
    
    // Добавляем в контейнер
    chatMessages.appendChild(messageElement);
    
    // Прокручиваем к новому сообщению
    messageElement.scrollIntoView({ behavior: 'smooth' });
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

/**
 * Добавление уточняющего вопроса в чат
 * @param {string} message Текст уточняющего вопроса
 * @returns {string} ID созданного элемента
 */
function addFollowUpMessage(message) {
    const chatMessages = getChatMessagesContainer();
    
    // Создаем уникальный ID
    const messageId = 'follow-up-' + Date.now();
    
    // Создаем элемент уточняющего вопроса
    const followUpElement = document.createElement('div');
    followUpElement.className = 'message-wrapper bot-message clarify-question';
    followUpElement.id = messageId;
    
    // Добавляем содержимое с индикатором и заголовком
    followUpElement.innerHTML = `
        <div class="avatar bot-avatar">
            <div class="avatar-inner">❓</div>
        </div>
        <div class="message-container">
            <div class="pulse-indicator"></div>
            <div class="clarify-header">
                <span class="clarify-icon">❓</span>
                <span class="clarify-title">Уточняющий вопрос</span>
            </div>
            <div class="message-text">${message}</div>
            <div class="message-time">${getCurrentTime()}</div>
        </div>
    `;
    
    // Добавляем в контейнер
    chatMessages.appendChild(followUpElement);
    
    // Проигрываем звук уведомления
    playNotificationSound();
    
    // Прокручиваем к новому сообщению
    followUpElement.scrollIntoView({ behavior: 'smooth' });
    
    // Увеличиваем счетчики
    window.followUpCounter++;
    window.totalFollowUpCount++;
    
    console.log(`📣 Показан уточняющий вопрос #${window.followUpCounter}: "${message}"`);
    console.log(`📊 Всего уточняющих вопросов в сессии: ${window.totalFollowUpCount}`);
    
    return messageId;
}

/**
 * Добавление стилей для чата
 */
function addChatStyles() {
    // Проверяем, есть ли уже стили
    if (document.getElementById('chat-styles')) {
        return;
    }
    
    // Создаем элемент стилей
    const styleElement = document.createElement('style');
    styleElement.id = 'chat-styles';
    
    // Добавляем стили для чата
    styleElement.innerHTML = `
        /* Общие стили для чата */
        #chatContainer {
            display: flex;
            flex-direction: column;
            height: 100%;
            background-color: #f0f2f5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        /* Стили для сообщений */
        .message-wrapper {
            display: flex;
            align-items: flex-end;
            margin-bottom: 8px;
            max-width: 90%;
            animation: fadeIn 0.3s ease-in-out;
        }
        
        .user-message {
            align-self: flex-end;
            margin-left: auto;
            flex-direction: row-reverse;
        }
        
        .bot-message {
            align-self: flex-start;
            margin-right: auto;
        }
        
        .message-container {
            margin: 0 8px;
            padding: 10px 14px;
            border-radius: 18px;
            position: relative;
            max-width: 85%;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        
        .user-message .message-container {
            background-color: #dcf8c6;
            border-top-right-radius: 4px;
        }
        
        .bot-message .message-container {
            background-color: #fff;
            border-top-left-radius: 4px;
        }
        
        .clarify-question .message-container {
            background-color: #f8e6ff;
        }
        
        .message-text {
            font-size: 15px;
            line-height: 1.4;
            word-wrap: break-word;
        }
        
        .message-time {
            font-size: 11px;
            color: #999;
            text-align: right;
            margin-top: 4px;
        }
        
        /* Стили для аватаров */
        .avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        
        .bot-avatar {
            background-color: #4080ff;
        }
        
        .user-avatar {
            background-color: #34b7f1;
        }
        
        .avatar-inner {
            font-size: 18px;
        }
        
        /* Стили для уточняющих вопросов */
        .clarify-question {
            border-left: 4px solid #9C27B0 !important;
            margin-bottom: 15px !important;
            position: relative;
        }
        
        .clarify-question .message-container {
            background-color: #f8e6ff;
        }
        
        .clarify-header {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
            color: #9C27B0;
            font-weight: bold;
        }
        
        .clarify-icon {
            margin-right: 8px;
            font-size: 1.2em;
        }
        
        .pulse-indicator {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: #9C27B0;
            animation: pulse 2s infinite;
        }
        
        /* Стили для индикатора анализа */
        .analyze-indicator {
            align-self: center;
            display: flex;
            align-items: center;
            padding: 10px 16px;
            background-color: #f5f5f5;
            border-radius: 18px;
            margin: 8px 0;
            font-style: italic;
            color: #666;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        
        .spinner {
            width: 16px;
            height: 16px;
            margin-right: 10px;
            border: 3px solid #ddd;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        /* Стили для формы ввода */
        .chat-input-container {
            display: flex;
            align-items: center;
            padding: 10px;
            background-color: #fff;
            border-top: 1px solid #e6e6e6;
        }
        
        #chatInput, #userInput {
            flex: 1;
            padding: 12px 16px;
            border: none;
            border-radius: 24px;
            background-color: #f0f2f5;
            font-size: 15px;
            outline: none;
            transition: background-color 0.2s;
        }
        
        #chatInput:focus, #userInput:focus {
            background-color: #e6e6e6;
        }
        
        #sendButton, #chatSend {
            width: 40px;
            height: 40px;
            margin-left: 8px;
            border: none;
            border-radius: 50%;
            background-color: #0084ff;
            color: white;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
        }
        
        #sendButton:hover, #chatSend:hover {
            background-color: #0070e0;
        }
        
        /* Анимации */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
            0% {
                transform: scale(0.95);
                box-shadow: 0 0 0 0 rgba(156, 39, 176, 0.7);
            }
            
            70% {
                transform: scale(1);
                box-shadow: 0 0 0 10px rgba(156, 39, 176, 0);
            }
            
            100% {
                transform: scale(0.95);
                box-shadow: 0 0 0 0 rgba(156, 39, 176, 0);
            }
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    
    // Добавляем стили в head
    document.head.appendChild(styleElement);
    
    console.log('✅ Стили чата добавлены');
}

/**
 * Проигрывание звука уведомления
 */
function playNotificationSound() {
    try {
        const audio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAASAAAeMwAUFBQUFCIiIiIiIjAwMDAwMD4+Pj4+PkxMTExMTFpaWlpaWmhoaGhoaHZ2dnZ2doSEhISEhJKSkpKSkqCgoKCgoK6urq6urrKysrKysr6+vr6+vsLCwsLCwtbW1tbW1uTk5OTk5PLy8vLy8v7+/v7+/v///////////////8BTU0UAAAALQQAABzQJAL/jXgAAAAD/UBgZGRkZGBgSEhIAAAAAAAAAAAEQgICAf4CAAAH0gH/AADAwMP8AAP/+7UZ///tRm8UKgoKCgpg4QEQQAABBBQgICAoKCgAGBgTQMXGqqqqqqqqqqMXu26urq6vz8/WIiIiJKSkpKSvT09EREREX5+fn5+YQYI/z8/P39+Yf39/eXl5eXl73d3d3d3d3u7u7u7u7x8fHx8fH4+Pj4+Pjh4eHh4eGHh4eHh4d3d3d3d3chISEhISEgICAgICB+fn5+fn49PT09PT0oKCgoKCgPDw8PDw8BAQEBAQEAAAAkz9335L33vvfkz9335L33vvfkz9335L33vvfkz9335L33vvc=');
        audio.volume = 0.2;
        audio.play().catch(e => {
            console.warn("⚠️ Не удалось воспроизвести звук уведомления:", e);
        });
    } catch (e) {
        console.warn("⚠️ Ошибка при воспроизведении звука:", e);
    }
}

/**
 * Анализ ответа пользователя на полноту
 * @param {string} userMessage Ответ пользователя
 */
function analyzeUserResponse(userMessage) {
    // Добавляем индикатор анализа
    const analyzeIndicator = addAnalyzeIndicator();
    
    // Получаем текущий вопрос
    const currentQuestion = window.chatQuestions[window.currentQuestionIndex];
    if (!currentQuestion) {
        console.error('❌ Ошибка: текущий вопрос не найден', window.currentQuestionIndex);
        return;
    }
    
    // Проверяем, является ли это ответом на уточняющий вопрос
    const isFollowUpResponse = window.followUpCounter > 0;
    
    // Если это ответ на уточняющий вопрос, объединяем его с предыдущим ответом
    if (isFollowUpResponse && window.userResponses[currentQuestion.id]) {
        console.log('📝 Обнаружен ответ на уточняющий вопрос. Объединяем с предыдущим ответом');
        // Берем предыдущий ответ
        const previousResponse = window.userResponses[currentQuestion.id];
        // Объединяем ответы
        const combinedResponse = previousResponse + " " + userMessage;
        
        // Заменяем последний ответ в массиве на объединенный
        window.userResponses[currentQuestion.id] = combinedResponse;
        
        console.log(`📋 Объединенный ответ: "${combinedResponse}"`);
    } else {
        // Если это новый ответ, просто сохраняем его
        window.userResponses[currentQuestion.id] = userMessage;
    }
    
    // Формируем данные для отправки
    // Для анализа всегда используем последний ответ (который теперь может быть объединенным)
    const answerToAnalyze = window.userResponses[currentQuestion.id];
    
    const requestData = {
        question: currentQuestion.question_text,
        answer: answerToAnalyze,
        type: currentQuestion.type || 'unknown'
    };
    
    console.log('🔍 Отправляем данные на анализ:', requestData);
    
    // Отправляем запрос к API
    fetch(API_CONFIG.analyzeUrl, {
        method: 'POST',
        headers: API_CONFIG.headers,
        body: JSON.stringify(requestData)
    })
    .then(response => {
        // Логируем информацию о статусе ответа
        console.log(`📋 Ответ сервера: ${response.status} ${response.statusText} (успех: ${response.ok})`);
        
        // Если ответ не успешный, генерируем ошибку
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(`Ошибка от сервера: ${response.status} ${response.statusText}. Тело ответа: ${text}`);
            });
        }
        
        return response.json();
    })
    .then(analysis => {
        // Удаляем индикатор анализа
        removeAnalyzeIndicator(analyzeIndicator);
        
        // Выводим результаты анализа в консоль
        logAnalysisResults(analysis);
        
        // Если есть уточняющий вопрос, коэффициент качества ответа меньше порогового,
        // и мы еще не задавали уточняющий вопрос для текущего вопроса
        if (analysis.follow_up && analysis.score < 0.7 && window.followUpCounter <= 0) {
            setTimeout(() => {
                addFollowUpMessage(analysis.follow_up);
            }, 800);
        } else {
            // Если ответ полный или мы уже задали уточняющий вопрос, переходим к следующему вопросу
            window.followUpCounter = 0;
            window.currentQuestionIndex++;
            
            setTimeout(() => {
                showNextQuestion();
            }, 800);
        }
    })
    .catch(error => {
        console.error('❌ Ошибка при анализе ответа:', error);
        
        // Удаляем индикатор анализа
        removeAnalyzeIndicator(analyzeIndicator);
        
        // Используем тестовые данные при ошибке
        console.warn('🔄 Используем тестовые данные из-за ошибки соединения с сервером');
        
        const testAnalysis = {
            score: 0.4,
            missing: 'Тестовый режим при ошибке: не хватает деталей и контекста',
            follow_up: 'Можете рассказать подробнее? (Тестовый режим при ошибке соединения)'
        };
        
        // Логируем тестовые результаты
        logAnalysisResults(testAnalysis, true);
        
        // Показываем тестовый уточняющий вопрос только если коэффициент качества ответа меньше порогового
        // и мы еще не задавали уточняющий вопрос для текущего вопроса
        if (testAnalysis.score < 0.7 && window.followUpCounter <= 0) {
            setTimeout(() => {
                addFollowUpMessage(testAnalysis.follow_up);
            }, 800);
        } else {
            // Если ответ полный или мы уже задали уточняющий вопрос, переходим к следующему вопросу
            window.followUpCounter = 0;
            window.currentQuestionIndex++;
            
            setTimeout(() => {
                showNextQuestion();
            }, 800);
        }
    });
}

/**
 * Добавление индикатора анализа ответа
 * @returns {HTMLElement} Элемент индикатора
 */
function addAnalyzeIndicator() {
    const chatMessages = getChatMessagesContainer();
    
    const indicator = document.createElement('div');
    indicator.className = 'analyze-indicator';
    indicator.innerHTML = '<div class="spinner"></div><span>Анализирую ответ...</span>';
    
    // Добавляем стили для индикатора, если их еще нет
    if (!document.getElementById('indicator-styles')) {
        const style = document.createElement('style');
        style.id = 'indicator-styles';
        style.innerHTML = `
            .analyze-indicator {
                display: flex;
                align-items: center;
                padding: 10px;
                background-color: #f5f5f5;
                border-radius: 8px;
                margin-bottom: 10px;
                font-style: italic;
                color: #666;
            }
            
            .spinner {
                width: 20px;
                height: 20px;
                margin-right: 10px;
                border: 3px solid #ddd;
                border-top: 3px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    chatMessages.appendChild(indicator);
    indicator.scrollIntoView({ behavior: 'smooth' });
    
    return indicator;
}

/**
 * Удаление индикатора анализа
 * @param {HTMLElement} indicator Элемент индикатора
 */
function removeAnalyzeIndicator(indicator) {
    if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
    }
}

/**
 * Логирование результатов анализа в консоль
 * @param {Object} analysis Результаты анализа
 * @param {boolean} isTestMode Флаг тестового режима
 */
function logAnalysisResults(analysis, isTestMode = false) {
    const groupTitle = isTestMode 
        ? '📊 Результаты анализа ответа (ТЕСТОВЫЙ РЕЖИМ)'
        : '📊 Результаты анализа ответа';
        
    console.group(groupTitle);
    
    // Определяем цвет для коэффициента
    const scoreColor = analysis.score >= 0.7 ? '#4CAF50' : '#FF5722';
    
    // Выводим коэффициент полноты
    console.log(`%c Коэффициент полноты: ${analysis.score ? analysis.score.toFixed(2) : 'N/A'} из 1.0`,
        `background: ${scoreColor}; color: white; font-weight: bold; padding: 5px; border-radius: 3px;`);
    
    // Визуальный индикатор полноты ответа
    const percentage = Math.round((analysis.score || 0) * 100);
    const barLength = 30;
    const filledBars = Math.round((analysis.score || 0) * barLength);
    const emptyBars = barLength - filledBars;
    const scoreBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
    
    console.log(`Полнота ответа: ${percentage}% [${scoreBar}]`);
    
    // Выводим информацию о недостающих деталях
    if (analysis.missing) {
        console.log(`%c Чего не хватает: ${analysis.missing}`,
            'background: #2196F3; color: white; padding: 2px 5px; border-radius: 3px;');
    }
    
    // Выводим уточняющий вопрос или информацию о его отсутствии
    if (analysis.follow_up) {
        console.log(`%c Уточняющий вопрос: "${analysis.follow_up}"`,
            'background: #9C27B0; color: white; padding: 2px 5px; border-radius: 3px;');
                } else {
        console.log(`%c Уточняющий вопрос: не требуется`,
            'background: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;');
    }
    
    // Если тестовый режим, добавляем предупреждение
    if (isTestMode) {
        console.log(`%c ВНИМАНИЕ: Используется тестовый режим из-за ошибки соединения с сервером`,
            'background: #FF9800; color: white; font-weight: bold; padding: 5px; border-radius: 3px;');
    }
    
    console.log(`Решение: ${analysis.score < 0.7 ? 'Задать уточняющий вопрос' : 'Перейти к следующему вопросу'}`);
    console.groupEnd();
}

/**
 * Отображение следующего вопроса
 */
function showNextQuestion() {
    // Логируем информацию о переходе
    console.group(`🔄 Переход к вопросу #${window.currentQuestionIndex + 1}`);
    console.log(`%c Было задано ${window.followUpCounter} уточняющих вопросов для вопроса #${window.currentQuestionIndex}`,
        'background: #2196F3; color: white; padding: 3px 5px; border-radius: 3px;');
    console.log(`%c Всего за сессию задано ${window.totalFollowUpCount} уточняющих вопросов`,
        'background: #009688; color: white; padding: 3px 5px; border-radius: 3px;');
    console.groupEnd();
    
    // ДОПОЛНИТЕЛЬНОЕ ЛОГИРОВАНИЕ
    console.log('🔍 ПРОВЕРКА УСЛОВИЯ ЗАВЕРШЕНИЯ:');
    console.log(`   - window.currentQuestionIndex = ${window.currentQuestionIndex}`);
    console.log(`   - window.chatQuestions.length = ${window.chatQuestions.length}`);
    console.log(`   - Условие завершения: ${window.currentQuestionIndex >= window.chatQuestions.length}`);
    
    // Сбрасываем счетчик уточняющих вопросов
    window.followUpCounter = 0;
    
    // Если все вопросы заданы, показываем сообщение о завершении
    if (window.currentQuestionIndex >= window.chatQuestions.length) {
        console.log('🎯 УСЛОВИЕ ЗАВЕРШЕНИЯ ВЫПОЛНЕНО! Вызываем showEndMessage()');
        showEndMessage();
        return;
    }
    
    // Получаем текущий вопрос
    const currentQuestion = window.chatQuestions[window.currentQuestionIndex];
    
    if (!currentQuestion) {
        console.error(`❌ Ошибка: вопрос с индексом ${window.currentQuestionIndex} не найден`);
        return;
    }
    
    // Проверяем тип вопроса
    if (currentQuestion.type === "emotions") {
        // Для вопросов типа "emotions" используем специальную обработку
        console.log("💡 Обнаружен вопрос типа 'emotions'. Запрашиваем варианты эмоций...");
        
        // Отображаем вопрос
        addBotMessage(currentQuestion.question_text);
        
        // Получаем предыдущие ответы на вопросы о ситуации и мыслях
        const situationIndex = window.chatQuestions.findIndex(q => q.id === "situation");
        const thoughtsIndex = window.chatQuestions.findIndex(q => q.id === "thoughts");
        
        const situation = situationIndex >= 0 && window.userResponses["situation"] 
            ? window.userResponses["situation"] 
            : "";
        
        const thoughts = thoughtsIndex >= 0 && window.userResponses["thoughts"]
            ? window.userResponses["thoughts"]
            : "";
        
        // Получаем эмоции из API
        fetch('/api/analyze-emotions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                situation: situation,
                thoughts: thoughts
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Ошибка от сервера: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("✅ Получены эмоции от API:", data);
            
            // Проверяем, что эмоции вернулись
            if (data.success && data.emotions && Array.isArray(data.emotions)) {
                // Отображаем кнопки с эмоциями
                if (typeof window.createEmotionButtons === 'function') {
                    window.createEmotionButtons(data.emotions);
                } else {
                    console.error("❌ Функция createEmotionButtons не найдена!");
                    // Используем стандартные эмоции и создаем собственную функцию обработки
                    const defaultEmotions = ['Радость', 'Грусть', 'Страх', 'Гнев', 'Удивление'];
                    createEmotionButtonsFallback(defaultEmotions);
                }
            } else {
                console.error("❌ Некорректные данные от API:", data);
                // Используем стандартные эмоции как запасной вариант
                const defaultEmotions = ['Радость', 'Грусть', 'Страх', 'Гнев', 'Удивление'];
                if (typeof window.createEmotionButtons === 'function') {
                    window.createEmotionButtons(defaultEmotions);
                } else {
                    createEmotionButtonsFallback(defaultEmotions);
                }
            }
        })
        .catch(error => {
            console.error("❌ Ошибка при получении эмоций:", error);
            // Используем стандартные эмоции как запасной вариант
            const defaultEmotions = ['Радость', 'Грусть', 'Страх', 'Гнев', 'Удивление'];
            if (typeof window.createEmotionButtons === 'function') {
                window.createEmotionButtons(defaultEmotions);
            } else {
                createEmotionButtonsFallback(defaultEmotions);
            }
        });
    } else if (currentQuestion.type === "intensity") {
        // Для вопросов типа "intensity" используем специальную обработку
        console.log("💡 Обнаружен вопрос типа 'intensity'. Отображаем слайдер интенсивности...");
        
        // Отображаем вопрос
        addBotMessage(currentQuestion.question_text);
        
        // Создаем слайдер для выбора интенсивности эмоции
        setTimeout(() => {
            if (typeof window.createEmotionIntensitySlider === 'function') {
                window.createEmotionIntensitySlider();
            } else {
                createIntensitySliderFallback();
            }
        }, 500);
    } else if (currentQuestion.type === "emotion_change") {
        // Для вопросов типа "emotion_change" также используем слайдер интенсивности
        console.log("💡 Обнаружен вопрос типа 'emotion_change'. Отображаем слайдер интенсивности...");
        
        // Отображаем вопрос
        addBotMessage(currentQuestion.question_text);
        
        // Создаем слайдер для выбора изменения интенсивности эмоции
        setTimeout(() => {
            if (typeof window.createEmotionIntensitySlider === 'function') {
                window.createEmotionIntensitySlider();
            } else {
                createIntensitySliderFallback();
            }
        }, 500);
    } else {
        // Для остальных типов вопросов просто отображаем вопрос
        addBotMessage(currentQuestion.question_text);
    }
}

/**
 * Отображение сообщения о завершении
 */
function showEndMessage() {
    console.log('✅ Все вопросы были заданы. Завершение сеанса.');
    
    // ДОБАВЛЯЕМ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ
    console.log('🔍 ДИАГНОСТИКА userResponses:');
    console.log('typeof window.userResponses:', typeof window.userResponses);
    console.log('Является ли массивом:', Array.isArray(window.userResponses));
    console.log('Все ключи в userResponses:', Object.keys(window.userResponses));
    console.log('Значения в userResponses:', window.userResponses);
    
    const endMessage = 'Спасибо за ваши ответы! Этот анализ помог вам лучше понять свои эмоции и мысли. Вы можете закрыть окно чата или начать новый анализ.';
    
    // Отображаем сообщение
    addBotMessage(endMessage, true);
    
    // Выводим содержимое массива ответов
    console.log('📊 Итоговые ответы пользователя:');
    if (window.userResponses) {
        for (let id in window.userResponses) {
            console.log(`   ${id}: ${window.userResponses[id]}`);
        }
    } else {
        console.error('❌ Массив window.userResponses не найден!');
    }
    
    // Добавляем статистику
    console.log(`📊 Статистика сессии:`);
    console.log(`   - Всего вопросов: ${window.chatQuestions.length}`);
    console.log(`   - Всего было уточняющих вопросов: ${window.totalFollowUpCount || 0}`);
    
    // Сохраняем результаты анализа в базу данных
    if (window.userResponses && Object.keys(window.userResponses).length >= 8) {
        console.log('💾 Сохраняем результаты анализа в базу данных...');
        
        // Проверяем наличие функции сохранения
        if (typeof window.saveAnalysisResults === 'function') {
            console.log('✅ Функция saveAnalysisResults найдена, вызываем...');
            // Вызываем функцию сохранения из index.html
            window.saveAnalysisResults()
                .then(result => {
                    console.log('✅ Результаты успешно сохранены:', result);
                })
                .catch(error => {
                    console.error('❌ Ошибка при сохранении результатов:', error);
                });
        } else {
            console.error('❌ Функция saveAnalysisResults не найдена в глобальном объекте window!');
            console.log('Доступные свойства в window:', Object.keys(window).filter(k => k.includes('save') || k.includes('analysis')));
        }
    } else {
        console.warn('⚠️ Недостаточно ответов для сохранения результатов анализа.');
        if (window.userResponses) {
            console.log('Текущее количество ответов:', Object.keys(window.userResponses).length);
        }
    }
}

/**
 * Функция для тестирования уточняющих вопросов
 * @param {string} message Текст уточняющего вопроса
 * @returns {string} Сообщение о результате
 */
window.testFollowUpQuestion = function(message) {
    if (!message) {
        message = 'Можете рассказать подробнее о ситуации? (Тестовый уточняющий вопрос)';
    }
    
    console.group('🧪 ТЕСТИРОВАНИЕ УТОЧНЯЮЩЕГО ВОПРОСА');
    console.log(`%c Отправляем тестовый уточняющий вопрос: ${message}`,
        'background: #9C27B0; color: white; font-weight: bold; padding: 5px; border-radius: 3px;');
    console.groupEnd();
    
    setTimeout(() => {
        const messageId = addFollowUpMessage(message);
        console.log(`✅ Тестовый уточняющий вопрос отображен с ID: ${messageId}`);
    }, 500);
    
    return 'Тестирование уточняющего вопроса запущено';
};

/**
 * Функция тестирования обработки данных от API
 * @param {number} score Оценка полноты от 0.0 до 1.0
 * @param {boolean} withFollowUp Флаг наличия уточняющего вопроса
 * @returns {string} Сообщение о результате
 */
window.testAPIResponse = function(score, withFollowUp) {
    score = parseFloat(score || 0.4);
    withFollowUp = withFollowUp !== false;
    
    const testAnalysis = {
        score: score,
        missing: score < 0.7 ? 'Тестовый режим: не хватает деталей и контекста' : 'Достаточно информации',
        follow_up: withFollowUp && score < 0.7 ? 'Можете рассказать подробнее? (Тестовый режим)' : null
    };
    
    console.group('🧪 ТЕСТИРОВАНИЕ ОБРАБОТКИ ДАННЫХ API');
    console.log('Тестовые данные:', testAnalysis);
    console.groupEnd();
    
    logAnalysisResults(testAnalysis, true);
    
    setTimeout(() => {
        if (testAnalysis.follow_up) {
            addFollowUpMessage(testAnalysis.follow_up);
            console.log('✅ Тестовый уточняющий вопрос отображен');
        } else {
            console.log('✅ Переход к следующему вопросу (тестовый режим)');
        }
    }, 800);
    
    return `Тестирование обработки данных API запущено (score: ${score}, withFollowUp: ${withFollowUp})`;
};

/**
 * Функция диагностики DOM-элементов
 * @returns {string} Сообщение о результате
 */
window.testDOMAndMessages = function() {
    console.clear();
    
    console.group('%c 🔍 ДИАГНОСТИКА DOM-ЭЛЕМЕНТОВ ЧАТА',
        'background: #3F51B5; color: white; font-weight: bold; padding: 10px; font-size: 14px; border-radius: 5px;');
    
    // Ищем основные элементы
    const chatMessagesById = document.getElementById('chatMessages');
    const chatMessagesByClass = document.querySelector('.chat-messages');
    const chatInput = document.getElementById('chatInput') || document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton') || document.getElementById('chatSend');
    
    // Выводим результаты
    console.log('%c Контейнер сообщений по ID:',
        'font-weight: bold; color: ' + (chatMessagesById ? 'green' : 'red'));
    console.dir(chatMessagesById);
    
    console.log('%c Контейнер сообщений по классу:',
        'font-weight: bold; color: ' + (chatMessagesByClass ? 'green' : 'red'));
    console.dir(chatMessagesByClass);
    
    console.log('%c Поле ввода:',
        'font-weight: bold; color: ' + (chatInput ? 'green' : 'red'));
    console.dir(chatInput);
    
    console.log('%c Кнопка отправки:',
        'font-weight: bold; color: ' + (sendButton ? 'green' : 'red'));
    console.dir(sendButton);
    
    console.groupEnd();
    
    // Тестируем отображение сообщений
    try {
        const messageId = window.testFollowUpQuestion('Это тестовый уточняющий вопрос для диагностики DOM.');
        console.log('✅ Диагностика DOM-элементов завершена успешно');
        return '✅ Диагностика DOM-элементов чата завершена';
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error);
        alert('Произошла ошибка при тестировании: ' + error.message);
        return '❌ Ошибка при диагностике: ' + error.message;
    }
};

/**
 * Функция для справки по API и тестированию
 * @returns {string} Сообщение о результате
 */
window.showChatHelp = function() {
    const helpText = `
=== СПРАВКА ПО РАБОТЕ С ЧАТОМ ===

Доступные тестовые функции:

1. testFollowUpQuestion(message)
   - Отображение тестового уточняющего вопроса
   - Пример: window.testFollowUpQuestion("Расскажите подробнее о времени события")

2. testAPIResponse(score, withFollowUp)
   - Симуляция ответа от API с указанными параметрами
   - score: 0.0-1.0 (ниже 0.7 считается недостаточным)
   - withFollowUp: true/false (нужен ли уточняющий вопрос)
   - Пример: window.testAPIResponse(0.4, true) // низкая оценка с вопросом

3. testDOMAndMessages()
   - Проверка состояния чата и его компонентов

API для анализа ответов: ${API_CONFIG.analyzeUrl}
`;

    console.group('%c 🔍 СПРАВКА ПО РАБОТЕ С ЧАТОМ',
        'background: #3F51B5; color: white; font-weight: bold; padding: 10px; font-size: 14px; border-radius: 5px;');
    console.log(helpText);
    console.groupEnd();
    
    alert(helpText);
    
    return 'Справка по работе с чатом выведена в консоль';
};

/**
 * Резервная функция для создания кнопок эмоций, если основная не определена
 * @param {Array} emotions Массив эмоций
 */
function createEmotionButtonsFallback(emotions) {
    console.log('ℹ️ Используем встроенную функцию для создания кнопок эмоций');
    
    // Получаем контейнер сообщений
    const chatMessages = getChatMessagesContainer();
    
    // Создаем контейнер для кнопок эмоций
    const emotionButtonsContainer = document.createElement('div');
    emotionButtonsContainer.className = 'emotion-buttons-container';
    emotionButtonsContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 15px 0;
        justify-content: center;
    `;
    
    // Создаем кнопки для каждой эмоции
    emotions.forEach(emotion => {
        const button = document.createElement('button');
        button.className = 'emotion-button';
        button.textContent = emotion;
        button.style.cssText = `
            padding: 10px 15px;
            background-color: #e6f2ff;
            border: 1px solid #b3d9ff;
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 14px;
        `;
        
        // Добавляем обработчик клика с прямой привязкой к ID
        button.addEventListener('click', () => {
            // Напрямую сохраняем в emotions
            window.userResponses["emotions"] = emotion;
            
            // Отображаем выбранную эмоцию как сообщение пользователя
            addUserMessage(emotion);
            
            // Удаляем контейнер с кнопками
            if (emotionButtonsContainer.parentNode) {
                emotionButtonsContainer.parentNode.removeChild(emotionButtonsContainer);
            }
            
            // Находим индекс следующего вопроса по ID
            const nextIndex = window.chatQuestions.findIndex(q => q.id === "intensity");
            if (nextIndex !== -1) {
                window.currentQuestionIndex = nextIndex;
                console.log(`✅ Эмоция "${emotion}" выбрана и сохранена. Переход к вопросу #${nextIndex} (intensity)`);
            } else {
                // Если не найден, просто увеличиваем индекс
                window.currentQuestionIndex++;
                console.log(`✅ Эмоция "${emotion}" выбрана и сохранена. Переход к следующему вопросу...`);
            }
            
            // Переходим к следующему вопросу
            setTimeout(() => {
                showNextQuestion();
            }, 500);
        });
        
        // Добавляем эффект при наведении
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#b3d9ff';
        });
        
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = '#e6f2ff';
        });
        
        // Добавляем кнопку в контейнер
        emotionButtonsContainer.appendChild(button);
    });
    
    // Добавляем контейнер с кнопками в чат
    chatMessages.appendChild(emotionButtonsContainer);
    
    // Прокручиваем к кнопкам
    emotionButtonsContainer.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Резервная функция для создания слайдера интенсивности эмоций
 */
function createIntensitySliderFallback() {
    console.log('ℹ️ Используем встроенную функцию для создания слайдера интенсивности');
    
    // Получаем контейнер сообщений
    const chatMessages = getChatMessagesContainer();
    
    // Определяем текущий тип вопроса по индексу
    const currentQuestion = window.chatQuestions[window.currentQuestionIndex];
    const questionType = currentQuestion.type;
    const isEmotionChange = questionType === "emotion_change";
    
    console.log(`ℹ️ Создаем слайдер для вопроса типа: ${questionType}`);
    
    // Создаем контейнер для слайдера
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'intensity-slider-container';
    sliderContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 15px;
        margin: 15px 0;
        padding: 15px;
        background-color: #f0f8ff;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    `;
    
    // Заголовок для слайдера
    const sliderTitle = document.createElement('div');
    sliderTitle.className = 'slider-title';
    sliderTitle.textContent = isEmotionChange 
        ? 'Оцените изменение интенсивности эмоции:' 
        : 'Выберите интенсивность эмоции:';
    sliderTitle.style.cssText = `
        font-weight: bold;
        margin-bottom: 5px;
    `;
    
    // Создаем слайдер
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 1;
    slider.max = 10;
    slider.value = 5;
    slider.className = 'intensity-slider';
    slider.style.cssText = `
        width: 100%;
        margin: 10px 0;
    `;
    
    // Добавляем шкалу значений
    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'intensity-value-display';
    valueDisplay.textContent = `Выбрано: ${slider.value} из 10`;
    valueDisplay.style.cssText = `
        text-align: center;
        font-weight: bold;
    `;
    
    // Создаем шкалу с числами
    const scaleContainer = document.createElement('div');
    scaleContainer.className = 'scale-container';
    scaleContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        padding: 0 2px;
    `;
    
    for (let i = 1; i <= 10; i++) {
        const tick = document.createElement('div');
        tick.textContent = i;
        tick.style.cssText = `
            font-size: 12px;
            color: #666;
        `;
        scaleContainer.appendChild(tick);
    }
    
    // Создаем кнопку подтверждения
    const confirmButton = document.createElement('button');
    confirmButton.className = 'confirm-intensity-button';
    confirmButton.textContent = 'Подтвердить';
    confirmButton.style.cssText = `
        padding: 10px 15px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        align-self: center;
        margin-top: 10px;
    `;
    
    // Обновляем отображение значения при изменении слайдера
    slider.addEventListener('input', () => {
        valueDisplay.textContent = `Выбрано: ${slider.value} из 10`;
    });
    
    // Добавляем обработчик клика на кнопку подтверждения с прямой привязкой к ID
    confirmButton.addEventListener('click', () => {
        // Определяем, какой ключ использовать для сохранения
        let responseKey = questionType; // По умолчанию используем тип вопроса как ключ
        let nextQuestionId = ""; // ID следующего вопроса
        
        // В зависимости от типа вопроса, определяем разные параметры
        if (questionType === "intensity") {
            responseKey = "intensity";
            nextQuestionId = "body";
        } else if (questionType === "emotion_change") {
            responseKey = "emotion_change";
            nextQuestionId = "future_plan";
        }
        
        console.log(`ℹ️ Сохраняем значение слайдера в ключ: ${responseKey}`);
        
        // Сохраняем выбранное значение в ответы пользователя по правильному ключу
        window.userResponses[responseKey] = slider.value;
        
        // Отображаем выбранное значение как сообщение пользователя
        addUserMessage(`${slider.value} из 10`);
        
        // Удаляем контейнер со слайдером
        if (sliderContainer.parentNode) {
            sliderContainer.parentNode.removeChild(sliderContainer);
        }
        
        // Находим индекс следующего вопроса по ID
        const nextIndex = window.chatQuestions.findIndex(q => q.id === nextQuestionId);
        if (nextIndex !== -1) {
            window.currentQuestionIndex = nextIndex;
            console.log(`✅ Интенсивность "${slider.value}" сохранена в ${responseKey}. Переход к вопросу #${nextIndex} (${nextQuestionId})`);
        } else {
            // Если не найден, просто увеличиваем индекс
            window.currentQuestionIndex++;
            console.log(`✅ Интенсивность "${slider.value}" сохранена в ${responseKey}. Переход к следующему вопросу...`);
        }
        
        // Переходим к следующему вопросу
        setTimeout(() => {
            showNextQuestion();
        }, 500);
    });
    
    // Собираем все элементы вместе
    sliderContainer.appendChild(sliderTitle);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(valueDisplay);
    sliderContainer.appendChild(scaleContainer);
    sliderContainer.appendChild(confirmButton);
    
    // Добавляем контейнер со слайдером в чат
    chatMessages.appendChild(sliderContainer);
    
    // Прокручиваем к слайдеру
    sliderContainer.scrollIntoView({ behavior: 'smooth' });
}

// Патчим существующие функции, если они уже определены в глобальном контексте
if (typeof window.createEmotionButtons === 'function') {
    const originalCreateEmotionButtons = window.createEmotionButtons;
    window.createEmotionButtons = function(emotions) {
        console.log('⚡ Вызов перехваченной функции createEmotionButtons');
        
        // Вызываем оригинальную функцию
        originalCreateEmotionButtons(emotions);
        
        // Патчим обработчики кнопок, если они не сохраняют ответ
        setTimeout(() => {
            const emotionButtons = document.querySelectorAll('.emotion-button');
            if (emotionButtons.length) {
                console.log(`✅ Перехвачено ${emotionButtons.length} кнопок эмоций`);
                
                emotionButtons.forEach(button => {
                    // Удаляем существующие обработчики
                    const newButton = button.cloneNode(true);
                    if (button.parentNode) {
                        button.parentNode.replaceChild(newButton, button);
                    }
                    
                    // Добавляем новый обработчик с привязкой к конкретному ID
                    newButton.addEventListener('click', function() {
                        // Сохраняем выбранную эмоцию напрямую в ключ emotions
                        window.userResponses["emotions"] = this.textContent;
                        console.log(`✅ Сохранена эмоция: ${this.textContent} в emotions`);
                        
                        // Находим индекс следующего вопроса
                        const nextIndex = window.chatQuestions.findIndex(q => q.id === "intensity");
                        if (nextIndex !== -1) {
                            window.currentQuestionIndex = nextIndex;
                            console.log(`✅ Переход к вопросу #${nextIndex} (intensity)`);
                            
                            // Добавляем вызов showNextQuestion, возможно в оригинале его нет
                            setTimeout(() => { 
                                showNextQuestion(); 
                            }, 500);
                        }
                    });
                });
            }
        }, 1000);
    };
}

if (typeof window.createEmotionIntensitySlider === 'function') {
    const originalCreateIntensitySlider = window.createEmotionIntensitySlider;
    window.createEmotionIntensitySlider = function() {
        console.log('⚡ Вызов перехваченной функции createEmotionIntensitySlider');
        
        // Определяем текущий тип вопроса по индексу
        const currentQuestion = window.chatQuestions[window.currentQuestionIndex];
        const questionType = currentQuestion.type;
        
        // Вызываем оригинальную функцию
        originalCreateIntensitySlider();
        
        // Патчим кнопку подтверждения, если она не сохраняет ответ
        setTimeout(() => {
            const confirmButton = document.querySelector('.confirm-intensity-button');
            if (confirmButton) {
                console.log(`✅ Перехвачена кнопка подтверждения интенсивности для типа: ${questionType}`);
                
                // Удаляем существующие обработчики
                const newButton = confirmButton.cloneNode(true);
                if (confirmButton.parentNode) {
                    confirmButton.parentNode.replaceChild(newButton, confirmButton);
                }
                
                // Добавляем новый обработчик с привязкой к конкретному ID
                newButton.addEventListener('click', function() {
                    // Находим выбранное значение
                    const slider = document.querySelector('.intensity-slider');
                    if (slider) {
                        // Определяем, какой ключ использовать для сохранения
                        let responseKey = questionType; // По умолчанию используем тип вопроса как ключ
                        let nextQuestionId = ""; // ID следующего вопроса
                        
                        // В зависимости от типа вопроса, определяем разные параметры
                        if (questionType === "intensity") {
                            responseKey = "intensity";
                            nextQuestionId = "body";
                        } else if (questionType === "emotion_change") {
                            responseKey = "emotion_change";
                            nextQuestionId = "future_plan";
                        }
                        
                        // Сохраняем выбранное значение в правильный ключ
                        window.userResponses[responseKey] = slider.value;
                        console.log(`✅ Сохранена интенсивность: ${slider.value} в ${responseKey}`);
                        
                        // Находим индекс следующего вопроса
                        const nextIndex = window.chatQuestions.findIndex(q => q.id === nextQuestionId);
                        if (nextIndex !== -1) {
                            window.currentQuestionIndex = nextIndex;
                            console.log(`✅ Переход к вопросу #${nextIndex} (${nextQuestionId})`);
                            
                            // Добавляем вызов showNextQuestion, возможно в оригинале его нет
                            setTimeout(() => { 
                                showNextQuestion(); 
                            }, 500);
                        }
                    }
                });
            }
        }, 1000);
    };
}
