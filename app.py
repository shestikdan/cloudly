import os
import json
import hashlib
import hmac
import time
import urllib.parse
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import telebot
import threading

# Инициализация Flask приложения
app = Flask(__name__)
app.secret_key = 'telegram-mini-app-secret-key-change-in-production'

# Хардкодим токен бота
TELEGRAM_BOT_TOKEN = '5524640601:AAEbET-WKpBktoGpDVkdgoKZMpDRoRwD5rw'

# Initialize Telegram Bot
bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)

# Get the app URL from environment or use default for local development
APP_URL = os.getenv('RENDER_EXTERNAL_URL', os.getenv('APP_URL', 'http://localhost:5000'))

# Verify Telegram Web App data
def verify_telegram_data(init_data):
    if not init_data:
        return False
    
    # Parse the init data
    parsed_data = parse_init_data(init_data)
    
    # Check if hash is present
    if 'hash' not in parsed_data:
        return False
    
    # Get the received hash
    received_hash = parsed_data.pop('hash')
    
    # Create data check string
    data_check_string = '\n'.join(
        f'{key}={value}' for key, value in sorted(parsed_data.items())
    )
    
    # Create secret key
    secret_key = hmac.new(
        key=b'WebAppData',
        msg=TELEGRAM_BOT_TOKEN.encode(),
        digestmod=hashlib.sha256
    ).digest()
    
    # Calculate hash
    calculated_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256
    ).hexdigest()
    
    # Check if hashes match
    return calculated_hash == received_hash

def parse_init_data(init_data):
    result = {}
    
    # Handle empty init data
    if not init_data:
        return result
    
    # Parse the query string
    try:
        parsed_data = dict(urllib.parse.parse_qsl(init_data))
        
        # Parse user data if present
        if 'user' in parsed_data:
            try:
                parsed_data['user'] = json.loads(parsed_data['user'])
            except json.JSONDecodeError:
                pass
        
        return parsed_data
    except Exception as e:
        print(f"Error parsing init data: {e}")
        return result

# Функция для проверки, открыто ли приложение из Telegram
def is_telegram_web_app():
    user_agent = request.headers.get('User-Agent', '').lower()
    # Проверяем наличие параметра tgWebAppData в запросе или специфичного User-Agent
    return (
        'tgwebapp' in user_agent or 
        'telegram' in user_agent or 
        request.args.get('tgWebAppData') or 
        request.args.get('tgWebAppVersion') or
        request.cookies.get('tgWebAppData')
    )

@app.route('/')
def index():
    """Main page for the Telegram Mini App"""
    # Проверяем, открыто ли приложение из Telegram
    if not is_telegram_web_app():
        return render_template('redirect.html')
    
    return render_template('index.html')

@app.route('/auth')
def auth():
    """Authentication page for the Telegram Mini App"""
    # Проверяем, открыто ли приложение из Telegram
    if not is_telegram_web_app():
        return render_template('redirect.html')
    
    return render_template('auth.html')

@app.route('/redirect')
def redirect_to_telegram():
    """Страница перенаправления в Telegram"""
    return render_template('redirect.html')

@app.route('/api/validate-telegram-data', methods=['POST'])
def validate_telegram_data():
    """API endpoint to validate Telegram Web App data"""
    data = request.json
    init_data = data.get('initData', '')
    
    # Parse the init data
    parsed_data = parse_init_data(init_data)
    
    # Verify the data
    if verify_telegram_data(init_data):
        # Get user data
        user_data = parsed_data.get('user', {})
        
        # Store user data in session
        session['user'] = user_data
        
        return jsonify({
            'success': True, 
            'user': user_data
        })
    else:
        return jsonify({
            'success': False, 
            'error': 'Invalid Telegram data'
        })

@app.route('/logout')
def logout():
    """Logout the user by clearing the session"""
    session.clear()
    return redirect(url_for('index'))

# Bot command to open the Mini App
@bot.message_handler(commands=['start'])
def start(message):
    """Handle the /start command"""
    bot.send_message(
        message.chat.id,
        "Добро пожаловать! Нажмите на кнопку ниже, чтобы открыть мини-приложение.",
        reply_markup=telebot.types.InlineKeyboardMarkup().add(
            telebot.types.InlineKeyboardButton(
                text="Открыть мини-приложение",
                web_app=telebot.types.WebAppInfo(url=APP_URL)
            )
        )
    )

# Bot command to get help
@bot.message_handler(commands=['help'])
def help(message):
    """Handle the /help command"""
    bot.send_message(
        message.chat.id,
        "Это бот с мини-приложением. Используйте команду /start, чтобы открыть приложение."
    )

# Handle all other messages
@bot.message_handler(func=lambda message: True)
def echo_all(message):
    """Echo all other messages"""
    bot.reply_to(
        message,
        "Я не понимаю эту команду. Используйте /start, чтобы открыть мини-приложение или /help для получения помощи."
    )

def run_bot():
    """Run the Telegram bot in a separate thread"""
    try:
        bot.polling(none_stop=True)
    except Exception as e:
        print(f"Bot polling error: {e}")

# Запускаем бот только если запускаем приложение напрямую (не через Gunicorn)
if __name__ == '__main__':
    # Start the bot in a separate thread
    bot_thread = threading.Thread(target=run_bot)
    bot_thread.daemon = True
    bot_thread.start()
    
    # Start the Flask app
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False) 