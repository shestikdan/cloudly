# -*- coding: utf-8 -*-
import sys
sys.path.append('.')
from app import app
from models import db, Course, Lesson, ContentBlock

def create_test_course():
    """Создает курс по КПТ-дневнику с уроками и контентом"""
    # Настраиваем путь к базе данных
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///telegram_app.db'
    
    with app.app_context():
        # Очищаем существующие данные
        ContentBlock.query.delete()
        Lesson.query.delete()
        Course.query.delete()
        db.session.commit()
        
        # Создаем курс
        course = Course(
            title="КПТ-дневник: инструмент осознанности",
            description="Изучите основы когнитивно-поведенческой терапии и научитесь вести КПТ-дневник для улучшения психического состояния.",
            image_url="https://example.com/cbt-journal.jpg"
        )
        db.session.add(course)
        db.session.flush()
        
        # Создаем уроки
        lessons = [
            {
                "title": "Введение в КПТ-дневник",
                "description": "История появления и основные принципы КПТ-дневника",
                "duration_minutes": 2,
                "order": 1
            },
            {
                "title": "Как работает КПТ-дневник",
                "description": "Практические примеры использования КПТ-дневника",
                "duration_minutes": 3,
                "order": 2
            },
            {
                "title": "Структура записи в КПТ-дневнике",
                "description": "Подробный разбор компонентов КПТ-записи",
                "duration_minutes": 2,
                "order": 3
            },
            {
                "title": "Практика ведения дневника",
                "description": "Рекомендации по ежедневному ведению КПТ-дневника",
                "duration_minutes": 3,
                "order": 4
            },
            {
                "title": "Особенности и преимущества",
                "description": "Сравнение с обычным дневником и преимущества метода",
                "duration_minutes": 2,
                "order": 5
            }
        ]
        
        created_lessons = {}
        for lesson_data in lessons:
            lesson = Lesson(
                course_id=course.id,
                **lesson_data
            )
            db.session.add(lesson)
            db.session.flush()
            created_lessons[lesson.order] = lesson.id
        
        # Создаем контент для уроков
        content_blocks = [
            # Урок 1: Введение в КПТ-дневник
            {
                "lesson_id": created_lessons[1],
                "blocks": [
                    {"block_type": "heading", "content": "Что такое КПТ-дневник и как он появился?", "order": 1},
                    {"block_type": "paragraph", "content": "КПТ-дневник (Когнитивно-поведенческая терапия) — это инструмент для самонаблюдения, который помогает отслеживать свои мысли, эмоции и поведение, а затем анализировать их, чтобы улучшить психическое состояние.", "order": 2},
                    {"block_type": "paragraph", "content": "CBT (Cognitive Behavioral Therapy) была разработана в 1960-х годах американским психиатром Аароном Беком. Он работал с пациентами, страдающими депрессией, и заметил, что негативные мысли влияют на их эмоции и поведение. Вместо того чтобы фокусироваться на бессознательных конфликтах (как в психоанализе), Бек предложил метод работы с мыслями и установками, которые можно осознанно изменить.", "order": 3},
                    {"block_type": "heading", "content": "Основная идея КПТ", "order": 4},
                    {"block_type": "paragraph", "content": "\"Не событие вызывает наши эмоции, а то, как мы это событие воспринимаем.\"", "order": 5},
                    {"block_type": "heading", "content": "Пример", "order": 6},
                    {"block_type": "paragraph", "content": "Если ты получил низкую оценку за проект, ты можешь подумать: \"Я полный неудачник\" — это вызовет грусть и тревогу.\n\nНо если ты скажешь себе: \"Я сделал ошибку, но это возможность научиться и улучшиться\", — ты почувствуешь мотивацию.", "order": 7}
                ]
            },
            # Урок 2: Как работает КПТ-дневник
            {
                "lesson_id": created_lessons[2],
                "blocks": [
                    {"block_type": "heading", "content": "Как работает КПТ-дневник?", "order": 1},
                    {"block_type": "paragraph", "content": "Каждый день мы сталкиваемся с разными ситуациями, которые вызывают у нас эмоции. Однако проблема в том, что наш мозг часто интерпретирует эти события через призму негативных мыслей и когнитивных искажений (ошибок мышления).", "order": 2},
                    {"block_type": "paragraph", "content": "КПТ-дневник помогает:\n1. Заметить эти мысли\n2. Проанализировать, какие эмоции они вызывают\n3. Найти логические ошибки в мышлении\n4. Заменить негативные мысли на более здоровые и реалистичные", "order": 3},
                    {"block_type": "heading", "content": "Пример на реальной ситуации", "order": 4},
                    {"block_type": "paragraph", "content": "Ситуация: Ты отправил резюме в компанию и получил отказ.\n\nОбычная реакция:\n- Мысль: \"Я никому не нужен. Я никогда не найду работу.\"\n- Эмоция: Тревога, грусть, разочарование (8/10)\n- Поведение: Опускаются руки, нет желания отправлять другие резюме", "order": 5},
                    {"block_type": "heading", "content": "Запись в КПТ-дневнике", "order": 6},
                    {"block_type": "paragraph", "content": "1. Ситуация: Отказ на вакансию\n2. Мысль: \"Я никому не нужен\"\n3. Эмоция: Тревога — 8/10\n4. Когнитивное искажение - Обобщение: \"Если один отказ, значит, я никчёмен.\"\n5. Альтернативная мысль: Это всего один отказ. У меня есть ещё возможности.\"\n6. Результат: Тревога снизилась до 4/10, появилась мотивация отправить новое резюме.", "order": 7}
                ]
            },
            # Урок 3: Структура записи в КПТ-дневнике
            {
                "lesson_id": created_lessons[3],
                "blocks": [
                    {"block_type": "heading", "content": "Структура записи в КПТ-дневнике", "order": 1},
                    {"block_type": "heading", "content": "1. Ситуация", "order": 2},
                    {"block_type": "paragraph", "content": "Опиши, что случилось.\nПример: На работе начальник критиковал мою презентацию.", "order": 3},
                    {"block_type": "heading", "content": "2. Мысли", "order": 4},
                    {"block_type": "paragraph", "content": "Какие мысли появились у тебя в этот момент?\nПример: \"Я никогда не справлюсь с этой работой. Я некомпетентен.\"", "order": 5},
                    {"block_type": "heading", "content": "3. Эмоции", "order": 6},
                    {"block_type": "paragraph", "content": "Что ты почувствовал? Оцени уровень эмоций от 0 до 10.\nПример: Тревога – 8/10, грусть – 6/10.", "order": 7},
                    {"block_type": "heading", "content": "4. Когнитивные искажения", "order": 8},
                    {"block_type": "paragraph", "content": "Определи, в чём логическая ошибка.\nПример: Катастрофизация (я преувеличиваю масштабы неудачи).", "order": 9},
                    {"block_type": "heading", "content": "5. Альтернативные мысли", "order": 10},
                    {"block_type": "paragraph", "content": "Как можно посмотреть на ситуацию по-другому?\nПример: \"Я сделал несколько ошибок, но это опыт для улучшения. У меня уже были успешные проекты.\"", "order": 11},
                    {"block_type": "heading", "content": "6. Результат", "order": 12},
                    {"block_type": "paragraph", "content": "Что ты чувствуешь после того, как переосмыслил ситуацию?\nПример: Тревога снизилась до 4/10, появилось чувство уверенности.", "order": 13}
                ]
            },
            # Урок 4: Практика ведения дневника
            {
                "lesson_id": created_lessons[4],
                "blocks": [
                    {"block_type": "heading", "content": "Как вести КПТ-дневник каждый день", "order": 1},
                    {"block_type": "paragraph", "content": "1. Записывай ситуации, которые вызвали сильные эмоции\n2. Оцени свои мысли и найди когнитивные искажения\n3. Замени негативные установки на более реалистичные\n4. Отмечай, как изменилось твоё состояние", "order": 2},
                    {"block_type": "heading", "content": "Зачем это нужно?", "order": 3},
                    {"block_type": "paragraph", "content": "- Уменьшает тревогу и стресс\n- Помогает контролировать негативные мысли\n- Повышает самооценку\n- Помогает принимать более осознанные решения", "order": 4},
                    {"block_type": "heading", "content": "Почему это работает?", "order": 5},
                    {"block_type": "paragraph", "content": "Наш мозг склонен \"перекручивать\" реальность через негативные фильтры. КПТ-дневник помогает этому противостоять:\n\n- Мы перестаем верить в ложные убеждения\n- Учимся отличать факты от эмоций\n- Постепенно формируем более здоровое мышление", "order": 6}
                ]
            },
            # Урок 5: Особенности и преимущества
            {
                "lesson_id": created_lessons[5],
                "blocks": [
                    {"block_type": "heading", "content": "Чем КПТ-дневник отличается от обычного дневника?", "order": 1},
                    {"block_type": "heading", "content": "Обычный дневник:", "order": 2},
                    {"block_type": "paragraph", "content": "1. Просто фиксирует события\n2. Основан на эмоциях\n3. Может усиливать негативные переживания", "order": 3},
                    {"block_type": "heading", "content": "КПТ-дневник:", "order": 4},
                    {"block_type": "paragraph", "content": "1. Помогает анализировать мысли и эмоции\n2. Основан на логике и доказательствах\n3. Помогает менять мышление и улучшать настроение", "order": 5},
                    {"block_type": "heading", "content": "Заключение", "order": 6},
                    {"block_type": "paragraph", "content": "КПТ-дневник — это мощный инструмент для работы с мыслями и эмоциями. Он помогает справляться с тревогой, депрессией и стрессом, а также развивает осознанность. Регулярное ведение такого дневника позволяет постепенно менять мышление, делая его более здоровым и позитивным.", "order": 7}
                ]
            }
        ]
        
        # Добавляем контент для уроков
        for content_data in content_blocks:
            lesson_id = content_data["lesson_id"]
            for block_data in content_data["blocks"]:
                content_block = ContentBlock(
                    lesson_id=lesson_id,
                    block_type=block_data["block_type"],
                    content=block_data["content"],
                    order=block_data["order"]
                )
                db.session.add(content_block)
        
        # Сохраняем все изменения
        db.session.commit()
        print("Курс по КПТ-дневнику успешно создан в базе данных!")

if __name__ == "__main__":
    create_test_course() 