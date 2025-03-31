from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

app = Flask(__name__)
CORS(app)  # Разрешаем CORS для всех маршрутов

# Константы
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
MISTRAL_API_KEY = os.getenv('MISTRAL_API_KEY')

@app.route('/api/mistral-proxy', methods=['POST'])
def mistral_proxy():
    print("=== Новый запрос к Mistral API ===")
    try:
        # Получаем данные из запроса
        data = request.json
        print("Входящие данные:", data)

        # Проверяем наличие API ключа
        if not MISTRAL_API_KEY:
            raise ValueError("MISTRAL_API_KEY не установлен в .env файле")

        # Делаем запрос к Mistral
        response = requests.post(
            MISTRAL_API_URL,
            json=data,
            headers={
                "Authorization": f"Bearer {MISTRAL_API_KEY}",
                "Content-Type": "application/json"
            }
        )

        # Проверяем статус ответа
        response.raise_for_status()
        
        result = response.json()
        print("Ответ от Mistral:", result)
        return jsonify(result)

    except requests.exceptions.RequestException as e:
        error_msg = f"Ошибка при запросе к Mistral API: {str(e)}"
        print(error_msg)
        return jsonify({"error": error_msg}), 500
    except Exception as e:
        error_msg = f"Неожиданная ошибка: {str(e)}"
        print(error_msg)
        return jsonify({"error": error_msg}), 500

@app.route('/api/test', methods=['GET'])
def test():
    """Тестовый endpoint для проверки работоспособности сервера"""
    return jsonify({"status": "ok", "message": "Прокси-сервер работает"})

if __name__ == '__main__':
    # Проверяем наличие API ключа при запуске
    if not MISTRAL_API_KEY:
        print("Внимание: MISTRAL_API_KEY не установлен в .env файле")
    
    print("Запуск прокси-сервера на http://localhost:5000")
    app.run(port=5000, debug=True)
