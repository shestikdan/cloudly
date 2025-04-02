import os
import telebot
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

# Инициализируем бота
bot = telebot.TeleBot(os.getenv('TELEGRAM_BOT_TOKEN'))

# Обработчик команды /start
@bot.message_handler(commands=['start'])
def send_welcome(message):
    # Создаем клавиатуру с кнопкой для открытия мини-приложения
    keyboard = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    web_app = telebot.types.WebAppInfo(url="https://t.me/You_cloudly_bot/app")
    web_app_button = telebot.types.KeyboardButton(text="Открыть мини-приложение", web_app=web_app)
    keyboard.add(web_app_button)
    
    # Отправляем приветственное сообщение с клавиатурой
    bot.send_message(
        message.chat.id,
        "Привет! Я бот для работы с мини-приложением. Нажмите кнопку ниже, чтобы открыть его.",
        reply_markup=keyboard
    )

# Обработчик текстовых сообщений
@bot.message_handler(func=lambda message: True)
def handle_text(message):
    bot.reply_to(message, f"Вот ссылка на мини-приложение: https://t.me/You_cloudly_bot/app")

# Запускаем бота
if __name__ == "__main__":
    bot.polling(none_stop=True) 