from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import json

# Создаем экземпляр SQLAlchemy
db = SQLAlchemy()

class User(db.Model):
    """Модель для хранения данных пользователей Telegram"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    telegram_id = db.Column(db.BigInteger, unique=True, nullable=False)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=True)
    username = db.Column(db.String(100), nullable=True)
    language_code = db.Column(db.String(10), nullable=True)
    is_premium = db.Column(db.Boolean, default=False)
    
    # Поля для отслеживания посещений
    last_visit = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    visit_streak = db.Column(db.Integer, default=1)  # Количество дней подряд
    last_streak_date = db.Column(db.Date, default=datetime.utcnow().date)  # Дата последнего обновления streak
    total_visits = db.Column(db.Integer, default=1)  # Общее количество посещений
    
    # Отношения с другими таблицами
    activities = db.relationship('UserActivity', backref='user', lazy=True)
    visits = db.relationship('UserVisit', backref='user', lazy=True)
    journals = db.relationship('DailyJournal', backref='user', lazy=True)
    cbt_analyses = db.relationship('CBTAnalysis', backref='user', lazy=True)
    course_progress = db.relationship('UserCourseProgress', 
                                    lazy=True,
                                    backref='user_entry',  # Используем другое имя backref
                                    foreign_keys='UserCourseProgress.user_id')
    
    def __repr__(self):
        return f"<User {self.telegram_id}: {self.first_name} {self.last_name or ''}>"
    
    @classmethod
    def get_or_create(cls, telegram_id, first_name, **kwargs):
        """Получить существующего пользователя или создать нового"""
        user = cls.query.filter_by(telegram_id=telegram_id).first()
        
        if user:
            # Обновляем данные пользователя
            user.first_name = first_name
            for key, value in kwargs.items():
                if hasattr(user, key) and value is not None:
                    setattr(user, key, value)
            
            # Обновляем статистику посещений
            now = datetime.utcnow()
            today = now.date()
            
            # Регистрируем новое посещение
            UserVisit.create_visit(user.id, now)
            
            # Увеличиваем общее количество посещений
            user.total_visits += 1
            
            # Обновляем время последнего посещения
            user.last_visit = now
            
            # Обновляем streak только если пользователь заполнил дневник за предыдущий день
            # Это будет происходить в методе DailyJournal.create_journal
            
            db.session.commit()
            return user
        
        # Создаем нового пользователя
        user = cls(
            telegram_id=telegram_id, 
            first_name=first_name, 
            visit_streak=1,
            last_streak_date=datetime.utcnow().date(),
            total_visits=1,
            **kwargs
        )
        db.session.add(user)
        db.session.commit()
        
        # Создаем запись о первом посещении
        UserVisit.create_visit(user.id, datetime.utcnow())
        
        return user
    
    def get_visit_stats(self):
        """Получить статистику посещений"""
        return {
            'streak': self.visit_streak,
            'total_visits': self.total_visits,
            'last_visit': self.last_visit,
            'created_at': self.created_at,
            'days_since_registration': (datetime.utcnow().date() - self.created_at.date()).days
        }
    
    def update_streak(self, journal_date):
        """Обновить streak на основе даты заполнения дневника"""
        today = datetime.utcnow().date()
        
        # Проверяем, что дата дневника не в будущем
        if journal_date > today:
            return False
        
        # Если дневник за сегодня, проверяем был ли заполнен дневник за вчера
        if journal_date == today:
            yesterday = today - timedelta(days=1)
            # Проверяем, есть ли запись в дневнике за вчера
            yesterday_journal = DailyJournal.query.filter_by(
                user_id=self.id, 
                journal_date=yesterday
            ).first()
            
            if yesterday_journal:
                # Если дневник за вчера заполнен и последняя дата streak - вчера,
                # увеличиваем streak
                if self.last_streak_date == yesterday:
                    self.visit_streak += 1
                    self.last_streak_date = today
                    db.session.commit()
                    return True
        
        # Если дневник за прошлую дату, проверяем, нужно ли обновить streak
        if journal_date < today:
            next_day = journal_date + timedelta(days=1)
            # Проверяем, есть ли запись в дневнике за следующий день
            next_day_journal = DailyJournal.query.filter_by(
                user_id=self.id, 
                journal_date=next_day
            ).first()
            
            # Если дневник за следующий день заполнен, обновляем streak
            if next_day_journal:
                # Находим максимальную последовательность дней с дневниками
                current_date = journal_date
                streak_count = 1
                
                while True:
                    next_date = current_date + timedelta(days=1)
                    next_journal = DailyJournal.query.filter_by(
                        user_id=self.id, 
                        journal_date=next_date
                    ).first()
                    
                    if next_journal:
                        streak_count += 1
                        current_date = next_date
                    else:
                        break
                
                # Обновляем streak, если новая последовательность больше текущей
                if streak_count > self.visit_streak:
                    self.visit_streak = streak_count
                    self.last_streak_date = current_date
                    db.session.commit()
                    return True
        
        return False


class UserActivity(db.Model):
    """Модель для хранения активности пользователей"""
    __tablename__ = 'user_activities'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    activity_type = db.Column(db.String(50), nullable=False)
    data = db.Column(db.JSON, nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<UserActivity {self.activity_type} by user {self.user_id}>"
    
    @classmethod
    def log_activity(cls, user_id, activity_type, data=None):
        """Записать активность пользователя"""
        activity = cls(user_id=user_id, activity_type=activity_type, data=data)
        db.session.add(activity)
        db.session.commit()
        return activity


class UserVisit(db.Model):
    """Модель для хранения истории посещений пользователей"""
    __tablename__ = 'user_visits'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    visit_date = db.Column(db.Date, nullable=False)
    visit_time = db.Column(db.DateTime, nullable=False)
    
    def __repr__(self):
        return f"<UserVisit user_id={self.user_id} date={self.visit_date}>"
    
    @classmethod
    def create_visit(cls, user_id, visit_time=None):
        """Создать запись о посещении пользователя"""
        if visit_time is None:
            visit_time = datetime.utcnow()
            
        # Проверяем, есть ли уже запись за сегодня
        today = visit_time.date()
        existing_visit = cls.query.filter_by(
            user_id=user_id, 
            visit_date=today
        ).first()
        
        if existing_visit:
            # Обновляем время последнего посещения за сегодня
            existing_visit.visit_time = visit_time
            db.session.commit()
            return existing_visit
        
        # Создаем новую запись о посещении
        visit = cls(
            user_id=user_id,
            visit_date=today,
            visit_time=visit_time
        )
        db.session.add(visit)
        db.session.commit()
        return visit


class DailyJournal(db.Model):
    """Модель для хранения записей КПТ-дневника"""
    __tablename__ = 'daily_journals'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    journal_date = db.Column(db.Date, nullable=False)
    situation = db.Column(db.Text, nullable=True)  # Описание ситуации
    emotions = db.Column(db.Text, nullable=True)  # Эмоции
    rational_response = db.Column(db.Text, nullable=True)  # Рациональный ответ
    result = db.Column(db.Text, nullable=True)  # Результат
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<DailyJournal user_id={self.user_id} date={self.journal_date}>"
    
    @classmethod
    def get_journal_for_date(cls, user_id, date=None):
        """Получить запись дневника за указанную дату"""
        if date is None:
            date = datetime.utcnow().date()
            
        return cls.query.filter_by(
            user_id=user_id,
            journal_date=date
        ).first()
    
    @classmethod
    def create_or_update_journal(cls, user_id, situation=None, emotions=None, 
                                rational_response=None, result=None, journal_date=None):
        """Создать или обновить запись дневника"""
        if journal_date is None:
            journal_date = datetime.utcnow().date()
            
        # Проверяем, существует ли уже запись за эту дату
        journal = cls.query.filter_by(
            user_id=user_id,
            journal_date=journal_date
        ).first()
        
        if journal:
            # Обновляем существующую запись
            if situation is not None:
                journal.situation = situation
            if emotions is not None:
                journal.emotions = emotions
            if rational_response is not None:
                journal.rational_response = rational_response
            if result is not None:
                journal.result = result
            journal.updated_at = datetime.utcnow()
        else:
            # Создаем новую запись
            journal = cls(
                user_id=user_id,
                journal_date=journal_date,
                situation=situation,
                emotions=emotions,
                rational_response=rational_response,
                result=result
            )
            db.session.add(journal)
        
        db.session.commit()
        
        # Обновляем streak пользователя
        user = User.query.get(user_id)
        if user:
            user.update_streak(journal_date)
        
        return journal
    
    @classmethod
    def get_recent_journals(cls, user_id, limit=7):
        """Получить последние записи дневника пользователя"""
        return cls.query.filter_by(user_id=user_id).order_by(
            cls.journal_date.desc()
        ).limit(limit).all()
    
    def is_complete(self):
        """Проверить, заполнены ли все поля дневника"""
        return (
            self.situation and
            self.emotions and
            self.rational_response and
            self.result
        )


class CBTAnalysis(db.Model):
    """Модель для хранения результатов когнитивно-поведенческого анализа"""
    __tablename__ = 'cbt_analyses'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    situation = db.Column(db.Text, nullable=False)  # Описание ситуации
    thoughts = db.Column(db.Text, nullable=False)  # Мысли в момент ситуации
    emotion = db.Column(db.String(100), nullable=False)  # Выбранная эмоция
    emotion_intensity_before = db.Column(db.Integer, nullable=False)  # Интенсивность эмоции до анализа (1-10)
    physical_reaction = db.Column(db.Text, nullable=False)  # Физическая реакция
    evidence_for = db.Column(db.Text, nullable=False)  # Доказательства в пользу мысли
    evidence_against = db.Column(db.Text, nullable=False)  # Доказательства против мысли
    rational_perspective = db.Column(db.Text, nullable=False)  # Рациональный взгляд на ситуацию
    emotion_intensity_after = db.Column(db.Integer, nullable=False)  # Интенсивность эмоции после анализа (1-10)
    future_coping = db.Column(db.Text, nullable=False)  # Стратегии на будущее
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<CBTAnalysis {self.id}: {self.emotion}>'
    
    def get_intensity_change(self):
        """Возвращает изменение интенсивности эмоции"""
        return self.emotion_intensity_before - self.emotion_intensity_after
    
    def to_dict(self):
        """Преобразует запись в словарь для API"""
        return {
            'id': self.id,
            'situation': self.situation,
            'thoughts': self.thoughts,
            'emotion': self.emotion,
            'emotion_intensity_before': self.emotion_intensity_before,
            'physical_reaction': self.physical_reaction,
            'evidence_for': self.evidence_for,
            'evidence_against': self.evidence_against,
            'rational_perspective': self.rational_perspective,
            'emotion_intensity_after': self.emotion_intensity_after,
            'future_coping': self.future_coping,
            'intensity_change': self.get_intensity_change(),
            'created_at': self.created_at.isoformat()
        }


class Course(db.Model):
    """Модель для курса"""
    __tablename__ = 'courses'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    image_url = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Отношения
    lessons = db.relationship('Lesson', backref='course', lazy=True)
    
    def to_dict(self):
        """Преобразует объект в словарь"""
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'image_url': self.image_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'lessons_count': len(self.lessons)
        }


class Lesson(db.Model):
    """Модель для урока"""
    __tablename__ = 'lessons'
    
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    image_url = db.Column(db.String(255))
    duration_minutes = db.Column(db.Integer, default=5)  # Примерная длительность в минутах
    order = db.Column(db.Integer, default=0)  # Порядок урока в курсе
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Отношения
    content_blocks = db.relationship('ContentBlock', backref='lesson', lazy=True, order_by='ContentBlock.order')
    
    def to_dict(self):
        """Преобразует объект в словарь"""
        return {
            'id': self.id,
            'course_id': self.course_id,
            'title': self.title,
            'description': self.description,
            'image_url': self.image_url,
            'duration_minutes': self.duration_minutes,
            'order': self.order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def get_content_pages(self):
        """Разделяет контент урока на страницы с учетом ограничения ~900 символов"""
        pages = []
        current_page = []
        current_length = 0
        
        for block in self.content_blocks:
            # Если блок - заголовок, добавляем его в текущую страницу
            if block.block_type == 'heading':
                current_page.append(block)
                current_length += len(block.content)
            # Если блок - параграф
            elif block.block_type == 'paragraph':
                # Если текущая страница пуста или есть место для параграфа
                if not current_page or current_length + len(block.content) <= 900:
                    current_page.append(block)
                    current_length += len(block.content)
                else:
                    # Завершаем текущую страницу и начинаем новую
                    pages.append(current_page)
                    current_page = [block]
                    current_length = len(block.content)
        
        # Добавляем последнюю страницу, если она не пуста
        if current_page:
            pages.append(current_page)
        
        return pages


class ContentBlock(db.Model):
    """Модель для блока контента урока"""
    __tablename__ = 'content_blocks'
    
    id = db.Column(db.Integer, primary_key=True)
    lesson_id = db.Column(db.Integer, db.ForeignKey('lessons.id'), nullable=False)
    block_type = db.Column(db.String(50), nullable=False)  # 'heading' или 'paragraph'
    content = db.Column(db.Text, nullable=False)
    order = db.Column(db.Integer, default=0)  # Порядок блока в уроке
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Преобразует объект в словарь"""
        return {
            'id': self.id,
            'lesson_id': self.lesson_id,
            'block_type': self.block_type,
            'content': self.content,
            'order': self.order
        }


class UserCourseProgress(db.Model):
    """Модель для отслеживания прогресса пользователя по курсу"""
    __tablename__ = 'user_course_progress'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    current_lesson_id = db.Column(db.Integer, db.ForeignKey('lessons.id'))
    current_page = db.Column(db.Integer, default=1)  # Текущая страница в уроке
    completed_lessons = db.Column(db.Text, default='[]')  # JSON-список ID завершенных уроков
    last_accessed = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Отношения
    user = db.relationship('User', 
                         foreign_keys=[user_id],
                         backref=db.backref('user_progress', lazy=True),
                         overlaps="user_entry,course_progress")
    course = db.relationship('Course')
    current_lesson = db.relationship('Lesson')
    
    def get_completed_lessons(self):
        """Возвращает список ID завершенных уроков"""
        try:
            return json.loads(self.completed_lessons)
        except:
            return []
    
    def set_completed_lessons(self, lesson_ids):
        """Устанавливает список ID завершенных уроков"""
        self.completed_lessons = json.dumps(list(set(lesson_ids)))
    
    def mark_lesson_completed(self, lesson_id):
        """Отмечает урок как завершенный"""
        completed = self.get_completed_lessons()
        if lesson_id not in completed:
            completed.append(lesson_id)
            self.set_completed_lessons(completed)
    
    def is_lesson_completed(self, lesson_id):
        """Проверяет, завершен ли урок"""
        return lesson_id in self.get_completed_lessons()
    
    def calculate_progress_percentage(self, total_lessons):
        """Вычисляет процент прохождения курса"""
        if total_lessons == 0:
            return 0
        return (len(self.get_completed_lessons()) / total_lessons) * 100
    
    def to_dict(self):
        """Преобразует объект в словарь"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'course_id': self.course_id,
            'current_lesson_id': self.current_lesson_id,
            'current_page': self.current_page,
            'completed_lessons': self.get_completed_lessons(),
            'last_accessed': self.last_accessed.isoformat() if self.last_accessed else None
        } 