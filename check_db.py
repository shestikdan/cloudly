from app import app; from models import CBTAnalysis; with app.app_context(): print(CBTAnalysis.query.count())
