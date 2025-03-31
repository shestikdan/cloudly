// Класс для управления прогрессом пользователя
class UserProgress {
    constructor() {
        this.userId = this.getUserId();
        this.syncWithServer();
        startPeriodicSync();
        
        // Добавляем обработчик для сохранения данных перед закрытием страницы
        window.addEventListener('beforeunload', async () => {
            try {
                await this.syncWithServer();
            } catch (error) {
                console.error('Error syncing before unload:', error);
            }
        });
    }

    // Получение ID пользователя из localStorage или других источников
    getUserId() {
        // Сначала пробуем получить из telegramUser
        const telegramUser = localStorage.getItem('telegramUser');
        if (telegramUser) {
            try {
                const parsed = JSON.parse(telegramUser);
                return parsed.id || parsed.user_id;
            } catch (e) {
                console.error('Error parsing telegramUser data:', e);
            }
        }
        
        // Если не нашли в telegramUser, пробуем в userData (для обратной совместимости)
        const userData = localStorage.getItem('userData');
        if (userData) {
            try {
                const parsed = JSON.parse(userData);
                return parsed.id || parsed.user_id;
            } catch (e) {
                console.error('Error parsing userData:', e);
            }
        }
        
        // Если нигде не нашли, пробуем прямой userId
        return localStorage.getItem('userId');
    }

    // Синхронизация с сервером
    async syncWithServer() {
        try {
            const response = await fetch(`/api/user-progress?user_id=${this.userId}`);
            if (!response.ok) throw new Error('Failed to fetch progress');
            
            const { success, data } = await response.json();
            if (success) {
                this.updateLocalStorage(data);
            }
        } catch (error) {
            console.error('Error syncing with server:', error);
        }
    }

    // Обновление localStorage на основе данных с сервера
    updateLocalStorage(data) {
        if (data.onboarding_completed) {
            localStorage.setItem('hasCompletedOnboarding', 'true');
        }

        if (data.last_lesson_date) {
            const today = new Date().toISOString().split('T')[0];
            const lessonDate = new Date(data.last_lesson_date).toISOString().split('T')[0];
            
            if (lessonDate === today) {
                localStorage.setItem('lessonCompletedToday', 'true');
                localStorage.setItem('lastLessonCompletedDate', today);
            }
        }

        if (data.last_journal_date) {
            const today = new Date().toISOString().split('T')[0];
            const journalDate = new Date(data.last_journal_date).toISOString().split('T')[0];
            
            if (journalDate === today) {
                localStorage.setItem('journalCompletedToday', 'true');
                localStorage.setItem('lastJournalCompletedDate', today);
            }
        }
    }

    // Сохранение прогресса
    async saveProgress(data) {
        try {
            // Сначала обновляем localStorage
            if (data.onboarding_completed) {
                localStorage.setItem('hasCompletedOnboarding', 'true');
            }
            
            if (data.lesson_completed) {
                const today = new Date().toISOString().split('T')[0];
                localStorage.setItem('lessonCompletedToday', 'true');
                localStorage.setItem('lastLessonCompletedDate', today);
            }
            
            if (data.journal_completed) {
                const today = new Date().toISOString().split('T')[0];
                localStorage.setItem('journalCompletedToday', 'true');
                localStorage.setItem('lastJournalCompletedDate', today);
            }

            // Затем отправляем на сервер
            const response = await fetch('/api/user-progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': this.userId
                },
                body: JSON.stringify({
                    ...data,
                    user_id: this.userId
                })
            });

            if (!response.ok) throw new Error('Failed to save progress');
            
            const result = await response.json();
            if (result.success) {
                console.log('Progress saved successfully');
                return true;
            }
            throw new Error('Server returned error');
        } catch (error) {
            console.error('Error saving progress:', error);
            return false;
        }
    }

    // Методы для работы с конкретными типами прогресса
    async markOnboardingCompleted() {
        return this.saveProgress({ onboarding_completed: true });
    }

    async markLessonCompleted() {
        return this.saveProgress({ lesson_completed: true });
    }

    async markJournalCompleted() {
        return this.saveProgress({ journal_completed: true });
    }

    // Проверка статуса на текущий день
    isCompletedToday(type) {
        const today = new Date().toISOString().split('T')[0];
        
        switch (type) {
            case 'lesson':
                return localStorage.getItem('lastLessonCompletedDate') === today;
            case 'journal':
                return localStorage.getItem('lastJournalCompletedDate') === today;
            case 'onboarding':
                return localStorage.getItem('hasCompletedOnboarding') === 'true';
            default:
                return false;
        }
    }

    // Сброс всего прогресса (для отладки)
    async resetProgress() {
        localStorage.removeItem('hasCompletedOnboarding');
        localStorage.removeItem('lessonCompletedToday');
        localStorage.removeItem('lastLessonCompletedDate');
        localStorage.removeItem('journalCompletedToday');
        localStorage.removeItem('lastJournalCompletedDate');

        // Сброс на сервере
        try {
            await fetch('/api/user-progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': this.userId
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    reset: true
                })
            });
        } catch (error) {
            console.error('Error resetting progress on server:', error);
        }
    }
}

// Добавляем функцию для периодической синхронизации
async function startPeriodicSync() {
    // Синхронизируем каждые 5 минут
    setInterval(async () => {
        try {
            await userProgress.syncWithServer();
            console.log('Periodic sync completed successfully');
        } catch (error) {
            console.error('Error during periodic sync:', error);
        }
    }, 5 * 60 * 1000); // 5 минут
}

// Добавляем обработчик для событий онлайн/оффлайн
window.addEventListener('online', async () => {
    console.log('Connection restored, syncing data...');
    try {
        await userProgress.syncWithServer();
        console.log('Sync after reconnection completed successfully');
    } catch (error) {
        console.error('Error syncing after reconnection:', error);
    }
});

// Добавляем обработчик для событий visibility change
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        console.log('Tab became visible, syncing data...');
        try {
            await userProgress.syncWithServer();
            console.log('Sync after tab became visible completed successfully');
        } catch (error) {
            console.error('Error syncing after tab became visible:', error);
        }
    }
});

// Добавляем функцию для обработки конфликтов данных
async function resolveDataConflict(localData, serverData) {
    // Используем более новые данные
    const localDate = new Date(localData.updated_at);
    const serverDate = new Date(serverData.updated_at);
    
    if (localDate > serverDate) {
        return localData;
    }
    return serverData;
}

// Добавляем функцию для работы в оффлайн режиме
function handleOfflineMode() {
    const offlineData = [];
    
    // Сохраняем операции, которые нужно будет синхронизировать
    function queueOfflineOperation(operation) {
        offlineData.push({
            operation,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('offlineOperations', JSON.stringify(offlineData));
    }
    
    // Синхронизируем накопленные операции при восстановлении соединения
    async function syncOfflineOperations() {
        const operations = JSON.parse(localStorage.getItem('offlineOperations') || '[]');
        
        for (const op of operations) {
            try {
                await userProgress.saveProgress(op.operation);
            } catch (error) {
                console.error('Error syncing offline operation:', error);
            }
        }
        
        // Очищаем сохраненные операции после синхронизации
        localStorage.removeItem('offlineOperations');
    }
    
    return {
        queueOfflineOperation,
        syncOfflineOperations
    };
}

// Экспортируем новые функции
window.startPeriodicSync = startPeriodicSync;
window.handleOfflineMode = handleOfflineMode(); 