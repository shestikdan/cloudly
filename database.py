import os
from models import db, User, UserActivity
from datetime import datetime

def init_db(app):
    """Инициализирует базу данных и создаёт таблицы"""
    # Настройка пути к базе данных
    basedir = os.path.abspath(os.path.dirname(__file__))
    db_path = os.path.join(basedir, 'telegram_app.db')
    
    # Конфигурация базы данных
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Инициализация базы данных с приложением
    db.init_app(app)
    
    # Создание таблиц в контексте приложения
    with app.app_context():
        db.create_all()
        print("База данных инициализирована.")


def save_user_data(user_data):
    """Сохраняет или обновляет данные пользователя в базе данных"""
    if not user_data or not isinstance(user_data, dict) or 'id' not in user_data:
        print("Неверные данные пользователя:", user_data)
        return None
    
    # Получаем обязательные и опциональные поля
    telegram_id = user_data.get('id')
    first_name = user_data.get('first_name', 'Unknown')
    
    # Опциональные поля
    kwargs = {
        'last_name': user_data.get('last_name'),
        'username': user_data.get('username'),
        'language_code': user_data.get('language_code'),
        'is_premium': user_data.get('is_premium', False)
    }
    
    try:
        # Начинаем транзакцию
        db.session.begin_nested()
        
        # Пытаемся найти пользователя с блокировкой строки
        user = User.query.filter_by(telegram_id=telegram_id).with_for_update().first()
        
        if user:
            # Обновляем данные существующего пользователя
            user.first_name = first_name
            for key, value in kwargs.items():
                if hasattr(user, key) and value is not None:
                    setattr(user, key, value)
            
            # Обновляем статистику посещений
            now = datetime.utcnow()
            
            # Регистрируем новое посещение
            UserActivity.log_activity(
                user_id=user.id, 
                activity_type='login', 
                data={'source': 'telegram_webapp'}
            )
            
            # Увеличиваем общее количество посещений
            user.total_visits += 1
            user.last_visit = now
        else:
            # Создаем нового пользователя
            user = User(
                telegram_id=telegram_id,
                first_name=first_name,
                visit_streak=1,
                last_streak_date=datetime.utcnow().date(),
                total_visits=1,
                **kwargs
            )
            db.session.add(user)
        
        # Фиксируем изменения
        db.session.commit()
        print(f"Пользователь успешно сохранен/обновлен: {user}")
        return user
        
    except Exception as e:
        print(f"Ошибка при сохранении пользователя: {e}")
        db.session.rollback()
        
        # Пытаемся вернуть существующего пользователя
        try:
            return User.query.filter_by(telegram_id=telegram_id).first()
        except:
            return None


def get_user_by_telegram_id(telegram_id):
    """Получает пользователя по его Telegram ID"""
    try:
        return User.query.filter_by(telegram_id=telegram_id).first()
    except Exception as e:
        print(f"Ошибка при получении пользователя: {e}")
        return None


def log_user_activity(telegram_id, activity_type, data=None):
    """Записывает активность пользователя по его Telegram ID"""
    try:
        user = get_user_by_telegram_id(telegram_id)
        if not user:
            print(f"Пользователь с Telegram ID {telegram_id} не найден")
            return None
        
        return UserActivity.log_activity(user.id, activity_type, data)
    except Exception as e:
        print(f"Ошибка при логировании активности пользователя: {e}")
        return None 