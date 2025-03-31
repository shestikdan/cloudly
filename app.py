import os
import json
import hashlib
import hmac
import time
import urllib.parse
import requests
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import telebot
import threading
from database import init_db, save_user_data, log_user_activity
import datetime
from functools import wraps
from models import db, Course, Lesson, ContentBlock, User, UserCourseProgress
from flask_cors import CORS

# Импортируем конфигурацию Ngrok, если файл существует
try:
    from config_local import NGROK_URL
    print(f"Используется Ngrok URL: {NGROK_URL}")
    HAS_NGROK = True
except ImportError:
    print("Файл config_local.py не найден, используется стандартный URL")
    HAS_NGROK = False

# Инициализация Flask приложения
app = Flask(__name__)
app.secret_key = 'telegram-mini-app-secret-key-change-in-production'
app.debug = True  # Включаем режим отладки

# Добавляем поддержку CORS
CORS(app, supports_credentials=True)

# Настройка базы данных
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///telegram_app.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Создаем все таблицы
with app.app_context():
    db.create_all()
    print("База данных инициализирована.")

# Отладочный вывод для проверки маршрутов
print("Registered routes:")
for rule in app.url_map.iter_rules():
    print(f"{rule.endpoint}: {rule.rule}")

# Хардкодим токен бота
TELEGRAM_BOT_TOKEN = '5524640601:AAEbET-WKpBktoGpDVkdgoKZMpDRoRwD5rw'

# Initialize Telegram Bot
bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)

# Get the app URL from environment or use default for local development
if HAS_NGROK:
    APP_URL = NGROK_URL
else:
    APP_URL = os.getenv('RENDER_EXTERNAL_URL', os.getenv('APP_URL', 'http://localhost:5001'))

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Проверяем наличие bypass_auth параметра
        if request.args.get('bypass_auth') == '1':
            # Если пользователь еще не в сессии, создаем тестового пользователя
            if 'user' not in session:
                test_user = {
                    'id': 12345,
                    'first_name': 'Тестовый',
                    'last_name': 'Пользователь',
                    'username': 'test_user'
                }
                session['user'] = test_user
                save_user_data(test_user)
            return f(*args, **kwargs)

        # Проверяем авторизацию
        if 'user' not in session:
            # Если это AJAX запрос, возвращаем 401
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            
            # Для обычных запросов добавляем параметр auth=1 к текущему URL
            # и возвращаем ту же страницу
            url = request.path
            if request.query_string:
                url += '?' + request.query_string.decode('utf-8') + '&auth=1'
            else:
                url += '?auth=1'
            return redirect(url)
        
        return f(*args, **kwargs)
    return decorated_function

# Маршруты страниц
@app.route('/')
def index():
    """Главная страница приложения"""
    return render_template('index.html')

@app.route('/redirect')
def redirect_page():
    """Страница перенаправления для случаев, когда приложение открыто не из Telegram"""
    return render_template('redirect.html')

@app.route('/auth')
def auth():
    """Страница авторизации"""
    # Если пользователь уже авторизован, перенаправляем на главную
    if 'user' in session:
        return redirect(url_for('index'))
    
    return render_template('auth.html')

@app.route('/courses')
def courses_page():
    """Страница со списком всех курсов"""
    return render_template('courses.html')

@app.route('/course/<int:course_id>')
def course_page(course_id):
    """Страница курса с списком уроков"""
    return render_template('course.html', course_id=course_id)

@app.route('/lesson/<int:lesson_id>')
def lesson_page(lesson_id):
    """Страница урока с контентом"""
    return render_template('lesson.html', lesson_id=lesson_id)

@app.route('/admin')
def admin_panel():
    """Панель администратора для просмотра данных пользователей"""
    return render_template('admin.html')

@app.route('/api/validate-telegram-data', methods=['POST'])
def validate_telegram_data():
    """API endpoint to validate Telegram Web App data"""
    data = request.json
    print(f"Received data: {data}")
    print(f"User-Agent: {request.headers.get('User-Agent')}")
    
    # Проверяем наличие данных пользователя
    user_data_raw = data.get('userData')
    
    # Если получили userData, считаем это приоритетным источником
    if user_data_raw:
        try:
            user_data = user_data_raw if isinstance(user_data_raw, dict) else json.loads(user_data_raw)
            print(f"User data received: {user_data}")
            
            # Сохраняем данные пользователя в сессию и БД
            session['user'] = user_data
            save_user_data(user_data)
            
            # Логируем успешную аутентификацию
            if 'id' in user_data:
                log_user_activity(user_data['id'], 'authentication_direct', 
                                {'user_agent': request.headers.get('User-Agent')})
            
            return jsonify({
                'success': True,
                'user': user_data
            })
        except Exception as e:
            print(f"Error processing user data: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 400
    
    # Если дошли до этой точки, значит нет userData
    # Используем тестового пользователя только если есть bypass_auth
    if request.args.get('bypass_auth') == '1':
        test_user = {
            'id': 12345,
            'first_name': 'Тестовый',
            'last_name': 'Пользователь',
            'username': 'test_user'
        }
        print("Using test user as fallback")
        
        # Сохраняем тестового пользователя в БД и сессию
        session['user'] = test_user
        save_user_data(test_user)
        return jsonify({
            'success': True,
            'user': test_user,
            'note': 'Using test user (bypass mode)'
        })
    
    # Если ничего не сработало, возвращаем ошибку
    return jsonify({
        'success': False,
        'error': 'No valid user data provided'
    })

# Маршрут для получения списка всех пользователей (для административных целей)
@app.route('/api/admin/users', methods=['GET'])
def get_users():
    """API endpoint для получения списка всех пользователей (только для администраторов)"""
    from models import User
    
    # В реальном приложении здесь должна быть проверка прав администратора
    try:
        users = User.query.all()
        users_data = [{
            'id': user.id,
            'telegram_id': user.telegram_id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'username': user.username,
            'last_visit': user.last_visit.strftime('%Y-%m-%d %H:%M:%S') if user.last_visit else None,
            'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S') if user.created_at else None
        } for user in users]
        
        return jsonify({
            'success': True,
            'users': users_data,
            'count': len(users_data)
        })
    except Exception as e:
        print(f"Error fetching users: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/logout')
def logout():
    """Logout the user by clearing the session"""
    # Логируем выход пользователя, если в сессии есть его данные
    if 'user' in session and 'id' in session['user']:
        log_user_activity(session['user']['id'], 'logout')
    
    session.clear()
    return redirect(url_for('index'))

@app.route('/api/test', methods=['GET'])
def test_api():
    """Test endpoint to check if the server is responding correctly"""
    return jsonify({
        'success': True,
        'message': 'API is working correctly',
        'timestamp': time.time()
    })

@app.route('/api/save-journal', methods=['POST'])
def save_journal():
    """API endpoint для сохранения записи КПТ-дневника"""
    # Проверяем, авторизован ли пользователь
    if 'user' not in session or 'id' not in session['user']:
        return jsonify({
            'success': False,
            'error': 'Пользователь не авторизован'
        }), 401
    
    # Получаем данные из запроса
    data = request.json
    if not data:
        return jsonify({
            'success': False,
            'error': 'Отсутствуют данные'
        }), 400
    
    # Проверяем наличие обязательных полей дневника
    required_fields = ['situation', 'emotions', 'rational_response', 'result']
    for field in required_fields:
        if field not in data or not data[field]:
            return jsonify({
                'success': False,
                'error': f'Поле {field} обязательно для заполнения'
            }), 400
    
    try:
        # Импортируем модели
        from models import DailyJournal, User
        from database import get_user_by_telegram_id
        
        # Получаем пользователя
        user = get_user_by_telegram_id(session['user']['id'])
        if not user:
            return jsonify({
                'success': False,
                'error': 'Пользователь не найден'
            }), 404
        
        # Создаем или обновляем запись дневника
        journal = DailyJournal.create_or_update_journal(
            user_id=user.id,
            situation=data['situation'],
            emotions=data['emotions'],
            rational_response=data['rational_response'],
            result=data['result']
        )
        
        # Логируем активность
        log_user_activity(user.telegram_id, 'journal_saved', {
            'journal_id': journal.id,
            'journal_date': journal.journal_date.isoformat()
        })
        
        # Возвращаем успешный ответ с обновленным значением streak
        return jsonify({
            'success': True,
            'message': 'Запись дневника сохранена',
            'streak': user.visit_streak,
            'journal_id': journal.id
        })
    
    except Exception as e:
        print(f"Error saving journal: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analyze-emotions', methods=['POST'])
def analyze_emotions():
    """API endpoint для анализа эмоций с использованием Mistral API"""
    # Получаем данные из запроса
    data = request.json
    if not data:
        return jsonify({
            'success': False,
            'error': 'Отсутствуют данные'
        }), 400
    
    # Проверяем наличие обязательных полей
    if 'situation' not in data or 'thoughts' not in data:
        return jsonify({
            'success': False,
            'error': 'Отсутствуют обязательные поля: situation, thoughts'
        }), 400
    
    # Получаем данные из запроса
    situation = data['situation']
    thoughts = data['thoughts']
    
    # Получаем API ключ Mistral из переменных окружения
    mistral_api_key = os.getenv('MISTRAL_API_KEY')
    
    # Проверяем наличие API ключа
    if not mistral_api_key:
        print("❌ MISTRAL_API_KEY не найден в переменных окружения")
        return jsonify({
            'success': False,
            'error': 'API key not configured',
            'score': 0.7,  # Значение по умолчанию
            'missing': None,
            'follow_up': None
        }), 500
    
    try:
        # Формируем запрос к Mistral API
        mistral_api_url = "https://api.mistral.ai/v1/chat/completions"
        
        # Формируем промпт для модели
        prompt = f"""На основе следующей ситуации и мыслей человека, определи 5 возможных эмоций, которые он мог испытывать.
        Выдай только список эмоций через запятую, без дополнительных пояснений.
        
        Ситуация: {situation}
        
        Мысли: {thoughts}
        
        Эмоции:"""
        
        # Формируем запрос к API
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {mistral_api_key}"
        }
        
        payload = {
            "model": "mistral-small",  # Используем модель mistral-small
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 100
        }
        
        # Отправляем запрос к Mistral API
        response = requests.post(mistral_api_url, headers=headers, json=payload)
        
        # Проверяем успешность запроса
        if response.status_code != 200:
            print(f"Error from Mistral API: {response.status_code} - {response.text}")
            raise Exception(f"Mistral API returned status code {response.status_code}")
        
        # Получаем результат
        result = response.json()
        
        # Извлекаем текст ответа
        if 'choices' in result and len(result['choices']) > 0:
            content = result['choices'][0]['message']['content'].strip()
            
            # Разбиваем текст на отдельные эмоции
            emotions = [emotion.strip() for emotion in content.split(',')]
            
            # Ограничиваем список до 5 эмоций
            emotions = emotions[:5]
            
            # Если список пустой, используем стандартный набор
            if not emotions:
                emotions = ['Радость', 'Грусть', 'Страх', 'Гнев', 'Удивление']
            
            return jsonify({
                'success': True,
                'emotions': emotions
            })
        else:
            # Если не удалось получить ответ, используем стандартный набор
            return jsonify({
                'success': True,
                'emotions': ['Радость', 'Грусть', 'Страх', 'Гнев', 'Удивление'],
                'note': 'Using default emotions due to empty API response'
            })
    
    except Exception as e:
        print(f"Error calling Mistral API: {e}")
        # В случае ошибки возвращаем стандартный набор эмоций
        return jsonify({
            'success': True,  # Возвращаем success=True, чтобы клиент не показывал ошибку
            'emotions': ['Радость', 'Грусть', 'Страх', 'Гнев', 'Удивление'],
            'note': f'Using default emotions due to API error: {str(e)}'
        })

@app.route('/api/analyze-final', methods=['POST'])
def analyze_final():
    """API endpoint для анализа всех ответов пользователя и генерации финального сообщения"""
    # Получаем данные из запроса
    data = request.json
    if not data:
        return jsonify({
            'success': False,
            'error': 'Отсутствуют данные'
        }), 400
    
    # Проверяем наличие обязательных полей
    if 'responses' not in data or 'questions' not in data:
        return jsonify({
            'success': False,
            'error': 'Отсутствуют обязательные поля: responses, questions'
        }), 400
    
    # Получаем данные из запроса
    responses = data['responses']
    questions = data['questions']
    
    # Получаем API ключ Mistral из переменных окружения
    mistral_api_key = os.getenv('MISTRAL_API_KEY')
    
    # Проверяем наличие API ключа
    if not mistral_api_key:
        print("❌ MISTRAL_API_KEY не найден в переменных окружения")
        return jsonify({
            'success': False,
            'error': 'API key not configured',
            'score': 0.7,  # Значение по умолчанию
            'missing': None,
            'follow_up': None
        }), 500
    
    try:
        # Формируем запрос к Mistral API
        mistral_api_url = "https://api.mistral.ai/v1/chat/completions"
        
        # Формируем промпт для модели
        prompt = "Проанализируй ответы пользователя на вопросы КПТ (когнитивно-поведенческой терапии) и дай поддерживающий ответ. Отметь прогресс пользователя, похвали его за работу над собой и дай надежду на будущее. Ответы пользователя:\n\n"
        
        # Добавляем вопросы и ответы пользователя
        for i in range(min(len(questions), len(responses))):
            prompt += f"Вопрос: {questions[i]}\nОтвет: {responses[i]}\n\n"
        
        # Формируем запрос к API
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {mistral_api_key}"
        }
        
        payload = {
            "model": "mistral-small",  # Используем модель mistral-small
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 500
        }
        
        # Отправляем запрос к Mistral API
        response = requests.post(mistral_api_url, headers=headers, json=payload)
        
        # Проверяем успешность запроса
        if response.status_code != 200:
            print(f"Error from Mistral API: {response.status_code} - {response.text}")
            raise Exception(f"Mistral API returned status code {response.status_code}")
        
        # Получаем результат
        result = response.json()
        
        # Извлекаем текст ответа
        if 'choices' in result and len(result['choices']) > 0:
            content = result['choices'][0]['message']['content'].strip()
            
            # Если ответ пустой, используем стандартное сообщение
            if not content:
                content = "Вы молодец! Вы проделали отличную работу по анализу своих эмоций и мыслей. Продолжайте практиковать эти навыки, и со временем вам будет легче справляться с подобными ситуациями. Помните, что осознание своих мыслей и эмоций — это первый шаг к позитивным изменениям. Верю, что дальше всё будет только лучше!"
            
            return jsonify({
                'success': True,
                'analysis': content
            })
        else:
            # Если не удалось получить ответ, используем стандартное сообщение
            return jsonify({
                'success': True,
                'analysis': "Вы молодец! Вы проделали отличную работу по анализу своих эмоций и мыслей. Продолжайте практиковать эти навыки, и со временем вам будет легче справляться с подобными ситуациями. Помните, что осознание своих мыслей и эмоций — это первый шаг к позитивным изменениям. Верю, что дальше всё будет только лучше!",
                'note': 'Using default analysis due to empty API response'
            })
    
    except Exception as e:
        print(f"Error calling Mistral API: {e}")
        # В случае ошибки возвращаем стандартное сообщение
        return jsonify({
            'success': True,  # Возвращаем success=True, чтобы клиент не показывал ошибку
            'analysis': "Вы молодец! Вы проделали отличную работу по анализу своих эмоций и мыслей. Продолжайте практиковать эти навыки, и со временем вам будет легче справляться с подобными ситуациями. Помните, что осознание своих мыслей и эмоций — это первый шаг к позитивным изменениям. Верю, что дальше всё будет только лучше!",
            'note': f'Using default analysis due to API error: {str(e)}'
        })

@app.route('/api/save-cbt-analysis', methods=['POST'])
def save_cbt_analysis():
    """API endpoint для сохранения результатов CBT-анализа в базу данных"""
    # Добавляем отладочные сообщения
    print(f"[save_cbt_analysis] Получен запрос: bypass_auth={request.args.get('bypass_auth')}")
    print(f"[save_cbt_analysis] Headers: {dict(request.headers)}")
    
    # НОВЫЙ КОД: Проверяем заголовки X-User-* если пользователь не авторизован
    user_from_headers = None
    if 'user' not in session or 'id' not in session.get('user', {}):
        print("[save_cbt_analysis] Пользователь не в сессии, проверяем заголовки X-User")
        # Пробуем получить данные пользователя из заголовков
        try:
            # Проверяем наличие основных заголовков
            user_id = request.headers.get('X-User-id')
            user_first_name = request.headers.get('X-User-first_name')
            
            if user_id and user_first_name:
                # Создаем словарь с данными пользователя из заголовков
                user_from_headers = {
                    'id': int(user_id),
                    'first_name': user_first_name,
                    'last_name': request.headers.get('X-User-last_name', ''),
                    'username': request.headers.get('X-User-username', '')
                }
                print(f"[save_cbt_analysis] Получены данные пользователя из заголовков: {user_from_headers}")
                
                # Сохраняем пользователя в сессию
                session['user'] = user_from_headers
                # Сохраняем в БД
                save_user_data(user_from_headers)
            elif 'X-User-Data' in request.headers:
                # Пробуем использовать X-User-Data как JSON
                user_data_json = request.headers.get('X-User-Data')
                print(f"[save_cbt_analysis] Найден заголовок X-User-Data: {user_data_json}")
                try:
                    user_from_headers = json.loads(user_data_json)
                    if 'id' in user_from_headers and 'first_name' in user_from_headers:
                        # Преобразуем id в int если нужно
                        if isinstance(user_from_headers['id'], str):
                            user_from_headers['id'] = int(user_from_headers['id'])
                        # Сохраняем пользователя в сессию
                        session['user'] = user_from_headers
                        # Сохраняем в БД
                        save_user_data(user_from_headers)
                        print(f"[save_cbt_analysis] Данные из JSON сохранены в сессию: {user_from_headers}")
                except json.JSONDecodeError as e:
                    print(f"[save_cbt_analysis] Ошибка декодирования JSON: {e}")
        except Exception as e:
            print(f"[save_cbt_analysis] Ошибка обработки заголовков X-User: {e}")
    
    # Проверяем, авторизован ли пользователь или есть bypass_auth
    bypass_auth = request.args.get('bypass_auth') == '1'
    soft_validation = request.args.get('soft_validation') == '1'
    print(f"[save_cbt_analysis] bypass_auth={bypass_auth}, soft_validation={soft_validation}, session: {'user' in session}")
    
    # Логика для тестового режима (bypass_auth=1)
    if bypass_auth:
        # Если есть bypass_auth, создаем тестового пользователя
        print("[save_cbt_analysis] Используем тестовый режим с bypass_auth=1")
        
        # Проверяем наличие пользователя и при необходимости создаем
        test_user = {
            'id': 12345,
            'first_name': 'Тестовый',
            'last_name': 'Пользователь',
            'username': 'test_user'
        }
        session['user'] = test_user
        print(f"[save_cbt_analysis] Тестовый пользователь добавлен в сессию: {test_user}")
    elif user_from_headers:
        # Пользователь был авторизован из заголовков, продолжаем
        print(f"[save_cbt_analysis] Пользователь авторизован из заголовков: {user_from_headers}")
    elif 'user' not in session or 'id' not in session['user']:
        print("[save_cbt_analysis] Пользователь не авторизован и bypass_auth не активирован")
        return jsonify({
            'success': False,
            'error': 'Пользователь не авторизован'
        }), 401
    
    # Получаем данные из запроса
    data = request.json
    if not data:
        print("[save_cbt_analysis] Отсутствуют данные в запросе")
        return jsonify({
            'success': False,
            'error': 'Отсутствуют данные'
        }), 400
    
    # Проверяем наличие обязательных полей
    required_fields = [
        'situation', 'thoughts', 'emotion', 'emotion_intensity_before',
        'physical_reaction', 'evidence_for', 'evidence_against',
        'rational_perspective', 'emotion_intensity_after', 'future_coping'
    ]
    
    for field in required_fields:
        if field not in data:
            print(f"[save_cbt_analysis] Отсутствует обязательное поле: {field}")
            return jsonify({
                'success': False,
                'error': f'Отсутствует обязательное поле: {field}'
            }), 400
    
    try:
        # Импортируем модели
        from models import CBTAnalysis, User
        from database import get_user_by_telegram_id, db, save_user_data
        
        # Получаем или создаем пользователя
        if bypass_auth:
            # В режиме bypass_auth используем сохраненный в сессии тестовый аккаунт
            print("[save_cbt_analysis] Ищем или создаем тестового пользователя в БД")
            
            user_data = session['user']
            # Сохраняем тестового пользователя в БД
            save_user_data(user_data)
            
            # Получаем пользователя из БД
            user = get_user_by_telegram_id(user_data['id'])
            print(f"[save_cbt_analysis] Получен пользователь из БД: {user}")
        else:
            # В обычном режиме получаем пользователя по ID из сессии
            user = get_user_by_telegram_id(session['user']['id'])
        
        if not user:
            print("[save_cbt_analysis] Пользователь не найден в БД после всех попыток")
            # В тестовом режиме создаем пользователя прямо здесь
            if bypass_auth:
                print("[save_cbt_analysis] Создаем тестового пользователя напрямую через User.create")
                try:
                    from models import User
                    test_user_data = session['user']
                    
                    # Создаем пользователя напрямую
                    user = User(
                        telegram_id=test_user_data['id'],
                        first_name=test_user_data['first_name'],
                        last_name=test_user_data['last_name'],
                        username=test_user_data['username']
                    )
                    db.session.add(user)
                    db.session.commit()
                    print(f"[save_cbt_analysis] Успешно создан пользователь: {user}")
                except Exception as e:
                    print(f"[save_cbt_analysis] Ошибка при создании пользователя: {e}")
                    user = None
            
            # Если пользователь все еще не найден, возвращаем ошибку
            if not user:
                print("[save_cbt_analysis] Невозможно продолжить без пользователя")
                return jsonify({
                    'success': False,
                    'error': 'Пользователь не найден'
                }), 404
        
        # ТЕСТОВЫЙ РЕЖИМ: Если в URL есть параметр force_save=1, то пытаемся сохранить напрямую
        force_save = request.args.get('force_save') == '1'
        if force_save:
            try:
                print("[save_cbt_analysis] Принудительное сохранение данных в тестовом режиме")
                
                # Вывод полученных данных
                print(f"[save_cbt_analysis] Данные для сохранения: {data}")
                
                # Создаем запись прямо в базе
                cbt_analysis = CBTAnalysis(
                    user_id=1,  # Используем ID=1 для тестового режима
                    situation=data.get('situation', 'Тестовая ситуация'),
                    thoughts=data.get('thoughts', 'Тестовые мысли'),
                    emotion=data.get('emotion', 'Тестовая эмоция'),
                    emotion_intensity_before=int(data.get('emotion_intensity_before', 5)),
                    physical_reaction=data.get('physical_reaction', 'Тестовая реакция'),
                    evidence_for=data.get('evidence_for', 'Тестовые доказательства за'),
                    evidence_against=data.get('evidence_against', 'Тестовые доказательства против'),
                    rational_perspective=data.get('rational_perspective', 'Тестовый рациональный взгляд'),
                    emotion_intensity_after=int(data.get('emotion_intensity_after', 3)),
                    future_coping=data.get('future_coping', 'Тестовые стратегии'),
                    created_at=datetime.datetime.now()
                )
                
                db.session.add(cbt_analysis)
                db.session.commit()
                
                print(f"[save_cbt_analysis] Успешно сохранено в тестовом режиме, ID: {cbt_analysis.id}")
                
                return jsonify({
                    'success': True,
                    'message': 'CBT-анализ успешно сохранен (тестовый режим)',
                    'analysis_id': cbt_analysis.id,
                    'note': 'Принудительное сохранение в тестовом режиме'
                })
            except Exception as e:
                print(f"[save_cbt_analysis] Ошибка при принудительном сохранении: {e}")
                # Продолжаем стандартный путь
        
        # Создаем новую запись CBT-анализа
        cbt_analysis = CBTAnalysis(
            user_id=user.id,
            situation=data['situation'],
            thoughts=data['thoughts'],
            emotion=data['emotion'],
            emotion_intensity_before=int(data['emotion_intensity_before']),
            physical_reaction=data['physical_reaction'],
            evidence_for=data['evidence_for'],
            evidence_against=data['evidence_against'],
            rational_perspective=data['rational_perspective'],
            emotion_intensity_after=int(data['emotion_intensity_after']),
            future_coping=data['future_coping'],
            created_at=datetime.datetime.now()
        )
        
        # Сохраняем запись в базу данных
        db.session.add(cbt_analysis)
        db.session.commit()
        
        # Логируем активность
        log_user_activity(user.telegram_id, 'cbt_analysis_saved', {
            'analysis_id': cbt_analysis.id,
            'emotion': data['emotion'],
            'emotion_intensity_before': data['emotion_intensity_before'],
            'emotion_intensity_after': data['emotion_intensity_after']
        })
        
        return jsonify({
            'success': True,
            'message': 'CBT-анализ успешно сохранен',
            'analysis_id': cbt_analysis.id
        })
    
    except Exception as e:
        print(f"Error saving CBT analysis: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.before_request
def log_request():
    """Логирует запросы для отладки"""
    # Выводим информацию о запросе для отладки
    print(f"\n--- Запрос {request.method} {request.path} ---")
    print(f"Заголовки запроса:")
    for header, value in request.headers.items():
        # Скрываем чувствительные данные
        if 'auth' in header.lower() or 'cookie' in header.lower():
            print(f"  {header}: [скрыто]")
        else:
            print(f"  {header}: {value}")
    
    # Выводим данные сессии
    print(f"Сессия: {session}")
    print(f"Cookie: {request.cookies}")

@app.route('/api/mood-data', methods=['GET'])
def get_mood_data():
    """API endpoint для получения данных о настроении пользователя"""
    try:
        # Проверяем авторизацию
        if 'user' not in session:
            # Проверяем параметр soft_validation
            if request.args.get('soft_validation') == '1':
                print("Soft validation: возвращаем пустые данные настроения")
                return jsonify({
                    'success': True,
                    'firstVisitDate': (datetime.datetime.utcnow() - datetime.timedelta(days=28)).date().isoformat(),
                    'moodEntries': []
                })
            return jsonify({
                'success': False,
                'error': 'Пользователь не авторизован'
            }), 401
        
        # Получаем пользователя из базы данных
        from database import get_user_by_telegram_id
        from models import DailyJournal
        
        user = get_user_by_telegram_id(session['user']['id'])
        
        # Проверяем параметр soft_validation
        if not user and request.args.get('soft_validation') == '1':
            print("Soft validation: возвращаем пустые данные настроения")
            return jsonify({
                'success': True,
                'firstVisitDate': (datetime.datetime.utcnow() - datetime.timedelta(days=28)).date().isoformat(),
                'moodEntries': []
            })
        
        # Если пользователь не найден, возвращаем ошибку
        if not user:
            print("❌ Пользователь не найден, возвращаем 401")
            return jsonify({
                'success': False,
                'error': 'Пользователь не найден'
            }), 401
        
        # Получаем все журнальные записи пользователя
        journals = DailyJournal.query.filter_by(user_id=user.id).order_by(DailyJournal.journal_date).all()
        
        # Получаем дату первого посещения
        first_visit_date = user.created_at.date() if user.created_at else (datetime.datetime.utcnow() - datetime.timedelta(days=28)).date()
        
        # Формируем данные для ответа (без оценок дня, которые мы удалили)
        journal_entries = []
        for journal in journals:
            journal_entries.append({
                'date': journal.journal_date.isoformat(),
                'hasEntry': True
            })
        
        # Логируем активность
        log_user_activity(user.telegram_id, 'journal_data_requested', {
            'total_entries': len(journal_entries)
        })
        
        print(f"✅ Успешно возвращаем данные журнала для пользователя {user.id}")
        return jsonify({
            'success': True,
            'firstVisitDate': first_visit_date.isoformat(),
            'journalEntries': journal_entries
        })
    
    except Exception as e:
        print(f"❌ Ошибка при получении данных журнала: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Bot command to open the Mini App
@bot.message_handler(commands=['start'])
def start(message):
    """Handle the /start command"""
    # Сохраняем пользователя из сообщения бота
    user_data = {
        'id': message.from_user.id,
        'first_name': message.from_user.first_name,
        'last_name': message.from_user.last_name,
        'username': message.from_user.username,
        'language_code': message.from_user.language_code if hasattr(message.from_user, 'language_code') else None
    }
    save_user_data(user_data)
    
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
        # Удаляем webhook перед запуском polling
        bot.remove_webhook()
        print("Webhook удален")
        
        # Запускаем polling
        bot.polling(none_stop=True)
    except Exception as e:
        print(f"Bot polling error: {e}")

# API для работы с курсами
@app.route('/api/courses', methods=['GET'])
def get_courses():
    """API endpoint для получения списка курсов"""
    try:
        # Выводим отладочную информацию
        print(f"API/courses: запрос получен, метод: {request.method}")
        print(f"Заголовки: {request.headers}")
        
        # Проверяем, авторизован ли пользователь
        if 'user' not in session:
            # Проверяем наличие заголовка X-User-Data
            user_data_header = request.headers.get('X-User-Data')
            if not user_data_header:
                print("API/courses: нет заголовка X-User-Data, возвращаем 401")
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            
            try:
                # Декодируем данные пользователя из заголовка
                user_data = json.loads(user_data_header)
                session['user'] = user_data
                print(f"API/courses: пользователь авторизован из заголовка: {user_data}")
            except Exception as e:
                print(f"API/courses: ошибка при обработке заголовка: {e}")
                return jsonify({'success': False, 'error': 'Invalid user data'}), 401
        
        # Получаем все курсы из базы данных
        courses = Course.query.all()
        
        # Преобразуем курсы в JSON
        courses_data = [{
            'id': course.id,
            'title': course.title,
            'description': course.description,
            'image_url': course.image_url,
            'lessons_count': len(course.lessons)
        } for course in courses]
        
        print(f"API/courses: успешно отправлено {len(courses_data)} курсов")
        return jsonify({
            'success': True,
            'courses': courses_data
        })
    except Exception as e:
        print(f"API/courses: ошибка: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/courses/<int:course_id>', methods=['GET'])
def get_course(course_id):
    """Получение информации о конкретном курсе и его уроках"""
    try:
        from models import Course, Lesson, UserCourseProgress
        from database import get_user_by_telegram_id
        
        # Проверяем авторизацию
        if 'user' not in session:
            # Проверяем наличие заголовка X-User-Data
            user_data_header = request.headers.get('X-User-Data')
            if user_data_header:
                try:
                    # Декодируем данные пользователя из заголовка
                    user_data = json.loads(user_data_header)
                    
                    # Сохраняем данные пользователя в сессию
                    session['user'] = user_data
                    
                    # Логируем активность
                    if 'id' in user_data:
                        log_user_activity(user_data['id'], 'authentication_header', 
                                        {'user_agent': request.headers.get('User-Agent')})
                except Exception as e:
                    print(f"Error processing user data from header: {e}")
                    return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            else:
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
        # Получаем курс
        course = Course.query.get(course_id)
        if not course:
            return jsonify({
                'success': False,
                'error': 'Course not found'
            }), 404
        
        # Получаем уроки курса, отсортированные по порядку
        lessons = Lesson.query.filter_by(course_id=course_id).order_by(Lesson.order).all()
        
        # Получаем прогресс пользователя по курсу
        user_id = get_user_by_telegram_id(session['user']['id']).id
        progress = UserCourseProgress.query.filter_by(
            user_id=user_id,
            course_id=course_id
        ).first()
        
        # Если прогресс не найден, создаем новый
        if not progress:
            progress = UserCourseProgress(
                user_id=user_id,
                course_id=course_id,
                current_lesson_id=lessons[0].id if lessons else None,
                current_page=1
            )
            db.session.add(progress)
        
        # Преобразуем данные в словари
        course_data = course.to_dict()
        lessons_data = [lesson.to_dict() for lesson in lessons]
        
        # Добавляем информацию о завершенных уроках
        completed_lessons = progress.get_completed_lessons()
        for lesson_data in lessons_data:
            lesson_data['completed'] = lesson_data['id'] in completed_lessons
        
        # Добавляем информацию о прогрессе
        progress_data = {
            'current_lesson_id': progress.current_lesson_id,
            'current_page': progress.current_page,
            'completed_lessons': completed_lessons,
            'progress_percentage': progress.calculate_progress_percentage(len(lessons))
        }
        
        return jsonify({
            'success': True,
            'course': course_data,
            'lessons': lessons_data,
            'progress': progress_data
        })
    except Exception as e:
        print(f"Error fetching course: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/lessons/<int:lesson_id>', methods=['GET'])
def get_lesson(lesson_id):
    """Получение информации о конкретном уроке и его контенте"""
    try:
        from models import Lesson, ContentBlock, UserCourseProgress
        from database import get_user_by_telegram_id
        
        # Проверяем авторизацию
        if 'user' not in session:
            # Проверяем наличие заголовка X-User-Data
            user_data_header = request.headers.get('X-User-Data')
            if user_data_header:
                try:
                    # Декодируем данные пользователя из заголовка
                    user_data = json.loads(user_data_header)
                    
                    # Сохраняем данные пользователя в сессию
                    session['user'] = user_data
                    
                    # Логируем активность
                    if 'id' in user_data:
                        log_user_activity(user_data['id'], 'authentication_header', 
                                        {'user_agent': request.headers.get('User-Agent')})
                except Exception as e:
                    print(f"Error processing user data from header: {e}")
                    return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            else:
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
        # Получаем урок
        lesson = Lesson.query.get(lesson_id)
        if not lesson:
            return jsonify({
                'success': False,
                'error': 'Lesson not found'
            }), 404
        
        # Получаем прогресс пользователя
        user_id = get_user_by_telegram_id(session['user']['id']).id
        progress = UserCourseProgress.query.filter_by(
            user_id=user_id,
            course_id=lesson.course_id
        ).first()
        
        # Если прогресс не найден, создаем новый
        if not progress:
            progress = UserCourseProgress(
                user_id=user_id,
                course_id=lesson.course_id,
                current_lesson_id=lesson_id,
                current_page=1
            )
            db.session.add(progress)
        else:
            # Обновляем текущий урок и страницу
            progress.current_lesson_id = lesson_id
            progress.last_accessed = datetime.datetime.utcnow()
        
        db.session.commit()
        
        # Получаем контент урока, разделенный на страницы
        content_pages = lesson.get_content_pages()
        
        # Преобразуем страницы в формат для отправки клиенту
        pages_data = []
        for page_blocks in content_pages:
            page_data = [block.to_dict() for block in page_blocks]
            pages_data.append(page_data)
        
        # Получаем информацию о текущей странице
        current_page = min(progress.current_page, len(pages_data))
        
        # Получаем информацию о следующем и предыдущем уроках
        next_lesson = Lesson.query.filter(
            Lesson.course_id == lesson.course_id,
            Lesson.order > lesson.order
        ).order_by(Lesson.order).first()
        
        prev_lesson = Lesson.query.filter(
            Lesson.course_id == lesson.course_id,
            Lesson.order < lesson.order
        ).order_by(Lesson.order.desc()).first()
        
        return jsonify({
            'success': True,
            'lesson': lesson.to_dict(),
            'pages': pages_data,
            'total_pages': len(pages_data),
            'current_page': current_page,
            'next_lesson': next_lesson.to_dict() if next_lesson else None,
            'prev_lesson': prev_lesson.to_dict() if prev_lesson else None,
            'is_completed': progress.is_lesson_completed(lesson_id)
        })
    except Exception as e:
        print(f"Error fetching lesson: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/lessons/<int:lesson_id>/page/<int:page_number>', methods=['GET'])
def get_lesson_page(lesson_id, page_number):
    """Получение конкретной страницы урока"""
    try:
        from models import Lesson, UserCourseProgress
        from database import get_user_by_telegram_id
        
        # Проверяем авторизацию
        if 'user' not in session:
            # Проверяем наличие заголовка X-User-Data
            user_data_header = request.headers.get('X-User-Data')
            if user_data_header:
                try:
                    # Декодируем данные пользователя из заголовка
                    user_data = json.loads(user_data_header)
                    
                    # Сохраняем данные пользователя в сессию
                    session['user'] = user_data
                    
                    # Логируем активность
                    if 'id' in user_data:
                        log_user_activity(user_data['id'], 'authentication_header', 
                                        {'user_agent': request.headers.get('User-Agent')})
                except Exception as e:
                    print(f"Error processing user data from header: {e}")
                    return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            else:
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
        # Получаем урок
        lesson = Lesson.query.get(lesson_id)
        if not lesson:
            return jsonify({
                'success': False,
                'error': 'Lesson not found'
            }), 404
        
        # Получаем контент урока, разделенный на страницы
        content_pages = lesson.get_content_pages()
        
        # Проверяем, существует ли запрошенная страница
        if page_number < 1 or page_number > len(content_pages):
            return jsonify({
                'success': False,
                'error': 'Page not found'
            }), 404
        
        # Получаем прогресс пользователя
        user_id = get_user_by_telegram_id(session['user']['id']).id
        progress = UserCourseProgress.query.filter_by(
            user_id=user_id,
            course_id=lesson.course_id
        ).first()
        
        # Обновляем текущую страницу в прогрессе
        if progress:
            progress.current_page = page_number
            progress.last_accessed = datetime.datetime.utcnow()
            db.session.commit()
        
        # Преобразуем блоки страницы в формат для отправки клиенту
        page_data = [block.to_dict() for block in content_pages[page_number - 1]]
        
        return jsonify({
            'success': True,
            'lesson_id': lesson_id,
            'page_number': page_number,
            'total_pages': len(content_pages),
            'content': page_data,
            'is_last_page': page_number == len(content_pages)
        })
    except Exception as e:
        print(f"Error fetching lesson page: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/lessons/<int:lesson_id>/complete', methods=['POST'])
def complete_lesson(lesson_id):
    """Отметить урок как завершенный"""
    # Добавляем начальное логирование
    print(f"[LESSON_COMPLETE] Запрос на завершение урока {lesson_id}")
    
    # Логируем заголовки запроса
    print(f"[LESSON_COMPLETE] Заголовки запроса: {dict(request.headers)}")
    
    try:
        from models import Lesson, UserCourseProgress
        from database import get_user_by_telegram_id
        
        # Проверяем авторизацию
        if 'user' not in session:
            print(f"[LESSON_COMPLETE] Пользователь не в сессии, проверяем заголовок X-User-Data")
            # Проверяем наличие заголовка X-User-Data
            user_data_header = request.headers.get('X-User-Data')
            if user_data_header:
                try:
                    # Декодируем данные пользователя из заголовка
                    user_data = json.loads(user_data_header)
                    print(f"[LESSON_COMPLETE] Получены данные пользователя из заголовка: {user_data}")
                    
                    # Сохраняем данные пользователя в сессию
                    session['user'] = user_data
                    
                    # Логируем активность
                    if 'id' in user_data:
                        log_user_activity(user_data['id'], 'authentication_header', 
                                        {'user_agent': request.headers.get('User-Agent')})
                except Exception as e:
                    print(f"[LESSON_COMPLETE] Ошибка при обработке заголовка X-User-Data: {e}")
                    return jsonify({'success': False, 'error': 'Unauthorized'}), 401
            else:
                print(f"[LESSON_COMPLETE] Отсутствует заголовок X-User-Data")
                return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        else:
            print(f"[LESSON_COMPLETE] Пользователь найден в сессии: {session['user']}")
        
        # Получаем урок
        lesson = Lesson.query.get(lesson_id)
        if not lesson:
            print(f"[LESSON_COMPLETE] Урок с ID {lesson_id} не найден")
            return jsonify({
                'success': False,
                'error': 'Lesson not found'
            }), 404
        
        print(f"[LESSON_COMPLETE] Урок найден: {lesson.title}, курс ID: {lesson.course_id}")
        
        # Получаем прогресс пользователя
        user_id = get_user_by_telegram_id(session['user']['id']).id
        print(f"[LESSON_COMPLETE] ID пользователя в БД: {user_id}")
        
        progress = UserCourseProgress.query.filter_by(
            user_id=user_id,
            course_id=lesson.course_id
        ).first()
        
        # Если прогресс не найден, создаем новый
        if not progress:
            print(f"[LESSON_COMPLETE] Прогресс не найден, создаем новый")
            progress = UserCourseProgress(
                user_id=user_id,
                course_id=lesson.course_id,
                current_lesson_id=lesson_id
            )
            db.session.add(progress)
        else:
            print(f"[LESSON_COMPLETE] Прогресс найден: {progress.id}")
            print(f"[LESSON_COMPLETE] Текущие завершенные уроки: {progress.get_completed_lessons()}")
        
        # Отмечаем урок как завершенный
        print(f"[LESSON_COMPLETE] Отмечаем урок {lesson_id} как завершенный")
        progress.mark_lesson_completed(lesson_id)
        print(f"[LESSON_COMPLETE] Обновленные завершенные уроки: {progress.get_completed_lessons()}")
        
        # Получаем следующий урок
        next_lesson = Lesson.query.filter(
            Lesson.course_id == lesson.course_id,
            Lesson.order > lesson.order
        ).order_by(Lesson.order).first()
        
        # Если есть следующий урок, обновляем текущий урок
        if next_lesson:
            print(f"[LESSON_COMPLETE] Найден следующий урок: {next_lesson.id}")
            progress.current_lesson_id = next_lesson.id
            progress.current_page = 1
        else:
            print(f"[LESSON_COMPLETE] Следующий урок не найден")
        
        # Фиксируем изменения в базе данных
        print(f"[LESSON_COMPLETE] Фиксируем изменения в базе данных")
        db.session.commit()
        print(f"[LESSON_COMPLETE] Изменения зафиксированы успешно")
        
        # Получаем все уроки курса для расчета процента прохождения
        total_lessons = Lesson.query.filter_by(course_id=lesson.course_id).count()
        
        response_data = {
            'success': True,
            'message': 'Lesson marked as completed',
            'next_lesson': next_lesson.to_dict() if next_lesson else None,
            'progress_percentage': progress.calculate_progress_percentage(total_lessons),
            'completed_lessons': progress.get_completed_lessons()
        }
        
        print(f"[LESSON_COMPLETE] Отправляем ответ: {response_data}")
        return jsonify(response_data)
    except Exception as e:
        print(f"[LESSON_COMPLETE] Ошибка при завершении урока: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analyze-response', methods=['POST'])
def analyze_response():
    """API endpoint для анализа полноты ответа пользователя через Mistral API"""
    try:
        # Получаем данные из запроса
        data = request.json
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided',
                'score': 0.7,  # Значение по умолчанию
                'missing': None,
                'follow_up': None
            }), 400
            
        question = data.get('question', '')
        answer = data.get('answer', '')
        question_type = data.get('questionType', 'unknown')
        
        print(f"📝 Получен запрос на анализ ответа:")
        print(f"📝 Тип вопроса: {question_type}")
        print(f"📝 Вопрос: {question}")
        print(f"📝 Ответ: {answer}")
        
        if not question or not answer:
            return jsonify({
                'success': False,
                'error': 'Question or answer missing',
                'score': 0.7,  # Значение по умолчанию
                'missing': None,
                'follow_up': None
            }), 400
        
        # Получаем API ключ Mistral из переменных окружения
        mistral_api_key = os.getenv('MISTRAL_API_KEY')
        
        # Проверяем наличие API ключа
        if not mistral_api_key:
            print("❌ MISTRAL_API_KEY не найден в переменных окружения")
            return jsonify({
                'success': False,
                'error': 'API key not configured',
                'score': 0.7,  # Значение по умолчанию
                'missing': None,
                'follow_up': None
            }), 500
        
        # Формируем базовый промпт
        prompt = f"""Ты анализируешь ответ в КПТ-дневнике.

Вопрос: {question}
Ответ пользователя: {answer}

Тип вопроса: {question_type}

"""

        # Добавляем специфичные критерии для разных типов вопросов
        if question_type == "situation":
            prompt += """Критерии полноты ответа о ситуации:
- Указано МЕСТО и ВРЕМЯ события
- Названы УЧАСТНИКИ ситуации (если применимо)
- Описано конкретное СОБЫТИЕ, а не общие фразы
- Объяснено, почему ситуация важна для пользователя

Примеры: 
- Неполный (0.4): "Поссорился с другом"
- Хороший (0.7): "Вчера на работе поссорился с коллегой из-за несданного проекта"
"""
        elif question_type == "thoughts":
            prompt += """Критерии полноты ответа о мыслях:
- Приведены КОНКРЕТНЫЕ мысли, как они звучали в голове
- Описано НЕСКОЛЬКО мыслей, а не одна
- Показана СВЯЗЬ между ситуацией и возникшими мыслями

Примеры:
- Неполный (0.4): "Я был расстроен"
- Хороший (0.7): "Я подумал: 'Почему всегда я должен отвечать за ошибки других?'"
"""
        elif question_type == "emotions":
            prompt += """Критерии полноты ответа об эмоциях:
- Названы КОНКРЕТНЫЕ эмоции, а не обобщения
- Отмечены СМЕШАННЫЕ эмоции, если они были
- Указана примерная СИЛА эмоций

Примеры:
- Неполный (0.4): "Мне было плохо"
- Хороший (0.7): "Я чувствовал сильную злость и немного страха"
"""
        elif question_type == "body":
            prompt += """Критерии полноты ответа о телесных реакциях:
- Описаны КОНКРЕТНЫЕ физические ощущения
- Указано, в каких ЧАСТЯХ ТЕЛА проявлялись ощущения
- Отмечена СИЛА телесных реакций

Примеры:
- Неполный (0.4): "Мне было физически плохо"
- Хороший (0.7): "У меня сильно напряглись плечи и шея, сердце билось быстрее"
"""
        elif question_type == "evidence_for":
            prompt += """Критерии полноты ответа о доказательствах:
- Приведены ФАКТЫ, а не интерпретации
- Указаны КОНКРЕТНЫЕ примеры или события
- Доказательства ОТНОСЯТСЯ к анализируемой мысли

Примеры:
- Неполный (0.4): "Я всегда прав в таких ситуациях"
- Хороший (0.7): "Коллега действительно не выполнил работу к сроку, о котором мы договаривались"
"""
        elif question_type == "evidence_against":
            prompt += """Критерии полноты ответа о доказательствах против:
- Приведены ФАКТЫ, противоречащие исходной мысли
- Предложены АЛЬТЕРНАТИВНЫЕ объяснения ситуации
- Отмечены СМЯГЧАЮЩИЕ обстоятельства, если они есть

Примеры:
- Неполный (0.4): "Таких фактов нет"
- Хороший (0.7): "Коллега обычно работает хорошо, и у него сейчас сложная ситуация в семье"
"""
        elif question_type == "reframe":
            prompt += """Критерии полноты ответа о переосмыслении:
- Предложен НОВЫЙ взгляд на ситуацию
- Новый взгляд БОЛЕЕ СБАЛАНСИРОВАННЫЙ и реалистичный
- Объяснено, почему новая точка зрения ЛУЧШЕ предыдущей

Примеры:
- Неполный (0.4): "Всё не так плохо"
- Хороший (0.7): "Эта ситуация — рабочий момент, а не катастрофа. Коллега допустил ошибку, но это не значит, что он плохой работник"
"""
        elif question_type == "emotion_change":
            prompt += """Критерии полноты ответа об изменении эмоции:
- Указано, какие ЭМОЦИИ изменились
- Дана ОЦЕНКА по шкале от 1 до 10
- Объяснено, ПОЧЕМУ изменились эмоции

Примеры:Gjg
- Неполный (0.4): "Стало легче"
- Хороший (0.7): "Моя злость уменьшилась с 8 до 5 баллов, потому что я понял, что ситуация не так серьезна"
"""
        elif question_type == "future_plan":
            prompt += """Критерии полноты ответа о плане:
- Предложены КОНКРЕТНЫЕ действия, а не общие намерения
- План напрямую ОТНОСИТСЯ к проблеме
- Описаны РЕАЛЬНЫЕ, выполнимые шаги

Примеры:
- Неполный (0.4): "Буду спокойнее относиться к ошибкам"
- Хороший (0.7): "Я буду проводить еженедельные проверки прогресса команды и помогать тем, кто отстает"
"""
        else:
            prompt += """Критерии полноты ответа:
- Ответ ОТНОСИТСЯ к заданному вопросу
- Ответ содержит КОНКРЕТНЫЕ детали
- Ответ ДОСТАТОЧНО развернутый

Примеры:
- Неполный (0.4): "Всё нормально"
- Хороший (0.7): "Я понял, что нужно быть более внимательным к деталям и лучше планировать время"
"""

        prompt += """Оцени полноту ответа по шкале от 0.0 до 1.0, где:
- 0.0-0.4: Очень неполный ответ
- 0.5-0.6: Частичный ответ
- 0.7-0.8: Хороший, но можно улучшить
- 0.9-1.0: Полный и подробный ответ

Если ответ неполный (оценка ниже 0.7), предложи один конкретный уточняющий вопрос, который поможет пользователю дать более полный ответ, также он должен указывать что именно стоит указать в ответе. Вопрос должен быть дружелюбным и помогающим.

Твой ответ должен быть строго в формате JSON:
{
  "score": число от 0.0 до 1.0,
  "missing": "краткое описание, чего не хватает в ответе",
  "follow_up": "уточняющий вопрос для получения недостающей информации"
}

Если ответ пользователя полный (score >= 0.7), поле "follow_up" должно быть null.
"""

        # Включим возможность временного тестирования без API в разработке
        # при наличии параметра test_mode=1 в запросе
        if data.get('test_mode') == 1:
            print("🔍 Тестовый режим активирован, возвращаем тестовый результат")
            # Возвращаем тестовый результат без обращения к API
            test_result = {
                'score': 0.5, 
                'missing': "Не хватает конкретных деталей и контекста",
                'follow_up': "Можете рассказать подробнее о том, когда и где это произошло?"
            }
            return jsonify(test_result)
            
        # Тестовый режим для проверки уточняющих вопросов
        if data.get('test_follow_up') == 1:
            print("🔍 Режим тестирования уточняющих вопросов активирован")
            # Возвращаем тестовый результат с уточняющим вопросом
            follow_up_questions = {
                "situation": "Расскажите подробнее, где и когда это произошло? Кто еще участвовал в этой ситуации?",
                "thoughts": "Какие конкретные мысли пришли вам в голову? Как они звучали?",
                "body": "В каких частях тела вы ощущали реакции? Насколько они были интенсивными?",
                "evidence_for": "Какие факты или наблюдения подтверждают вашу мысль?",
                "evidence_against": "Есть ли какие-то факты, которые могут противоречить вашей мысли?",
                "reframe": "Как можно взглянуть на эту ситуацию с другой стороны?",
                "future_plan": "Какие конкретные шаги вы могли бы предпринять в следующий раз?"
            }
            
            # Получаем уточняющий вопрос для текущего типа вопроса
            follow_up = follow_up_questions.get(question_type, "Можете рассказать подробнее?")
            
            test_result = {
                'score': 0.4, 
                'missing': "Тестовый режим: Не хватает деталей и конкретики",
                'follow_up': follow_up
            }
            return jsonify(test_result)
        
        try:
            # Формируем запрос к Mistral API
            mistral_api_url = "https://api.mistral.ai/v1/chat/completions"
            
            payload = {
                "model": "mistral-small",
                "messages": [
                    {"role": "system", "content": "Ты - ассистент для когнитивно-поведенческой терапии, который анализирует ответы людей в КПТ-дневнике."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "response_format": {"type": "json_object"}
            }
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {mistral_api_key}"
            }
            
            print(f"🔍 Отправляем запрос к Mistral API")
            # Отправляем запрос к Mistral API
            response = requests.post(mistral_api_url, headers=headers, json=payload)
            
            # Проверяем успешность запроса
            if response.status_code != 200:
                print(f"❌ Ошибка от Mistral API: {response.status_code} - {response.text}")
                
                # Возвращаем резервный результат при ошибке API
                fallback_result = {
                    'score': 0.7,
                    'missing': "Не удалось провести анализ через API",
                    'follow_up': None
                }
                return jsonify(fallback_result)
                
            # Парсим ответ от Mistral
            response_data = response.json()
            print(f"✅ Получен ответ от Mistral API")
            
            # Извлекаем содержимое ответа
            ai_response = response_data['choices'][0]['message']['content']
            
            # Конвертируем строку JSON в объект Python
            analysis_result = json.loads(ai_response)
            
            # Проверяем наличие всех необходимых полей
            if 'score' not in analysis_result:
                analysis_result['score'] = 0.7
            if 'missing' not in analysis_result:
                analysis_result['missing'] = "Информация о недостающих аспектах не доступна"
            if 'follow_up' not in analysis_result:
                analysis_result['follow_up'] = None
                
            # Если оценка >= 0.7, устанавливаем follow_up в None
            if analysis_result['score'] >= 0.7:
                analysis_result['follow_up'] = None
                
            # Добавляем заметные разделители для лучшей видимости в логах
            print("\n==================================================")
            print("🔍🔍🔍 РЕЗУЛЬТАТЫ АНАЛИЗА ОТВЕТА 🔍🔍🔍")
            print("==================================================")
            print(f"📊 Анализ ответа: score={analysis_result['score']}, follow_up={'есть' if analysis_result['follow_up'] else 'нет'}")
            
            # Добавляем более подробный визуальный вывод коэффициента
            score_value = analysis_result['score']
            percentage = int(score_value * 100)
            score_bar = ''
            bar_length = 30  # Увеличиваем длину шкалы для лучшей видимости
            filled_bars = int(score_value * bar_length)
            empty_bars = bar_length - filled_bars
            
            score_bar = '█' * filled_bars + '░' * empty_bars
            
            if score_value >= 0.9:
                score_category = 'ОТЛИЧНЫЙ'
            elif score_value >= 0.7:
                score_category = 'ХОРОШИЙ'
            elif score_value >= 0.5:
                score_category = 'ЧАСТИЧНЫЙ'
            elif score_value >= 0.3:
                score_category = 'НЕПОЛНЫЙ'
            else:
                score_category = 'НЕДОСТАТОЧНЫЙ'
                
            print(f"⭐ ВОПРОС: {question}")
            print(f"⭐ ОТВЕТ ПОЛЬЗОВАТЕЛЯ: {answer}")  
            print(f"⭐ ТИП ВОПРОСА: {question_type}")
            print(f"📏 КОЭФФИЦИЕНТ: {percentage}% [{score_bar}] - {score_category} ОТВЕТ")
            
            if 'missing' in analysis_result and analysis_result['missing']:
                print(f"📋 ЧЕГО НЕ ХВАТАЕТ: {analysis_result['missing']}")
                
            if analysis_result['follow_up']:
                print(f"❓ УТОЧНЯЮЩИЙ ВОПРОС: {analysis_result['follow_up']}")
                
            print(f"📝 РЕШЕНИЕ: {'ПЕРЕХОД К СЛЕДУЮЩЕМУ ВОПРОСУ' if score_value >= 0.7 else 'ЗАДАТЬ УТОЧНЯЮЩИЙ ВОПРОС'} (порог = 0.7)")
            print("==================================================\n")
            
            # Возвращаем результаты анализа
            return jsonify(analysis_result)
            
        except (KeyError, json.JSONDecodeError) as e:
            print(f"❌ Ошибка при обработке ответа от Mistral API: {e}")
            
            # Возвращаем резервный результат при ошибке обработки
            fallback_result = {
                'score': 0.7,
                'missing': "Не удалось обработать результаты анализа",
                'follow_up': None
            }
            return jsonify(fallback_result)
        
    except Exception as e:
        print(f"❌ Общая ошибка в analyze_response: {e}")
        import traceback
        traceback.print_exc()
        
        # Возвращаем дефолтный ответ при ошибке
        fallback_result = {
            'score': 0.7,
            'missing': None,
            'follow_up': None
        }
        return jsonify(fallback_result)

# Запускаем бот только если запускаем приложение напрямую (не через Gunicorn)
if __name__ == '__main__':
    # Start the bot in a separate thread
    bot_thread = threading.Thread(target=run_bot)
    bot_thread.daemon = True
    bot_thread.start()
    
    # Start the Flask app
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)  # Отключаем автоперезагрузку 