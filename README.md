# Telegram Mini App на Flask

Это приложение представляет собой Telegram Mini App, разработанное с использованием Flask. Оно демонстрирует бесшовную авторизацию пользователей через Telegram.

## Особенности

- Бесшовная авторизация пользователей через Telegram
- Автоматическое получение и отображение данных пользователя
- Адаптивный дизайн для мобильных устройств
- Поддержка темы Telegram
- Интеграция с Telegram Bot API

## Требования

- Python 3.9+
- Flask
- pyTelegramBotAPI
- Доступ к интернету для работы с Telegram API
- Зарегистрированный бот в Telegram

## Локальная установка

1. Клонируйте репозиторий:
```bash
git clone <url-репозитория>
cd <имя-папки>
```

2. Создайте виртуальное окружение и активируйте его:
```bash
python -m venv venv
source venv/bin/activate  # Для Linux/Mac
venv\Scripts\activate     # Для Windows
```

3. Установите зависимости:
```bash
pip install -r requirements.txt
```

4. Запустите приложение:
```bash
python app.py
```

## Развертывание на Render

### Метод 1: Через веб-интерфейс Render

1. Зарегистрируйтесь на [render.com](https://render.com) и войдите в свой аккаунт

2. Нажмите на кнопку "New" и выберите "Web Service"

3. Подключите свой GitHub репозиторий или загрузите код напрямую

4. Настройте сервис:
   - **Name**: telegram-mini-app (или любое другое имя)
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`

5. Нажмите "Create Web Service"

6. После успешного развертывания, скопируйте URL вашего приложения (например, `https://telegram-mini-app.onrender.com`)

### Метод 2: Через render.yaml (Blueprint)

1. Убедитесь, что в вашем репозитории есть файл `render.yaml`

2. Зайдите на [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints)

3. Нажмите "New Blueprint Instance"

4. Подключите свой GitHub репозиторий

5. Render автоматически настроит и развернет ваше приложение согласно конфигурации в `render.yaml`

6. После успешного развертывания, скопируйте URL вашего приложения

## Настройка Telegram бота

1. Бот уже настроен и готов к использованию
2. Если вы хотите использовать своего бота, измените токен в файле `app.py`
3. Настройте WebApp URL в BotFather:
   - Отправьте команду `/mybots` в BotFather
   - Выберите вашего бота
   - Выберите "Bot Settings" > "Menu Button" или "Menu Commands"
   - Добавьте URL вашего приложения на Render

## Структура проекта

```
.
├── app.py                  # Основной файл Flask-приложения
├── requirements.txt        # Зависимости проекта
├── render.yaml             # Конфигурация для Render
├── Procfile                # Файл для Heroku (если нужен)
├── runtime.txt             # Версия Python для Heroku (если нужен)
├── static/                 # Статические файлы
│   ├── css/                # CSS-стили
│   │   └── style.css       # Основной файл стилей
│   └── js/                 # JavaScript-файлы
│       └── telegram-app.js # Скрипт для работы с Telegram WebApp API
└── templates/              # HTML-шаблоны
    ├── index.html          # Главная страница
    └── auth.html           # Страница авторизации
```

## Использование

1. Откройте бота в Telegram
2. Нажмите на кнопку "Открыть мини-приложение"
3. Приложение автоматически получит данные пользователя и отобразит их

## Дополнительная информация

- [Документация Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Документация Flask](https://flask.palletsprojects.com/)
- [Документация pyTelegramBotAPI](https://github.com/eternnoir/pyTelegramBotAPI)
- [Документация Render](https://render.com/docs)

## Лицензия

MIT 