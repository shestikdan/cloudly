import os
import telebot
from dotenv import load_dotenv
import signal
import sys

class TelegramBot:
    def __init__(self):
        load_dotenv()
        self.bot = telebot.TeleBot(os.getenv('TELEGRAM_BOT_TOKEN'))
        self.setup_handlers()
        self.setup_signals()

    def setup_handlers(self):
        @self.bot.message_handler(commands=['start'])
        def send_welcome(message):
            welcome_text = ( 
                "Добро пожаловать! 👋\n\n"
                "В этом мини-приложении ты сможешь:\n"
                "🔹 Изучить урок 'Что такое КПТ дневник и как он может улучшить жизнь?'\n"
                "🔹 Вести свой КПТ-дневник, а наш AI-помощник задаст уточняющие вопросы, чтобы глубже проанализировать твои записи.\n\n"
                "Чтобы начать, введите команду /open_app"
            )
            
            self.bot.send_message(
                message.chat.id,
                welcome_text,
            )
            
        @self.bot.message_handler(commands=['open_app'])
        def send_app_link(message):
            app_link = "https://t.me/You_cloudly_bot/app"
            self.bot.send_message(
                message.chat.id,
                f"Нажмите на ссылку, чтобы открыть приложение:\n{app_link}"
            )

        @self.bot.message_handler(func=lambda message: True)
        def handle_text(message):
            self.bot.reply_to(message, f"Вот ссылка на мини-приложение: https://t.me/You_cloudly_bot/app")

    def setup_signals(self):
        def signal_handler(sig, frame):
            print('Завершение работы...')
            self.stop_polling()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

    def start_polling(self):
        self.bot.polling(none_stop=True)

    def stop_polling(self):
        self.bot.stop_polling()

    def run(self):
        """Запускает бота в режиме polling"""
        self.start_polling()
